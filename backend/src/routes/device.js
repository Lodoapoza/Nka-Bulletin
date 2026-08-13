const express = require('express');
const db = require('../db');

const router = express.Router();

// Reset non destructif d'un appareil : détache les bulletins (account_id -> NULL,
// ils restent partagés avec les autres appareils du user via user_matricule) et
// supprime les données propres à l'appareil (accounts, logs, requests, push, device).
// Idempotent : si le device n'existe pas, ne fait rien (DELETE sans effet).
// Utilisée par DELETE / (reset manuel) et par les éjections automatiques de
// l'appareil le plus ancien quand la limite de 3 appareils est atteinte (auth.js,
// accounts.js) — implémentation UNIQUE.
function resetDeviceData(deviceId) {
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
}

router.delete('/', (req, res) => {
  resetDeviceData(req.deviceId);
  res.json({ ok: true });
});

// Exposé aux autres routes (auth.js, accounts.js) pour l'éjection automatique.
router.resetDeviceData = resetDeviceData;

module.exports = router;
