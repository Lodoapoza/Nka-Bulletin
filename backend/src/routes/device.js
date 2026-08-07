const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();

// Reset complet de l'appareil : supprime toutes les données liées au device_id.
// Idempotent : si le device n'existe pas, répond quand même { ok: true }.
router.delete('/device', (req, res) => {
  const deviceId = req.deviceId;

  const tx = db.transaction(() => {
    // Récupère les chemins des PDF avant suppression des lignes.
    const files = db.prepare(
      `SELECT filepath FROM bulletins WHERE account_id IN (
         SELECT id FROM accounts WHERE device_id = ?
       )`
    ).all(deviceId);

    // Supprime les fichiers PDF (best-effort, ne bloque pas la réponse).
    for (const row of files) {
      if (row.filepath) {
        try { fs.unlinkSync(path.resolve(row.filepath)); } catch (_) {}
      }
    }

    db.prepare(
      `DELETE FROM bulletins WHERE account_id IN (
         SELECT id FROM accounts WHERE device_id = ?
       )`
    ).run(deviceId);
    db.prepare('DELETE FROM accounts WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM sync_logs WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM sync_requests WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
  });

  tx();
  res.json({ ok: true });
});

module.exports = router;