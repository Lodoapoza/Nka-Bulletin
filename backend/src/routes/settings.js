const express = require('express');
const db = require('../db');
const { rescheduleDevice } = require('../scheduler');

const router = express.Router();

router.get('/', (req, res) => {
  const row = db.prepare(
    'SELECT id, sync_hour, sync_frequency, extract_amounts FROM devices WHERE id = ?'
  ).get(req.deviceId);
  res.json(row);
});

router.put('/', (req, res) => {
  const { syncHour, syncFrequency, extractAmounts } = req.body;
  db.prepare(`
    UPDATE devices SET
      sync_hour = COALESCE(?, sync_hour),
      sync_frequency = COALESCE(?, sync_frequency),
      extract_amounts = COALESCE(?, extract_amounts)
    WHERE id = ?
  `).run(
    syncHour ?? null,
    syncFrequency ?? null,
    typeof extractAmounts === 'boolean' ? (extractAmounts ? 1 : 0) : null,
    req.deviceId
  );
  rescheduleDevice(req.deviceId);
  const updated = db.prepare('SELECT sync_hour, sync_frequency, extract_amounts FROM devices WHERE id = ?').get(req.deviceId);
  res.json(updated);
});

module.exports = router;
