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
    const fullScan = req.body && req.body.full_scan ? 1 : 0;
    const info = db.prepare("INSERT INTO sync_requests (device_id, full_scan) VALUES (?, ?)").run(req.deviceId, fullScan);
    res.json({ ok: true, queued: true, requestId: info.lastInsertRowid, full_scan: !!fullScan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/status', (req, res) => {
  const row = db.prepare(
    "SELECT id, status, new_bulletins, error_message, completed_at FROM sync_requests WHERE device_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1"
  ).get(req.deviceId);
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
