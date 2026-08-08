const express = require('express');
const db = require('../db');

const router = express.Router();

// Reset non destructif de l'appareil : détache les bulletins (account_id -> NULL,
// ils restent partagés avec les autres appareils du user via user_matricule) et
// supprime les données propres à l'appareil (accounts, logs, requests, push, device).
// Idempotent : si le device n'existe pas, répond quand même { ok: true }.
router.delete('/', (req, res) => {
  const deviceId = req.deviceId;

  const tx = db.transaction(() => {
    // Détache les bulletins du compte de l'appareil sans les supprimer
    // (ni leurs fichiers PDF) : ils restent accessibles aux autres devices du user.
    db.prepare(
      `UPDATE bulletins SET account_id = NULL WHERE account_id IN (
         SELECT id FROM accounts WHERE device_id = ?
       )`
    ).run(deviceId);
    db.prepare('DELETE FROM accounts WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM sync_logs WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM sync_requests WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
  });

  tx();
  res.json({ ok: true });
});

module.exports = router;