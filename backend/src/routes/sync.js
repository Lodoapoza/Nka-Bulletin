const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/run', (req, res) => {
  try {
    // Dédoublonnage : on annule uniquement les requêtes encore en attente ('pending').
    // Une requête 'running' n'est jamais annulée : le nouveau 'pending' sera
    // traité à sa suite (sûr et acceptable).
    const existing = db.prepare(
      "SELECT id FROM sync_requests WHERE device_id = ? AND status = 'pending'"
    ).get(req.deviceId);
    if (existing) {
      db.prepare("UPDATE sync_requests SET status = 'cancelled', completed_at = ? WHERE id = ? AND status = 'pending'")
        .run(new Date().toISOString(), existing.id);
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
    const info = db.prepare("INSERT INTO sync_requests (device_id, full_scan, scan_year) VALUES (?, ?, ?)")
      .run(req.deviceId, scanYear ? 0 : fullScan, scanYear);
    res.json({ ok: true, queued: true, requestId: info.lastInsertRowid, full_scan: !!fullScan, scan_year: scanYear });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/status', (req, res) => {
  const row = db.prepare(
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
