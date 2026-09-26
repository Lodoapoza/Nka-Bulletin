const express = require('express');
const fs = require('fs');
const db = require('../db');

const router = express.Router();

// Reset non destructif d'un appareil : détache les bulletins (account_id -> NULL,
// ils restent partagés avec les autres appareils du user via user_matricule) et
// supprime les données propres à l'appareil (accounts, logs, requests, push, device).
// Idempotent : si le device n'existe pas, ne fait rien (DELETE sans effet).
// Utilisée par DELETE / (reset manuel) et par les éjections automatiques de
// l'appareil le plus ancien quand la limite de 3 appareils est atteinte (auth.js,
// accounts.js) — implémentation UNIQUE.
// Avec full=true : supprime aussi les bulletins et PDFs du user (matricule).
function resetDeviceData(deviceId, full = false) {
  const warnings = [];
  const tx = db.transaction(() => {
    if (full) {
      // Suppression définitive de toutes les données synchronisées du compte.
      const device = db.prepare('SELECT user_matricule FROM devices WHERE id = ?').get(deviceId);
      const mat = device?.user_matricule;
      const rows = mat
        ? db.prepare('SELECT id, filepath FROM bulletins WHERE user_matricule = ?').all(mat)
        : db.prepare('SELECT id, filepath FROM bulletins WHERE device_id = ?').all(deviceId);
      for (const row of rows) db.prepare('DELETE FROM bulletins WHERE id = ?').run(row.id);
      for (const row of rows) {
        try { if (row.filepath) fs.unlinkSync(row.filepath); } catch (e) {
          console.warn(`[device] PDF non supprimé (${row.id}):`, e.message);
          warnings.push({ bulletinId: row.id, code: 'PDF_CLEANUP_PENDING' });
        }
      }
      if (mat) {
        db.prepare('DELETE FROM accounts WHERE device_id IN (SELECT id FROM devices WHERE user_matricule = ?)').run(mat);
        db.prepare('DELETE FROM sync_logs WHERE device_id IN (SELECT id FROM devices WHERE user_matricule = ?)').run(mat);
        db.prepare('DELETE FROM sync_requests WHERE device_id IN (SELECT id FROM devices WHERE user_matricule = ?)').run(mat);
        db.prepare('DELETE FROM push_subscriptions WHERE device_id IN (SELECT id FROM devices WHERE user_matricule = ?)').run(mat);
        db.prepare('DELETE FROM devices WHERE user_matricule = ?').run(mat);
        return;
      }
    } else {
      // Détache les bulletins du compte de l'appareil sans les supprimer
      // (ni leurs fichiers PDF) : ils restent accessibles aux autres devices du user.
      db.prepare(
        `UPDATE bulletins SET account_id = NULL WHERE account_id IN (
           SELECT id FROM accounts WHERE device_id = ?
         )`
      ).run(deviceId);
    }
    db.prepare('DELETE FROM accounts WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM sync_logs WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM sync_requests WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
  });

  tx();
  return warnings;
}

router.delete('/', (req, res) => {
  const full = req.query.full === '1' || req.query.full === 'true';
  try {
    const warnings = resetDeviceData(req.deviceId, full);
    res.json({ ok: true, full, warnings });
  } catch (e) {
    console.error('[device] Réinitialisation impossible:', e);
    res.status(500).json({ ok: false, error: 'Réinitialisation impossible', code: 'RESET_FAILED' });
  }
});

// Exposé aux autres routes (auth.js, accounts.js) pour l'éjection automatique.
router.resetDeviceData = resetDeviceData;

module.exports = router;
