const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/run', (req, res) => {
  try {
    const existing = db.prepare(
      "SELECT id FROM sync_requests WHERE device_id = ? AND status IN ('pending','running')"
    ).get(req.deviceId);
    if (existing) {
      db.prepare("UPDATE sync_requests SET status = 'cancelled', completed_at = ? WHERE id = ?")
        .run(new Date().toISOString(), existing.id);
    }
    const info = db.prepare("INSERT INTO sync_requests (device_id) VALUES (?)").run(req.deviceId);
    res.json({ ok: true, queued: true, requestId: info.lastInsertRowid });
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
