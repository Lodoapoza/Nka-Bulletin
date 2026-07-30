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
  db.prepare('UPDATE devices SET push_subscription = ? WHERE id = ?')
    .run(JSON.stringify(subscription), req.deviceId);
  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  db.prepare('UPDATE devices SET push_subscription = NULL WHERE id = ?').run(req.deviceId);
  res.json({ ok: true });
});

async function sendNotification(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

module.exports = { router, sendNotification };
