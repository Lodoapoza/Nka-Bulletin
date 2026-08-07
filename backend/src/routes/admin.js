const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// ----- Authentification admin (X-Admin-Token) -----
// Comparaison en temps constant du hash SHA-256 pour éviter les attaques par timing.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('[admin] FATAL: ADMIN_PASSWORD manquant ou trop court dans .env');
  process.exit(1);
}
const ADMIN_HASH = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();

function adminAuth(req, res, next) {
  const token = String(req.headers['x-admin-token'] || '');
  if (!token) return res.status(401).json({ error: 'Token admin requis' });
  const tokenHash = crypto.createHash('sha256').update(token).digest();
  const ok = tokenHash.length === ADMIN_HASH.length && crypto.timingSafeEqual(tokenHash, ADMIN_HASH);
  if (!ok) return res.status(401).json({ error: 'Token admin invalide' });
  next();
}

function normalizeMatricule(raw) {
  return String(raw || '').trim().toUpperCase();
}

// Licence active ? (status 'active' ET pas expirée ; expires_at NULL = illimité)
function hasActiveLicence(matricule) {
  if (!matricule) return false;
  const row = db.prepare('SELECT status, expires_at FROM licenses WHERE matricule = ?').get(matricule);
  if (!row || row.status !== 'active') return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}

// Gate d'accès par licence : bloque un appareil qui déclare un matricule sans licence active.
function licenceGate(req, res, next) {
  const device = db.prepare('SELECT owner_matricule FROM devices WHERE id = ?').get(req.deviceId);
  const mat = device && device.owner_matricule;
  if (mat && !hasActiveLicence(mat)) {
    return res.status(403).json({
      error: 'Votre abonnement est expiré ou révoqué. Contactez votre administrateur.',
      code: 'LICENCE_EXPIRED',
      matricule: mat,
    });
  }
  next();
}

// --- Routes admin -----

// Autoriser un matricule : body { matricule, months? } — months absent/0 = illimité.
router.post('/license/grant', adminAuth, (req, res) => {
  const matricule = normalizeMatricule(req.body.matricule);
  if (!matricule) return res.status(400).json({ error: 'Matricule requis' });

  let months = null;
  if (req.body.months !== undefined && req.body.months !== null) {
    months = Number(req.body.months);
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      return res.status(400).json({ error: 'months doit être un entier entre 1 et 120, ou absent pour illimité' });
    }
  }

  let expiresAt = null;
  if (months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    expiresAt = d.toISOString();
  }

  db.prepare(
    `INSERT INTO licenses (matricule, granted_by, months, expires_at, status)
     VALUES (?, 'admin', ?, ?, 'active')
     ON CONFLICT(matricule) DO UPDATE SET
       granted_by = 'admin', months = excluded.months, expires_at = excluded.expires_at,
       status = 'active'`
  ).run(matricule, months, expiresAt);

  res.json({ ok: true, matricule, months, expires_at: expiresAt });
});

// Révoguer : body { matricule } — marque status='revoked' (l'appareil est immédiatement bloqué).
router.post('/license/revoke', adminAuth, (req, res) => {
  const matricule = normalizeMatricule(req.body.matricule);
  if (!matricule) return res.status(400).json({ error: 'Matricule requis' });
  const r = db.prepare("UPDATE licenses SET status = 'revoked' WHERE matricule = ?").run(matricule);
  if (r.changes === 0) return res.status(404).json({ error: 'Aucune licence pour ce matricule' });
  res.json({ ok: true, matricule, status: 'revoked' });
});

// Liste des licences : matricule, statut (active/expired/revoked), durée, dates, origine.
router.get('/license/list', adminAuth, (req, res) => {
  const now = Date.now();
  const rows = db.prepare('SELECT * FROM licenses ORDER BY matricule').all();
  const list = rows.map((r) => {
    let state = r.status;
    if (state === 'active' && r.expires_at && new Date(r.expires_at).getTime() <= now) state = 'expired';
    return {
      id: r.id,
      matricule: r.matricule,
      state,
      granted_by: r.granted_by,
      months: r.months,
      granted_at: r.created_at,
      expires_at: r.expires_at, // null = illimité
    };
  });
  res.json({ ok: true, count: list.length, licenses: list });
});

module.exports = { router, licenceGate, hasActiveLicence };