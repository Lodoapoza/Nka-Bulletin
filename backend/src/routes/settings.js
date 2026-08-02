const express = require('express');
const db = require('../db');
const { rescheduleDevice } = require('../scheduler');

const router = express.Router();

router.get('/', (req, res) => {
  const row = db.prepare(
    'SELECT id, sync_hour, sync_frequency, extract_amounts, owner_matricule FROM devices WHERE id = ?'
  ).get(req.deviceId);
  res.json(row);
});

router.put('/', (req, res) => {
  const { syncHour, syncFrequency, extractAmounts, ownerMatricule } = req.body;
  db.prepare(`
    UPDATE devices SET
      sync_hour = COALESCE(?, sync_hour),
      sync_frequency = COALESCE(?, sync_frequency),
      extract_amounts = COALESCE(?, extract_amounts),
      owner_matricule = COALESCE(?, owner_matricule)
    WHERE id = ?
  `).run(
    syncHour ?? null,
    syncFrequency ?? null,
    typeof extractAmounts === 'boolean' ? (extractAmounts ? 1 : 0) : null,
    (typeof ownerMatricule === 'string' && ownerMatricule.trim()) ? ownerMatricule.trim().toUpperCase() : (ownerMatricule === '' ? '' : null),
    req.deviceId
  );
  rescheduleDevice(req.deviceId);
  const updated = db.prepare('SELECT sync_hour, sync_frequency, extract_amounts, owner_matricule FROM devices WHERE id = ?').get(req.deviceId);
  res.json(updated);
});

module.exports = router;
