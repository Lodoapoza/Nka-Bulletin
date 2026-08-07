const db = require('./db');
const { decrypt } = require('./crypto');
const { fetchPayslipsSince, saveAttachment } = require('./imapService');
const { analyzePdf, matchesOwner } = require('./pdfService');
const { parsePeriodFromPayslip } = require('./period');
const { sendNotification } = require('./routes/push');

const STORAGE_DIR = process.env.STORAGE_DIR || './storage';
const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const SYNC_TIMEOUT_MS = Number(process.env.SYNC_TIMEOUT) || 600000;

function withTimeout(promise, ms, signal) {
  let reject;
  const timer = setTimeout(() => {
    if (signal) signal.abort();
    reject(new Error('Timeout IMAP dépassé'));
  }, ms);
  const timeoutPromise = new Promise((_, rej) => { reject = rej; });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Déduplique et enregistre une liste d'attachments (fichiers trouvés par IMAP).
 * Retourne le nombre de nouveaux bulletins insérés.
 */
async function importFound(device, account, items) {
  let newCount = 0;
  for (const item of items) {
    const alreadyHash = db.prepare('SELECT id FROM bulletins WHERE message_hash = ? AND device_id = ?').get(item.messageHash, account.device_id);

    const period = parsePeriodFromPayslip(`${item.filename} ${item.subject}`);
    const year = period ? period.year : item.receivedAt.getFullYear();
    const month = period ? period.month : item.receivedAt.getMonth() + 1;

    const alreadyPeriod = db.prepare(
      'SELECT id FROM bulletins WHERE account_id = ? AND filename = ? AND year = ? AND month = ?'
    ).get(account.id, item.filename, year, month);
    if (alreadyHash || alreadyPeriod) continue;

    if (!item.buffer || item.buffer.length === 0) continue;

    // Validation du CONTENU : on n'importe que de vrais bulletins, et on filtre
    // par matricule du propriétaire si configuré sur l'appareil.
    let analysis = null;
    try {
      analysis = await analyzePdf(item.buffer);
    } catch (err) {
      console.warn('[sync] Analyse PDF impossible:', err.message);
    }

    const ownerMatricule = device && device.owner_matricule ? device.owner_matricule : null;
    const isOwned = matchesOwner(analysis, ownerMatricule);
    if (!analysis || !analysis.isPayslip || !isOwned) {
      if (!analysis) {
        db.prepare('INSERT INTO sync_logs (device_id, account_id, status, message) VALUES (?,?,?,?)')
          .run(account.device_id, account.id, 'error', 'Impossible d\'analyser la pièce jointe.');
      } else {
        const reason = analysis.isPayslip
          ? 'bulletin d\'un autre salarié (matricule exclu)'
          : 'document non reconnu comme bulletin de paie';
        db.prepare('INSERT INTO sync_logs (device_id, account_id, status, message) VALUES (?,?,?,?)')
          .run(account.device_id, account.id, 'success', `Ignoré : ${reason} (« ${item.filename} »)`);
      }
      continue;
    }

    const filepath = await saveAttachment(STORAGE_DIR, account.device_id, item.buffer, item.filename);
    const netAmount = device && device.extract_amounts ? analysis.netAmount : null;

    db.prepare(`
      INSERT OR IGNORE INTO bulletins (device_id, account_id, year, month, filename, filepath, message_hash, received_at, net_amount, nom, matricule)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.device_id, account.id,
      year, month,
      item.filename, filepath, item.messageHash, item.receivedAt.toISOString(),
      netAmount, analysis.nom, analysis.matricule
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

/**
 * Synchronise tous les comptes d'un appareil.
 * Retourne un résultat structuré :
 * - ok : true si AU MOINS UN compte a terminé sans erreur (même avec 0 bulletin),
 *        false si TOUS les comptes ont échoué.
 * - totalNew : nombre total de bulletins importés.
 * - errors : messages d'erreur de chaque compte en échec.
 */
async function runSyncForDevice(deviceId) {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  const accounts = db.prepare('SELECT * FROM accounts WHERE device_id = ?').all(deviceId);
  let totalNew = 0;
  const errors = [];
  let successCount = 0;

  for (const account of accounts) {
    try {
      const password = decrypt(account.encrypted_credentials);
      // Grace period 48h : ne jamais perdre un message en cas d'échec ponctuel
      // sur un message proche de la fenêtre de scan (dédupliqué par hash ensuite).
      const sinceDate = account.last_sync_at
        ? new Date(new Date(account.last_sync_at).getTime() - 48 * 60 * 60 * 1000)
        : new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

      const controller = new AbortController();
      const found = await withTimeout(fetchPayslipsSince({
        provider: account.provider,
        host: account.imap_host,
        port: account.imap_port,
        secure: !!account.imap_secure,
        email: account.email,
        password,
        sinceDate,
      }, { signal: controller.signal }), SYNC_TIMEOUT_MS, controller.signal);

      const newCount = await importFound(device, account, found);

      totalNew += newCount;
      db.prepare('UPDATE accounts SET last_sync_at = ? WHERE id = ?').run(new Date().toISOString(), account.id);
      db.prepare('INSERT INTO sync_logs (device_id, account_id, status, message, new_bulletins) VALUES (?,?,?,?,?)')
        .run(deviceId, account.id, 'success', `${newCount} nouveau(x) bulletin(s)`, newCount);
      successCount++;

    } catch (err) {
      errors.push(err.message);
      db.prepare('INSERT INTO sync_logs (device_id, account_id, status, message) VALUES (?,?,?,?)')
        .run(deviceId, account.id, 'error', err.message);
    }
  }

  return {
    // Aucun compte configuré : rien n'a échoué, la sync est un succès (comportement historique).
    ok: successCount > 0 || accounts.length === 0,
    totalNew,
    errors,
  };
}

module.exports = { runSyncForDevice, importFound };
