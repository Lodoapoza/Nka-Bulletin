import { Router } from 'express';
import crypto from 'crypto';
import { getSetting, updateSetting } from '../db.js';

const router = Router();

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const SESSION_TOKENS = new Map();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

// GET /api/auth/password/status
router.get('/status', (req, res) => {
  try {
    const hash = getSetting('password_hash');
    const salt = getSetting('password_salt');
    res.json({ hasPassword: !!(hash && salt) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/password/setup
router.post('/setup', (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 4 caractères' });
    }

    const existing = getSetting('password_hash');
    if (existing) {
      return res.status(400).json({ error: 'Un mot de passe est déjà configuré' });
    }

    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    const hash = hashPassword(password, salt);

    updateSetting('password_hash', hash);
    updateSetting('password_salt', salt);

    const token = generateToken();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    SESSION_TOKENS.set(token, { createdAt: Date.now(), expiresAt });

    res.json({ success: true, token, expiresAt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/password/verify
router.post('/verify', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

    const hash = getSetting('password_hash');
    const salt = getSetting('password_salt');

    if (!hash || !salt) {
      return res.status(400).json({ error: 'Aucun mot de passe configuré' });
    }

    const computedHash = hashPassword(password, salt);
    if (computedHash !== hash) {
      return res.status(401).json({ error: 'Mot de passe incorrect', valid: false });
    }

    const token = generateToken();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    SESSION_TOKENS.set(token, { createdAt: Date.now(), expiresAt });

    res.json({ success: true, valid: true, token, expiresAt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/password/change
router.post('/change', (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 4 caractères' });
    }

    const hash = getSetting('password_hash');
    const salt = getSetting('password_salt');

    const computedHash = hashPassword(oldPassword, salt);
    if (computedHash !== hash) {
      return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
    }

    const newSalt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);

    updateSetting('password_hash', newHash);
    updateSetting('password_salt', newSalt);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/password/session-check
router.post('/session-check', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.json({ valid: false });
    }

    const session = SESSION_TOKENS.get(token);
    if (!session || session.expiresAt < Date.now()) {
      SESSION_TOKENS.delete(token);
      return res.json({ valid: false });
    }

    res.json({ valid: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Clean expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of SESSION_TOKENS) {
    if (session.expiresAt < now) SESSION_TOKENS.delete(token);
  }
}, 3600000);

export default router;
