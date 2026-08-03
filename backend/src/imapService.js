const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fs = require('fs/promises');
const { mkdirSync } = require('fs');
const path = require('path');
const { hashMessage } = require('./crypto');
const { isDeniedFilename } = require('./pdfService');

// Presets réels des grands fournisseurs (l'utilisateur fournit login + mot de passe d'application)
const PROVIDER_PRESETS = {
  gmail:   { host: 'imap.gmail.com',        port: 993, secure: true },
  outlook: { host: 'outlook.office365.com', port: 993, secure: true },
  yahoo:   { host: 'imap.mail.yahoo.com',   port: 993, secure: true },
};

// Mots-clés reconnus dans le sujet ou le nom de la pièce jointe (FR + EN)
const KEYWORDS = [
  'bulletin de paie', 'bulletin de salaire', 'fiche de paie', 'fiche de paye',
  'bulletin', 'paie', 'paye', 'payslip', 'pay slip', 'salary slip', 'salaire'
];

// Backoff entre tentatives IMAP (15s puis 60s)
const RETRY_DELAYS = [15000, 60000];

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('Timeout IMAP dépassé'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Timeout IMAP dépassé'));
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function matchesPayslipKeywords(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return KEYWORDS.some(k => lower.includes(k));
}

/**
 * Se connecte à la boîte mail et récupère les nouveaux bulletins depuis `sinceDate`.
 * Stratégie 2 passes :
 *   1) envelope + uid (léger) → filtrage par mots-clés sujet → liste de UIDs candidats
 *   2) source complet uniquement pour les UIDs candidats → extraction PDF
 * Cela réduit drastiquement le trafic IMAP (passe 1 = quelques Ko par email au lieu de Mo).
 * `opts.signal` (AbortSignal) interrompt le scan proprement (timeout applicatif).
 */
async function fetchPayslipsSince({ provider, host, port, secure, email, password, sinceDate, beforeDate }, opts = {}) {
  const { signal } = opts || {};
  const preset = PROVIDER_PRESETS[provider] || { host, port, secure };

  // Une tentative = nouveau ImapFlow (jamais de réutilisation d'un client mort)
  const scanOnce = async () => {
    const client = new ImapFlow({
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      auth: { user: email, pass: password },
      logger: false,
      connectTimeout: 30000,
      socketTimeout: Number(process.env.IMAP_SOCKET_TIMEOUT) || 600000,
      maxBodySize: 60000000,
    });
    client.on('error', (err) => console.error('[imap] client error:', err.code || err.message));

    const checkAborted = () => {
      if (signal && signal.aborted) throw new Error('Timeout IMAP dépassé');
    };
    const onAbort = () => {
      // ferme le socket immédiatement ; le scan échoue alors avec l'erreur de timeout
      try { client.close(); } catch (_) {}
    };
    if (signal) signal.addEventListener('abort', onAbort);

    try {
      checkAborted();
      await client.connect();
      checkAborted();
      try {
        const results = [];
        let lock = await client.getMailboxLock('INBOX');
        try {
          checkAborted();
          const searchCriteria = { since: sinceDate };
          if (beforeDate) searchCriteria.before = beforeDate;

          // Passe 1 : récupérer envelope + uid pour filtrage léger côté client
          const candidateUids = [];
          for await (const msg of client.fetch(searchCriteria, { envelope: true, uid: true, internalDate: true })) {
            checkAborted();
            const subject = msg.envelope?.subject || '';
            const subjectMatches = matchesPayslipKeywords(subject);
            if (subjectMatches && msg.uid) {
              candidateUids.push({ uid: msg.uid, subject, receivedAt: msg.internalDate || new Date(), messageId: msg.envelope?.messageId });
            }
          }

          // Passe 2 : fetch le source complet uniquement pour les candidats
          for (const cand of candidateUids) {
            checkAborted();
            let fullMsg;
            try {
              fullMsg = await client.fetch(cand.uid, { source: true, uid: true });
            } catch (_) { continue; }
            // client.fetch avec UID unique retourne un async iter d'1 seul élément
            try {
              for await (const m of fullMsg) {
                if (!m.source) continue;
                const parsed = await simpleParser(m.source);
                for (const att of parsed.attachments || []) {
                  const isPdf = (att.contentType || '').includes('pdf') || /\.pdf$/i.test(att.filename || '');
                  if (!isPdf) continue;
                  const filenameMatches = matchesPayslipKeywords(att.filename || '');
                  if (!filenameMatches) continue; // passe 1 a déjà filtré par sujet
                  if (isDeniedFilename(att.filename)) continue;

                  if (!att.content || att.content.length === 0) continue;
                  const head = att.content.subarray(0, 1024).toString('latin1');
                  if (!head.includes('%PDF')) continue;

                  const messageHash = hashMessage(`${cand.messageId || cand.uid}-${att.filename}-${att.size}`);
                  results.push({
                    filename: att.filename || `bulletin-${cand.receivedAt.getFullYear()}-${cand.receivedAt.getMonth() + 1}.pdf`,
                    buffer: att.content,
                    receivedAt: cand.receivedAt,
                    messageHash,
                    subject: cand.subject,
                  });
                }
              }
            } catch (err) {
              // échec de stream sur un candidat : on passe au suivant, la sync continue
              console.warn('[imap] stream candidat échoué:', err.code || err.message);
            }
          }
          return results;
        } finally {
          lock.release();
        }
      } catch (err) {
        // abort → erreur dédiée ; sinon l'erreur primaire se propage telle quelle
        if (signal && signal.aborted) throw new Error('Timeout IMAP dépassé');
        throw err;
      } finally {
        // logout ne doit jamais masquer l'erreur primaire en cours de propagation
        try { await client.logout(); } catch (e) { console.warn('[imap] logout failed:', e.message); }
      }
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  };

  // Retry avec backoff sur erreurs transitoires (connexion instable, throttle, timeout)
  for (let attempt = 0; ; attempt++) {
    try {
      return await scanOnce();
    } catch (err) {
      const transitory = err.code === 'NoConnection' || err.code === 'ECONNRESET' || (err.message || '').includes('Timeout');
      const delay = RETRY_DELAYS[attempt];
      if (delay === undefined || !transitory || (signal && signal.aborted)) throw err;
      console.warn(`[imap] tentative ${attempt + 1} échouée, nouvel essai dans ${delay / 1000}s:`, err.code || err.message);
      await sleep(delay, signal);
    }
  }
}

async function saveAttachment(storageDir, deviceId, buffer, filename) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(deviceId)) throw new Error(`Invalid deviceId: ${deviceId}`);
  const dir = path.join(storageDir, deviceId);
  mkdirSync(dir, { recursive: true }); // keep sync, called once per batch
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = path.join(dir, safeName);
  await fs.writeFile(fullPath, buffer);
  return fullPath;
}

module.exports = { fetchPayslipsSince, saveAttachment, PROVIDER_PRESETS };
