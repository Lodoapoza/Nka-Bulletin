const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { resetDeviceData } = require('./device');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('[auth] FATAL: JWT_SECRET manquant ou trop court dans .env');
  process.exit(1);
}

/**
 * Le code PIN est un verrou LOCAL sur l'appareil (aucun compte externe n'est créé, conformément
 * au cahier des charges). Le backend a seulement besoin de savoir quel "appareil" (device_id,
 * UUID généré une fois par le frontend et stocké dans IndexedDB) fait la requête, afin de
 * cloisonner les données. On délivre donc un token de session lié au device_id, pas à un mot de passe.
 * L'accès au compte se fait par email (3 appareils maximum par compte).
 */
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register-device', (req, res) => {
  if (req.body.deviceId && !uuidRegex.test(req.body.deviceId)) {
    return res.status(400).json({ error: 'deviceId invalide (doit être un UUID)' });
  }
  const deviceId = req.body.deviceId || crypto.randomUUID();
  const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(deviceId);
  if (!existing) {
    db.prepare('INSERT INTO devices (id) VALUES (?)').run(deviceId);
  }
  const token = jwt.sign({ deviceId }, JWT_SECRET, { expiresIn: '180d' });
  res.json({ deviceId, token });
});

/**
 * Connexion par email : rattache l'appareil au compte correspondant.
 * - Email inconnu → création du user (le premier appareil = propriétaire).
 * - Email connu → rattachement de l'appareil au compte existant.
 * - Limite : 3 appareils maximum par compte.
 */
router.post('/login-email', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (req.body.deviceId && !uuidRegex.test(req.body.deviceId)) {
    return res.status(400).json({ error: 'deviceId invalide (doit être un UUID)' });
  }
  const deviceId = req.body.deviceId || crypto.randomUUID();

  let user = db.prepare('SELECT matricule FROM users WHERE lower(email) = ?').get(email);
  let isNewUser = false;
  if (!user) {
    // Génération d'un matricule unique 'U' + 8 caractères alphanumériques majuscules
    // (boucle avec vérification d'existence pour éviter les collisions).
    let matricule = null;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let attempt = 0; attempt < 5 && !matricule; attempt++) {
      let candidate = 'U';
      for (let i = 0; i < 8; i++) {
        candidate += chars[Math.floor(Math.random() * chars.length)];
      }
      if (!db.prepare('SELECT matricule FROM users WHERE matricule = ?').get(candidate)) {
        matricule = candidate;
      }
    }
    if (!matricule) {
      return res.status(500).json({ error: 'Impossible de générer un matricule unique' });
    }
    db.prepare('INSERT INTO users (matricule, email) VALUES (?, ?)').run(matricule, email);
    user = { matricule };
    isNewUser = true;
  }

  // Limite de 3 appareils par compte (l'appareil courant, s'il est déjà rattaché,
  // n'est pas compté : un re-login sur le même appareil reste possible).
  // Depuis la décision produit : éjection AUTOMATIQUE de l'appareil le plus ancien
  // au lieu d'un refus 403 — le nouveau se connecte, l'ancien est déconnecté
  // (reset local complet via resetDeviceData).
  let ejected = false;
  const { n } = db.prepare(
    'SELECT COUNT(*) AS n FROM devices WHERE user_matricule = ? AND id != ?'
  ).get(user.matricule, deviceId);
  if (n >= 3) {
    const oldest = db.prepare(
      'SELECT id FROM devices WHERE user_matricule = ? AND id != ? ORDER BY created_at ASC LIMIT 1'
    ).get(user.matricule, deviceId);
    if (oldest) {
      resetDeviceData(oldest.id);
      ejected = true;
    } else {
      // Cas incohérent (compte plein mais aucun appareil trouvable) : 403 en secours.
      return res.status(403).json({
        error: 'Limite de 3 appareils atteinte pour ce compte. Retirez un appareil depuis Réglages.',
        code: 'DEVICE_LIMIT',
      });
    }
  }

  // Upsert device + rattachement au matricule
  db.prepare('INSERT OR IGNORE INTO devices (id) VALUES (?)').run(deviceId);
  db.prepare('UPDATE devices SET user_matricule = ? WHERE id = ?').run(user.matricule, deviceId);
  // Premier appareil = propriétaire (licenceGate s'appuie sur owner_matricule)
  if (isNewUser) {
    db.prepare('UPDATE devices SET owner_matricule = ? WHERE id = ?').run(user.matricule, deviceId);
  }

  const token = jwt.sign({ deviceId }, JWT_SECRET, { expiresIn: '180d' });
  res.json({ deviceId, token, matricule: user.matricule, isNewUser, ...(ejected && { ejected: true }) });
});

/**
 * Attache un email à un compte existant (grandfathered : comptes créés avant le
 * login par email, qui n'ont pas d'email en base). Permet à un appareil déjà lié
 * de renseigner son email pour se connecter depuis un autre appareil.
 */
router.post('/set-email', authMiddleware, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (!req.userMatricule) {
    return res.status(400).json({ error: 'Aucun compte lié à cet appareil' });
  }
  const conflict = db.prepare(
    'SELECT matricule FROM users WHERE lower(email) = ? AND matricule != ?'
  ).get(email, req.userMatricule);
  if (conflict) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte' });
  }
  db.prepare('UPDATE users SET email = ? WHERE matricule = ?').run(email, req.userMatricule);
  res.json({ ok: true, email });
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.deviceId = payload.deviceId;
    // Multi-appareils : expose le matricule user du device (NULL si non lié à un user).
    // Résolu depuis la DB, PAS dans le JWT — les tokens existants (180j) restent valides.
    const dev = db.prepare('SELECT user_matricule, owner_matricule FROM devices WHERE id = ?').get(req.deviceId);
    req.userMatricule = (dev && dev.user_matricule) || (dev && dev.owner_matricule) || null;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

module.exports = { router, authMiddleware };
