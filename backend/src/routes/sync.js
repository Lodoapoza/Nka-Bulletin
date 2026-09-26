const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requestSync } = require('../syncJobs');

const router = express.Router();

// Rate limit spécifique pour /sync/run : max 10 requêtes / 10 min par device
// (clé = device_id depuis authMiddleware, pas l'IP)
const syncRunLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.deviceId || req.ip,
  message: { error: 'Trop de demandes de synchronisation, réessayez plus tard', code: 'SYNC_RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // on compte toutes les tentatives
});

router.post('/run', syncRunLimiter, (req, res) => {
  try {
    const accounts = req.userMatricule
      ? db.prepare(`
          SELECT a.id FROM accounts a
          JOIN devices d ON d.id = a.device_id
          WHERE a.device_id = ? OR d.user_matricule = ?
        `).all(req.deviceId, req.userMatricule)
      : db.prepare('SELECT id FROM accounts WHERE device_id = ?').all(req.deviceId);
    if (!accounts.length) {
      return res.status(409).json({
        error: 'Aucun compte e-mail configure. Connectez une boite mail dans Reglages avant de lancer une synchronisation.',
        code: 'NO_MAIL_ACCOUNT',
      });
    }
    // full_scan : force un scan complet (35 ans) quelle que soit la valeur de
    // last_sync_at. Le flag voyage avec la requête jusqu'au worker, ce qui évite
    // la race condition où un reset (last_sync_at = NULL) est écrasé par une sync
    // en cours qui réécrit last_sync_at progressivement.
    // scan_year : recherche ciblée sur une année précise (modale dashboard).
    // Une année valide prend la précédence sur full_scan (fenêtre plus courte).
    const fullScan = req.body && req.body.full_scan ? 1 : 0;
    const nowYear = new Date().getFullYear();
    const reqYear = req.body ? Number(req.body.year) : NaN;
    const scanYear = Number.isInteger(reqYear) && reqYear >= 1990 && reqYear <= nowYear + 1 ? reqYear : null;
    const job = requestSync(req.deviceId, { fullScan: !scanYear && !!fullScan });
    if (scanYear && job.status === 'pending' && !job.reused) {
      db.prepare('UPDATE sync_requests SET scan_year = ? WHERE id = ?').run(scanYear, job.id);
    }
    res.json({ ok: true, queued: job.status !== 'done', requestId: job.id, reused: job.reused, full_scan: job.fullScan, scan_year: scanYear });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/status', (req, res) => {
  const requestedId = Number(req.query.id);
  const row = Number.isInteger(requestedId) && requestedId > 0
    ? db.prepare(
      "SELECT id, status, new_bulletins, error_message, completed_at, cursor, phase FROM sync_requests WHERE device_id = ? AND id = ?"
    ).get(req.deviceId, requestedId)
    : db.prepare(
      "SELECT id, status, new_bulletins, error_message, completed_at, cursor, phase FROM sync_requests WHERE device_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1"
    ).get(req.deviceId);
  if (row && row.cursor) {
    // cursor contient la progression JSON { chunk, total, year, found } écrite
    // par le worker pendant le scan. On l'expose en objet prêt à l'emploi ;
    // un JSON invalide est ignoré silencieusement.
    try { row.progress = JSON.parse(row.cursor); } catch (_) { row.progress = null; }
    delete row.cursor;
  }
  res.json(row || { status: 'none' });
});

router.post('/reset', (req, res) => {
  const info = db.prepare('UPDATE accounts SET last_sync_at = NULL WHERE device_id = ?');
  const result = info.run(req.deviceId);
  res.json({ ok: true, reset: result.changes });
});

router.get('/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM sync_logs WHERE device_id = ? ORDER BY ran_at DESC LIMIT 20').all(req.deviceId);
  res.json(rows);
});

module.exports = { router };
