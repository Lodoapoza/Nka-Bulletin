import { Router } from 'express';
import { getAccountById } from '../db.js';
import { fetchPayrollBulletins } from '../mail/fetcher.js';
import { refreshAccessToken } from '../auth/index.js';

const router = Router();

// In-memory sync status store
const syncStatus = new Map();

// POST /api/mail/sync/:accountId — trigger sync for an account
router.post('/sync/:accountId', async (req, res) => {
  try {
    const account = getAccountById(req.params.accountId);
    if (!account) return res.status(404).json({ error: 'Compte introuvable' });

    const { year, month } = req.body || {};

    // Refresh access token if needed (for OAuth providers)
    if (account.provider !== 'imap' && account.refresh_token) {
      const now = Date.now();
      if (!account.expiry_date || account.expiry_date < now + 300000) {
        try {
          const tokens = await refreshAccessToken(account);
          account.access_token = tokens.access_token;
        } catch (err) {
          return res.status(401).json({ error: `Impossible de rafraîchir le token: ${err.message}` });
        }
      }
    }

    // Start sync in background
    syncStatus.set(req.params.accountId, {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      bulletins: []
    });

    // Return immediately, sync runs async
    res.json({
      message: 'Synchronisation démarrée',
      accountId: req.params.accountId
    });

    // Execute sync
    try {
      const newBulletins = await fetchPayrollBulletins(account, { year, month });
      syncStatus.set(req.params.accountId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        bulletins: newBulletins,
        count: newBulletins.length
      });
    } catch (err) {
      syncStatus.set(req.params.accountId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: err.message
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mail/sync/status/:accountId — get sync status
router.get('/sync/status/:accountId', (req, res) => {
  const status = syncStatus.get(req.params.accountId) || {
    status: 'idle',
    bulletins: []
  };
  res.json({ accountId: req.params.accountId, ...status });
});

export default router;
