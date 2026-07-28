const express = require('express');
const db = require('../db');
const { decrypt } = require('../crypto');
const { fetchPayslipsSince, saveAttachment } = require('../imapService');
const { extractNetAmount } = require('../pdfService');
const { sendNotification } = require('./push');

const router = express.Router();
const STORAGE_DIR = process.env.STORAGE_DIR || './storage';
const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

async function runSyncForDevice(deviceId) {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  const accounts = db.prepare('SELECT * FROM accounts WHERE device_id = ?').all(deviceId);
  let totalNew = 0;

  for (const account of accounts) {
    try {
      const password = decrypt(account.encrypted_credentials);
      // Depuis la dernière synchro, ou depuis le 1er du mois en cours si jamais synchronisé
      const sinceDate = account.last_sync_at
        ? new Date(account.last_sync_at)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const found = await fetchPayslipsSince({
        provider: account.provider,
        host: account.imap_host,
        port: account.imap_port,
        secure: !!account.imap_secure,
        email: account.email,
        password,
        sinceDate,
      });

      let newCount = 0;
      for (const item of found) {
        const already = db.prepare('SELECT id FROM bulletins WHERE message_hash = ?').get(item.messageHash);
        if (already) continue; // anti-doublon

        const filepath = saveAttachment(STORAGE_DIR, deviceId, item.buffer, item.filename);
        let netAmount = null;
        if (device && device.extract_amounts) {
          try { netAmount = await extractNetAmount(item.buffer); } catch (_) { /* extraction best-effort */ }
        }

        db.prepare(`
          INSERT INTO bulletins (device_id, account_id, year, month, filename, filepath, message_hash, received_at, net_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          deviceId, account.id,
          item.receivedAt.getFullYear(), item.receivedAt.getMonth() + 1,
          item.filename, filepath, item.messageHash, item.receivedAt.toISOString(),
          netAmount
        );
        newCount++;

        // Notification immédiate pour ce nouveau bulletin détecté
        if (device && device.push_subscription) {
          const monthLabel = MONTH_NAMES_FR[item.receivedAt.getMonth()];
          await sendNotification(JSON.parse(device.push_subscription), {
            title: 'Nouveau bulletin détecté',
            body: `Votre bulletin de paie de ${monthLabel} ${item.receivedAt.getFullYear()} est disponible.`,
          }).catch(() => {});
        }
      }

      totalNew += newCount;
      db.prepare('UPDATE accounts SET last_sync_at = ? WHERE id = ?').run(new Date().toISOString(), account.id);
      db.prepare('INSERT INTO sync_logs (device_id, account_id, status, message, new_bulletins) VALUES (?,?,?,?,?)')
        .run(deviceId, account.id, 'success', `${newCount} nouveau(x) bulletin(s)`, newCount);

    } catch (err) {
      db.prepare('INSERT INTO sync_logs (device_id, account_id, status, message) VALUES (?,?,?,?)')
        .run(deviceId, account.id, 'error', err.message);
    }
  }
  return totalNew;
}

router.post('/run', async (req, res) => {
  try {
    const totalNew = await runSyncForDevice(req.deviceId);
    res.json({ ok: true, newBulletins: totalNew });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM sync_logs WHERE device_id = ? ORDER BY ran_at DESC LIMIT 20').all(req.deviceId);
  res.json(rows);
});

module.exports = { router, runSyncForDevice };
