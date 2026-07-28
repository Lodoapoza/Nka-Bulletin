const express = require('express');
const db = require('../db');
const { encrypt } = require('../crypto');
const { PROVIDER_PRESETS } = require('../imapService');
const { ImapFlow } = require('imapflow');

const router = express.Router();

// Liste des comptes connectés pour cet appareil
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, provider, label, email, last_sync_at, created_at FROM accounts WHERE device_id = ?'
  ).all(req.deviceId);
  res.json(rows);
});

/**
 * Ajoute un compte de messagerie. Pour Gmail/Yahoo/Outlook : l'utilisateur fournit un
 * "mot de passe d'application" (app password), qui est la méthode réelle et supportée par ces
 * fournisseurs pour l'accès IMAP tiers (l'app ne demande jamais le mot de passe principal du compte).
 * Pour IMAP personnalisé : host/port/secure sont fournis explicitement.
 */
router.post('/', async (req, res) => {
  const { provider, label, email, password, host, port, secure } = req.body;
  if (!provider || !email || !password) {
    return res.status(400).json({ error: 'provider, email et password sont requis' });
  }

  const preset = PROVIDER_PRESETS[provider];
  const imapHost = preset ? preset.host : host;
  const imapPort = preset ? preset.port : Number(port) || 993;
  const imapSecure = preset ? preset.secure : secure !== false;

  if (!imapHost) {
    return res.status(400).json({ error: 'host requis pour un compte IMAP personnalisé' });
  }

  // Vérification réelle de connexion avant d'enregistrer, pour éviter de stocker des identifiants invalides
  try {
    const testClient = new ImapFlow({
      host: imapHost, port: imapPort, secure: imapSecure,
      auth: { user: email, pass: password }, logger: false,
    });
    await testClient.connect();
    await testClient.logout();
  } catch (e) {
    return res.status(400).json({ error: `Connexion IMAP impossible : ${e.message}` });
  }

  const encryptedCredentials = encrypt(password);
  const info = db.prepare(`
    INSERT INTO accounts (device_id, provider, label, email, imap_host, imap_port, imap_secure, encrypted_credentials)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.deviceId, provider, label || email, email, imapHost, imapPort, imapSecure ? 1 : 0, encryptedCredentials);

  res.status(201).json({ id: info.lastInsertRowid, provider, label: label || email, email });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM accounts WHERE id = ? AND device_id = ?').run(req.params.id, req.deviceId);
  if (info.changes === 0) return res.status(404).json({ error: 'Compte introuvable' });
  res.json({ ok: true });
});

module.exports = router;
