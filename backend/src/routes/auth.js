const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { hashLinkCode, verifyLinkCode } = require('../crypto');

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
 */
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const linkCodeRegex = /^[A-Z0-9]{6}$/;

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
 * Liaison d'un appareil à un matricule via un code de liaison (6 caractères alphanumériques).
 * - Matricule inconnu → création du user (le premier appareil = propriétaire).
 * - Matricule connu → vérification du code (scrypt, timingSafeEqual). Échec → 401 avec le
 *   MÊME message que pour un matricule inconnu, pour ne pas leak l'existence du matricule.
 * Le code n'est jamais stocké en clair (seulement { salt, hash } scrypt en base64).
 */
router.post('/link-device', (req, res) => {
  const matricule = String(req.body.matricule || '').trim().toUpperCase();
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!matricule) return res.status(400).json({ error: 'Matricule requis' });
  if (!linkCodeRegex.test(code)) {
    return res.status(400).json({ error: 'Code de liaison invalide (6 caractères alphanumériques)' });
  }
  if (req.body.deviceId && !uuidRegex.test(req.body.deviceId)) {
    return res.status(400).json({ error: 'deviceId invalide (doit être un UUID)' });
  }
  const deviceId = req.body.deviceId || crypto.randomUUID();

  const user = db.prepare('SELECT matricule, link_code_salt, link_code_hash FROM users WHERE matricule = ?').get(matricule);
  let isNewUser = false;
  if (!user) {
    const { salt, hash } = hashLinkCode(code);
    db.prepare('INSERT INTO users (matricule, link_code_salt, link_code_hash) VALUES (?, ?, ?)').run(matricule, salt, hash);
    isNewUser = true;
  } else if (!verifyLinkCode(code, user.link_code_salt, user.link_code_hash)) {
    return res.status(401).json({ error: 'Code de liaison invalide' });
  }

  // Upsert device + rattachement au matricule
  db.prepare('INSERT OR IGNORE INTO devices (id) VALUES (?)').run(deviceId);
  db.prepare('UPDATE devices SET user_matricule = ? WHERE id = ?').run(matricule, deviceId);
  // Premier appareil = propriétaire (licenceGate s'appuie sur owner_matricule)
  if (isNewUser) {
    db.prepare('UPDATE devices SET owner_matricule = ? WHERE id = ?').run(matricule, deviceId);
  }

  const token = jwt.sign({ deviceId }, JWT_SECRET, { expiresIn: '180d' });
  res.json({ deviceId, token, matricule, isNewUser });
});

/**
 * Création/rotation du code de liaison par un appareil déjà authentifié (grandfathered).
 * Le device doit être rattaché à un matricule (req.userMatricule résolu par authMiddleware).
 */
router.post('/set-link-code', authMiddleware, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!linkCodeRegex.test(code)) {
    return res.status(400).json({ error: 'Code de liaison invalide (6 caractères alphanumériques)' });
  }
  if (!req.userMatricule) {
    return res.status(400).json({ error: 'Matricule introuvable pour cet appareil' });
  }
  const { salt, hash } = hashLinkCode(code);
  db.prepare('UPDATE users SET link_code_salt = ?, link_code_hash = ? WHERE matricule = ?').run(salt, hash, req.userMatricule);
  res.json({ ok: true });
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
