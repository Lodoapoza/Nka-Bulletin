const db = require('./db');
const { decrypt } = require('./crypto');
const { fetchPayslipsSince: fetchPayslipsImap, saveAttachment } = require('./imapService');
const { fetchPayslipsSince: fetchPayslipsGmail } = require('./gmailService');
const { analyzePdf, matchesOwner } = require('./pdfService');
const { parsePeriodFromPayslip, parsePeriodFromText } = require('./period');
const { sendNotification, sendToUser } = require('./routes/push');

const STORAGE_DIR = process.env.STORAGE_DIR || './storage';
const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const SYNC_TIMEOUT_MS = Number(process.env.SYNC_TIMEOUT) || 600000;
// Fenêtre du premier scan (last_sync_at NULL) : large et paramétrable, pour rattraper
// les bulletins anciens jamais importés. Défaut 1825 j = 5 ans.
const INITIAL_SCAN_DAYS = Number(process.env.INITIAL_SCAN_DAYS) || 1825;

function withTimeout(promise, ms, controller) {
  let reject;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
    reject(new Error('Timeout IMAP dépassé'));
  }, ms);
  const timeoutPromise = new Promise((_, rej) => { reject = rej; });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Découpe une fenêtre de scan en tranches annuelles (1er janvier → 1er janvier).
 * Les tranches sont retournées du plus récent au plus ancien : l'utilisateur
 * voit ses bulletins récents immédiatement sans attendre le scan complet.
 * Chaque tranche est scannée avec son propre timeout (SYNC_TIMEOUT_MS),
 * et last_sync_at est mis à jour progressivement (reprise en cas d'échec).
 */
function buildYearChunks(sinceDate, now) {
  const chunks = [];
  let chunkStart = new Date(sinceDate);
  while (chunkStart < now) {
    const nextMonth = new Date(chunkStart.getFullYear(), chunkStart.getMonth() + 1, 1);
    const chunkEnd = nextMonth < now ? nextMonth : null;
    chunks.push({ since: new Date(chunkStart), before: chunkEnd });
    if (!chunkEnd) break;
    chunkStart = chunkEnd;
  }
  chunks.reverse();
  return chunks;
}


/**
 * Déduplique et enregistre une liste d'attachments (fichiers trouvés par IMAP).
 * Retourne le nombre de nouveaux bulletins insérés.
 */
async function importFound(device, account, items) {
  let newCount = 0;
  const summary = { candidates: items.length, rejected: 0, alreadyImported: 0 };
  for (const item of items) {
    // Dédup multi-appareils : si le device est rattaché à un user (user_matricule),
    // la déduplication se fait au niveau de l'utilisateur — un bulletin déjà importé
    // par un autre appareil du même user n'est ni ré-importé ni re-téléchargé.
    const userMat = device && device.user_matricule;
    const alreadyHash = userMat
      ? db.prepare('SELECT id FROM bulletins WHERE message_hash = ? AND user_matricule = ?').get(item.messageHash, userMat)
      : db.prepare('SELECT id FROM bulletins WHERE message_hash = ? AND device_id = ?').get(item.messageHash, account.device_id);

    const filePeriod = parsePeriodFromPayslip(`${item.filename} ${item.subject}`);
    const itemYear = filePeriod ? filePeriod.year : item.receivedAt.getFullYear();
    const itemMonth = filePeriod ? filePeriod.month : item.receivedAt.getMonth() + 1;

    // Garde de période : pour un appareil rattaché à un user, la déduplication
    // est AU NIVEAU USER — si un autre appareil du même user a déjà importé ce
    // (filename, année, mois), on saute. Sinon chaque appareil réimporterait la
    // même pièce jointe reçue dans sa propre boîte (chevauchement multi-devices).
    // Sans user_matricule : comportement historique par compte.
    const alreadyPeriod = userMat
      ? db.prepare('SELECT id FROM bulletins WHERE user_matricule = ? AND filename = ? AND year = ? AND month = ?')
          .get(userMat, item.filename, itemYear, itemMonth)
      : db.prepare('SELECT id FROM bulletins WHERE account_id = ? AND filename = ? AND year = ? AND month = ?')
          .get(account.id, item.filename, itemYear, itemMonth);
    if (alreadyHash || alreadyPeriod) { summary.alreadyImported++; continue; }

    if (!item.buffer || item.buffer.length === 0) continue;

    // Validation du CONTENU : on n'importe que de vrais bulletins, et on filtre
    // par matricule du propriétaire si configuré sur l'appareil.
    let analysis = null;
    try {
      analysis = await analyzePdf(item.buffer);
    } catch (err) {
      console.warn('[sync] Analyse PDF impossible:', err.message);
    }

    // Période et type :
    // - Gratification → toujours via le CONTENU (mois = 0).
    // - Paie avec mois explicite dans le nom de fichier (JANVIER_2026,
    //   BUL_202304…) → le FICHIER fait foi : observé en prod, le libellé du
    //   PDF peut pointer le mois de paiement (+1) au lieu de la période.
    // - Sinon (fichier sans mois déchiffrable, ex. GRATIFICATION_2025) →
    //   contenu, puis date de réception en dernier recours.
    const contentPeriod = analysis && analysis.text ? parsePeriodFromText(analysis.text) : null;
    const isGratification = !!(contentPeriod && contentPeriod.type === 'gratification');
    const type = isGratification ? 'gratification' : 'paie';
    const fileHasMonth = !!(filePeriod && filePeriod.month);
    const useFilePeriod = !isGratification && fileHasMonth;
    const year = useFilePeriod && filePeriod.year
      ? filePeriod.year
      : (contentPeriod && contentPeriod.year ? contentPeriod.year
        : (filePeriod ? filePeriod.year : item.receivedAt.getFullYear()));
    const month = isGratification
      ? 0
      : (useFilePeriod ? filePeriod.month
        : (contentPeriod && contentPeriod.month ? contentPeriod.month
          : (filePeriod ? filePeriod.month : item.receivedAt.getMonth() + 1)));
    const periodLabel = contentPeriod ? contentPeriod.label : null;

    const ownerMatricule = device && (device.owner_matricule || device.user_matricule)
      ? (device.owner_matricule || device.user_matricule)
      : null;
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
      summary.rejected++;
      continue;
    }

    const filepath = await saveAttachment(STORAGE_DIR, account.device_id, item.buffer, item.filename);
    const netAmount = device && device.extract_amounts ? analysis.netAmount : null;

    db.prepare(`
      INSERT OR IGNORE INTO bulletins (device_id, user_matricule, account_id, year, month, filename, filepath, message_hash, received_at, net_amount, nom, matricule, type, period_label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.device_id, userMat, account.id,
      year, month,
      item.filename, filepath, item.messageHash, item.receivedAt.toISOString(),
      netAmount, analysis.nom, analysis.matricule,
      type, periodLabel
    );
    newCount++;

    const monthLabel = MONTH_NAMES_FR[month - 1];
    const pushBody = type === 'gratification'
      ? `Votre gratification ${year} est disponible.`
      : `Votre bulletin de paie de ${monthLabel} ${year} est disponible.`;
    if (device && device.user_matricule) {
      // Push multi-appareils : notifie TOUTES les subscriptions du user (tous ses devices).
      await sendToUser(device.user_matricule, {
        title: 'Nouveau bulletin détecté',
        body: pushBody,
      }).catch(() => {});
    } else if (device && device.push_subscription) {
      // Legacy : device sans user_matricule → push direct sur l'abonnement du device.
      await sendNotification(JSON.parse(device.push_subscription), {
        title: 'Nouveau bulletin détecté',
        body: pushBody,
      }).catch(() => {});
    }
  }
  importFound.lastSummary = summary;
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
async function runSyncForDevice(deviceId, options = {}) {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  let accounts = db.prepare('SELECT * FROM accounts WHERE device_id = ?').all(deviceId);

  // Multi-appareils : appareil réinstallé/éjecté sans compte propre mais rattaché
  // à un user (matricule) → synchroniser les comptes des autres appareils du même
  // user. Sinon « Rechercher mes bulletins » ne trouve jamais rien sur cet appareil
  // (0 compte à scanner → done 0 → l'app repropose une recherche en boucle).
  // La dédup (message_hash + user_matricule) empêche les doublons.
  if (!accounts.length && device && device.user_matricule) {
    accounts = db.prepare(`
      SELECT a.* FROM accounts a
      JOIN devices d ON d.id = a.device_id
      WHERE d.user_matricule = ? AND a.device_id != ?
    `).all(device.user_matricule, deviceId);
  }
  let totalNew = 0;
  let totalCandidates = 0;
  let totalRejected = 0;
  let totalAlreadyImported = 0;
  const errors = [];
  let successCount = 0;
  const requestId = options.requestId || null;

  // Progression temps réel : écrite dans sync_requests (colonnes cursor/phase/
  // new_bulletins) après chaque tranche. Le frontend lit /sync/status et affiche
  // « Scan 2026… 3/35 ». Échec silencieux toléré (la sync ne doit pas casser).
  const reportProgress = (data) => {
    if (!requestId) return;
    try {
      db.prepare(
        "UPDATE sync_requests SET cursor = ?, phase = 'scanning', new_bulletins = ?, attachments_found = ? WHERE id = ? AND status = 'running'"
      ).run(JSON.stringify(data), data.newBulletins || 0, data.found || 0, requestId);
    } catch (_) {}
  };

  for (const account of accounts) {
    try {
      const password = decrypt(account.encrypted_credentials);
      // Fenêtre de scan :
      // - Premier scan (last_sync_at NULL) OU full_scan demandé : fenêtre large
      //   paramétrable via INITIAL_SCAN_DAYS (défaut 12775 j = 35 ans) pour
      //   rattraper les bulletins anciens (2023, début 2024) jamais importés.
      //   full_scan ignore last_sync_at : un "Tout re-scanner" doit toujours
      //   repartir de 35 ans, même si une sync en cours a déjà réécrit
      //   last_sync_at (race condition avec /sync/reset).
      // - Scans suivants : grace period 48h autour de last_sync_at pour ne jamais
      //   perdre un message en cas d'échec ponctuel (dédupliqué par hash ensuite).
      const now = new Date();
      const scanYear = Number.isInteger(options.scanYear) ? options.scanYear : null;
      let sinceDate;
      let chunks;
      if (scanYear) {
        // Recherche ciblée : fenêtre [1er janvier année, 1er janvier année+1[
        // (borne haute ramenée à « maintenant » pour l'année en cours).
        sinceDate = new Date(scanYear, 0, 1);
        const yearEnd = new Date(scanYear + 1, 0, 1);
        chunks = [{ since: sinceDate, before: yearEnd.getTime() <= now.getTime() ? yearEnd : null }];
        console.log(`[sync] Account ${account.email}: recherche ciblée année ${scanYear}`);
      } else {
        sinceDate = (options.fullScan || !account.last_sync_at)
          ? new Date(Date.now() - INITIAL_SCAN_DAYS * 24 * 60 * 60 * 1000)
          : new Date(new Date(account.last_sync_at).getTime() - 48 * 60 * 60 * 1000);

        // Fenêtre > 1 an → découpage par tranches annuelles : chaque tranche est
        // scannée avec son propre timeout (SYNC_TIMEOUT_MS), et last_sync_at est
        // mis à jour après chaque tranche réussie → reprise progressive en cas
        // d'échec, plus jamais de timeout global sur un scan initial de 35 ans.
        chunks = (now.getTime() - sinceDate.getTime() > 366 * 24 * 60 * 60 * 1000)
          ? buildYearChunks(sinceDate, now)
          : [{ since: sinceDate, before: null }];
      }

      let accountNew = 0;
      let accountOk = true;
      let historyResumeAt = null;
      const isHistoryScan = !scanYear && (options.fullScan || !account.last_sync_at);
      console.log(`[sync] Account ${account.email}: scan ${chunks.length} tranche(s) depuis ${sinceDate.toISOString()}`);
      reportProgress({ chunk: 0, total: chunks.length, year: '', found: 0 });

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const yearLabel = String(chunk.since.getFullYear());
        try {
          const controller = new AbortController();
          console.log(`[sync]   Tranche ${ci + 1}/${chunks.length}: ${chunk.since.toISOString()} → ${chunk.before ? chunk.before.toISOString() : 'now'}`);

          // Gmail OAuth → Gmail API / IMAP classique → IMAP
          const isGmailOAuth = account.provider === 'gmail' && account.imap_host === 'imap.gmail.com';
          let found;
          if (isGmailOAuth) {
            // Vérifier si credentials contiennent un refresh_token (OAuth) vs un mot de passe (IMAP)
            try {
              const creds = JSON.parse(decrypt(account.encrypted_credentials));
              if (creds.refresh_token) {
                // Gmail API (OAuth2)
                console.log(`[sync]   → Gmail API (OAuth2)`);
                found = await withTimeout(fetchPayslipsGmail(account, chunk.since, chunk.before, controller.signal), SYNC_TIMEOUT_MS, controller);
              } else {
                // Mot de passe d'application → IMAP classique
                const password = decrypt(account.encrypted_credentials);
                found = await withTimeout(fetchPayslipsImap({
                  provider: account.provider, host: account.imap_host, port: account.imap_port,
                  secure: !!account.imap_secure, email: account.email, password,
                  sinceDate: chunk.since, beforeDate: chunk.before,
                }, { signal: controller.signal }), SYNC_TIMEOUT_MS, controller);
              }
            } catch (e) {
              if (e.message === 'TOKEN_EXPIRED') throw e;
              // OAuth → ne JAMAIS fallback IMAP : un token OAuth n'est pas un mot de passe d'application.
              let isOAuth = false;
              try {
                const creds = JSON.parse(decrypt(account.encrypted_credentials));
                if (creds.refresh_token) isOAuth = true;
              } catch (_) {}
              if (isOAuth) {
                console.error('[sync]   Gmail API OAuth error, pas de fallback IMAP:', e.message);
                throw e;
              }
              // Fallback IMAP (mot de passe d'application)
                const password = decrypt(account.encrypted_credentials);
              found = await withTimeout(fetchPayslipsImap({
                provider: account.provider, host: account.imap_host, port: account.imap_port,
                secure: !!account.imap_secure, email: account.email, password,
                sinceDate: chunk.since, beforeDate: chunk.before,
              }, { signal: controller.signal }), SYNC_TIMEOUT_MS, controller);
            }
          } else {
            // IMAP classique (Outlook, Yahoo, IMAP perso)
            const password = decrypt(account.encrypted_credentials);
            found = await withTimeout(fetchPayslipsImap({
              provider: account.provider, host: account.imap_host, port: account.imap_port,
              secure: !!account.imap_secure, email: account.email, password,
              sinceDate: chunk.since, beforeDate: chunk.before,
            }, { signal: controller.signal }), SYNC_TIMEOUT_MS, controller);
          }

          console.log(`[sync]   Tranche ${ci + 1}: ${found.length} candidat(s) trouvé(s)`);
          accountNew += await importFound(device, account, found);
          totalCandidates += found.length;
          totalRejected += importFound.lastSummary?.rejected || 0;
          totalAlreadyImported += importFound.lastSummary?.alreadyImported || 0;
          reportProgress({ chunk: ci + 1, total: chunks.length, year: yearLabel, found: totalCandidates, newBulletins: totalNew + accountNew });

          // L'historique descend du mois rcent vers le plus ancien. Ne pas
          // avancer le curseur incrmental aprs chaque tranche : une coupure
          // ancienne ne doit pas faire croire que toute la bo__manus_dte est  jour.
          if (!scanYear && !isHistoryScan) {
            db.prepare('UPDATE accounts SET last_sync_at = ? WHERE id = ?').run(now.toISOString(), account.id);
          }
        } catch (err) {
          accountOk = false;
          if (isHistoryScan) historyResumeAt = chunk.since;
          errors.push(err.message);
          console.error(`[sync]   Tranche ${ci + 1} échouée:`, err.message);
          db.prepare('INSERT INTO sync_logs (device_id, account_id, status, message) VALUES (?,?,?,?)')
            .run(deviceId, account.id, 'error', err.message);
          break; // tranche suivante reprise au prochain scan (last_sync_at progressif)
        }
      }

      // Mettre à jour last_sync_at à now après un scan réussi (même si aucun
      // bulletin trouvé : le scan a bien tourné) — SAUF recherche ciblée par
      // année passée (pour ne pas écraser le curseur global et perdre les mois
      // jamais scannés entre l'année ciblée et aujourd'hui).
      const finishedAt = new Date();
      const nowYear = finishedAt.getFullYear();
      if (accountOk && (!scanYear || scanYear === nowYear)) {
        db.prepare('UPDATE accounts SET last_sync_at = ? WHERE id = ?').run(finishedAt.toISOString(), account.id);
      }
      else if (!accountOk && historyResumeAt) {
        db.prepare('UPDATE accounts SET last_sync_at = ? WHERE id = ?').run(historyResumeAt.toISOString(), account.id);
      }
      if (accountOk) {
        totalNew += accountNew;
        const msg = scanYear
          ? (accountNew > 0 ? `${accountNew} nouveau(x) bulletin(s) pour ${scanYear}` : `Aucun nouveau bulletin pour ${scanYear}`)
          : (accountNew > 0 ? `${accountNew} nouveau(x) bulletin(s)` : 'Aucun nouveau bulletin');
        console.log(`[sync] Account ${account.email}: terminé — ${msg}`);
        db.prepare('INSERT INTO sync_logs (device_id, account_id, status, message, new_bulletins) VALUES (?,?,?,?,?)')
          .run(deviceId, account.id, 'success', msg, accountNew);
        successCount++;
      }

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
    totalCandidates,
    totalRejected,
    totalAlreadyImported,
    errors,
  };
}

module.exports = { runSyncForDevice, importFound, withTimeout, buildYearChunks };
