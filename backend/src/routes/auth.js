import { Router } from 'express';
import { getAccounts, getAccountById, insertAccount, deleteAccount, updateAccountTokens } from '../db.js';
import { getProvider } from '../auth/index.js';
import { verifyConnection as verifyImap, saveConfig as saveImapConfig } from '../auth/imap.js';

const router = Router();

// GET /api/auth/accounts — list all connected accounts
router.get('/accounts', (req, res) => {
  try {
    const accounts = getAccounts();
    // Strip sensitive tokens from response
    const safe = accounts.map(a => ({
      ...a,
      refresh_token: a.refresh_token ? '***' : null,
      access_token: a.access_token ? '***' : null
    }));
    res.json(safe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/auth/accounts/:id
router.delete('/accounts/:id', (req, res) => {
  try {
    const deleted = deleteAccount(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/imap/verify — test IMAP connection
router.post('/imap/verify', async (req, res) => {
  try {
    const { host, port, user, password, useTls } = req.body;
    if (!host || !port || !user || !password) {
      return res.status(400).json({ error: 'Champs requis: host, port, user, password' });
    }
    const result = await verifyImap({ host, port, user, password, useTls });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/imap/save — save IMAP account configuration
router.post('/imap/save', async (req, res) => {
  try {
    const { email, host, port, user, password, useTls } = req.body;
    if (!email || !host || !port || !user || !password) {
      return res.status(400).json({ error: 'Champs requis: email, host, port, user, password' });
    }

    const config = saveImapConfig({ email, host, port, user, password, useTls });

    const account = insertAccount({
      email: config.email,
      provider: 'imap',
      config_json: config.config_json
    });

    res.status(201).json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/:provider/login — generate OAuth URL
router.get('/:provider/login', (req, res) => {
  try {
    const { provider } = req.params;
    const authModule = getProvider(provider);

    if (!authModule.getAuthUrl) {
      return res.status(400).json({ error: `Le fournisseur ${provider} ne supporte pas OAuth` });
    }

    const state = encodeURIComponent(JSON.stringify({ provider }));
    const url = authModule.getAuthUrl(state);
    res.json({ url, provider });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/:provider/callback — handle OAuth callback
router.get('/:provider/callback', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Code d\'autorisation manquant' });
    }

    const authModule = getProvider(provider);

    if (!authModule.handleCallback) {
      return res.status(400).json({ error: `Le fournisseur ${provider} ne supporte pas OAuth` });
    }

    const profile = await authModule.handleCallback(code);

    const account = insertAccount({
      email: profile.email,
      provider,
      refresh_token: profile.refresh_token,
      access_token: profile.access_token,
      expiry_date: profile.expiry_date
    });

    res.json({ success: true, account });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
