const db = require('./db');
const { decrypt } = require('./crypto');
const { fetchPayslipsSince, saveAttachment } = require('./imapService');
const { extractNetAmount } = require('./pdfService');
const { parsePeriodFromPayslip } = require('./period');
const { sendNotification } = require('./routes/push');

const STORAGE_DIR = process.env.STORAGE_DIR || './storage';
const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const SYNC_TIMEOUT_MS = Number(process.env.SYNC_TIMEOUT) || 60000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout IMAP dépassé')), ms)),
  ]);
}

/**
 * Déduplique et enregistre une liste d'attachments (fichiers trouvés par IMAP).
 * Retourne le nombre de nouveaux bulletins insérés.
 */
async function importFound(device, account, items) {
  let newCount = 0;
  for (const item of items) {
    const alreadyHash = db.prepare('SELECT id FROM bulletins WHERE message_hash = ?').get(item.messageHash);

    const period = parsePeriodFromPayslip(`${item.filename} ${item.subject}`);
    const year = period ? period.year : item.receivedAt.getFullYear();
    const month = period ? period.month : item.receivedAt.getMonth() + 1;

    const alreadyPeriod = db.prepare(
      'SELECT id FROM bulletins WHERE account_id = ? AND filename = ? AND year = ? AND month = ?'
    ).get(account.id, item.filename, year, month);
    if (alreadyHash || alreadyPeriod) continue;

    if (!item.buffer || item.buffer.length === 0) continue;

    const filepath = await saveAttachment(STORAGE_DIR, account.device_id, item.buffer, item.filename);
    let netAmount = null;
    if (device && device.extract_amounts) {
      try { netAmount = await extractNetAmount(item.buffer); } catch (_) {}
    }

    db.prepare(`
      INSERT INTO bulletins (device_id, account_id, year, month, filename, filepath, message_hash, received_at, net_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.device_id, account.id,
      year, month,
      item.filename, filepath, item.messageHash, item.receivedAt.toISOString(),
      netAmount
    );
    newCount++;

    if (device && device.push_subscription) {
      const monthLabel = MONTH_NAMES_FR[month - 1];
      await sendNotification(JSON.parse(device.push_subscription), {
        title: 'Nouveau bulletin détecté',
        body: `Votre bulletin de paie de ${monthLabel} ${year} est disponible.`,
      }).catch(() => {});
    }
  }
  return newCount;
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
      }), SYNC_TIMEOUT_MS);

      const newCount = await importFound(device, account, found);

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

module.exports = { runSyncForDevice, importFound };
