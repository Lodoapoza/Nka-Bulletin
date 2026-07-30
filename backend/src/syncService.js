const db = require('./db');
const { decrypt } = require('./crypto');
const { fetchPayslipsSince, saveAttachment } = require('./imapService');
const { extractNetAmount } = require('./pdfService');
const { sendNotification } = require('./routes/push');

const STORAGE_DIR = process.env.STORAGE_DIR || './storage';
const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout IMAP dépassé (60s)')), ms)),
  ]);
}

async function runSyncForDevice(deviceId) {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  const accounts = db.prepare('SELECT * FROM accounts WHERE device_id = ?').all(deviceId);
  let totalNew = 0;

  for (const account of accounts) {
    try {
      const password = decrypt(account.encrypted_credentials);
      const sinceDate = account.last_sync_at
        ? new Date(account.last_sync_at)
        : new Date(2000, 0, 1);

      const found = await withTimeout(fetchPayslipsSince({
        provider: account.provider,
        host: account.imap_host,
        port: account.imap_port,
        secure: !!account.imap_secure,
        email: account.email,
        password,
        sinceDate,
      }), 60000);

      let newCount = 0;
      for (const item of found) {
        const already = db.prepare('SELECT id FROM bulletins WHERE message_hash = ?').get(item.messageHash);
        if (already) continue;

        const filepath = await saveAttachment(STORAGE_DIR, deviceId, item.buffer, item.filename);
        let netAmount = null;
        if (device && device.extract_amounts) {
          try { netAmount = await extractNetAmount(item.buffer); } catch (_) {}
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

module.exports = { runSyncForDevice };
