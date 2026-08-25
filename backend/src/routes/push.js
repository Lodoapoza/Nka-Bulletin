const express = require('express');
const webpush = require('web-push');
const db = require('../db');

const router = express.Router();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL || 'mailto:contact@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[push] VAPID keys manquantes — les notifications push sont désactivées');
}

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

router.post('/subscribe', (req, res) => {
  const subscription = req.body.subscription;
  if (!subscription) return res.status(400).json({ error: 'subscription requise' });
  const subJson = JSON.stringify(subscription);
  // Legacy : abonnement stocké sur le device.
  db.prepare('UPDATE devices SET push_subscription = ? WHERE id = ?')
    .run(subJson, req.deviceId);
  // Multi-appareils : abonnement rattaché au user (un device = une ligne, upsert).
  // req.userMatricule est NULL si le device n'est pas lié à un user → on garde le legacy.
  if (req.userMatricule) {
    db.prepare(`
      INSERT INTO push_subscriptions (user_matricule, device_id, subscription) VALUES (?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        subscription = excluded.subscription,
        user_matricule = excluded.user_matricule
    `).run(req.userMatricule, req.deviceId, subJson);
  }
  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').run(req.deviceId);
  db.prepare('UPDATE devices SET push_subscription = NULL WHERE id = ?').run(req.deviceId);
  res.json({ ok: true });
});

// Notification test : vérifie en 5 secondes que le push fonctionne réellement
// sur l'appareil (abonnement valide + service worker + autorisation OS).
router.post('/test', async (req, res) => {
  const device = db.prepare('SELECT push_subscription, user_matricule FROM devices WHERE id = ?').get(req.deviceId);
  if (!device) return res.status(404).json({ error: 'Appareil inconnu' });

  const payload = { title: 'Nka Bulletin', body: 'Notification test : les notifications fonctionnent.' };
  let sent = 0;
  let lastError = null;

  // Cible prioritaire : la subscription du device courant ; sinon celles du user.
  if (device.push_subscription) {
    try {
      await sendNotification(JSON.parse(device.push_subscription), payload);
      sent++;
    } catch (err) {
      lastError = err.statusCode ? `push rejeté (${err.statusCode})` : (err.message || 'échec envoi');
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        db.prepare('UPDATE devices SET push_subscription = NULL WHERE id = ?').run(req.deviceId);
      }
    }
  } else if (device.user_matricule) {
    const subs = db.prepare('SELECT device_id, subscription FROM push_subscriptions WHERE user_matricule = ?').all(device.user_matricule);
    for (const s of subs) {
      try {
        await sendNotification(JSON.parse(s.subscription), payload);
        sent++;
      } catch (err) {
        lastError = err.statusCode ? `push rejeté (${err.statusCode})` : (err.message || 'échec envoi');
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').run(s.device_id);
        }
      }
    }
  }

  if (sent > 0) return res.json({ ok: true, sent });
  res.status(400).json({ error: lastError || 'Aucun abonnement push actif — activez les notifications.' });
});

async function sendNotification(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

/**
 * Notifie toutes les subscriptions push d'un utilisateur (tous ses appareils).
 * Les subscriptions mortes (404/410 web-push) sont supprimées pour ne pas s'accumuler.
 */
async function sendToUser(userMatricule, payload) {
  const subs = db.prepare('SELECT device_id, subscription FROM push_subscriptions WHERE user_matricule = ?').all(userMatricule);
  await Promise.allSettled(subs.map(s => sendNotification(JSON.parse(s.subscription), payload)
    .catch(err => {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').run(s.device_id);
      }
    })));
}

module.exports = { router, sendNotification, sendToUser };
