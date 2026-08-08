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
