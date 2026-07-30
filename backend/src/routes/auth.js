const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

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

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.deviceId = payload.deviceId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

module.exports = { router, authMiddleware };
