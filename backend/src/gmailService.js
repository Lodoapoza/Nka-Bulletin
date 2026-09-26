/**
 * gmailService.js — Recherche de bulletins via Gmail API (remplace IMAP pour les comptes OAuth).
 *
 * Stratégie 2 passes :
 *   1) messages.list avec q= (recherche Gmail) → filtrage par mots-clés → liste de messageIds
 *   2) messages.get avec format=full uniquement pour les candidats → extraction PDF
 * Timeout par chunk configurable via SYNC_TIMEOUT_MS (défaut 10 min).
 */
const { decrypt } = require('./crypto');
const { analyzePdf, isDeniedFilename } = require('./pdfService');

const KEYWORDS = [
  'bulletin de paie', 'bulletin de salaire', 'fiche de paie', 'fiche de paye',
  'bulletin', 'paie', 'paye', 'payslip', 'pay slip', 'salary slip', 'salaire'
];

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

// Mutex par account.id pour éviter les refresh_token concurrents
// (Google invalide le refresh_token s'il est utilisé plusieurs fois en parallèle)
const refreshMutexes = new Map();

function getRefreshMutex(accountId) {
  if (!refreshMutexes.has(accountId)) {
    refreshMutexes.set(accountId, Promise.resolve());
  }
  return refreshMutexes.get(accountId);
}

async function withRefreshMutex(accountId, fn) {
  const mutex = getRefreshMutex(accountId);
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  const current = mutex.then(() => fn()).finally(() => release());
  refreshMutexes.set(accountId, next);
  return current;
}

/**
 * Récupère un access_token valide (refresh si expiré).
 * Utilise un mutex par compte pour éviter les refresh concurrents.
 */
async function getValidToken(account) {
  const creds = JSON.parse(decrypt(account.encrypted_credentials));
  if (!creds.access_token) throw new Error('Pas d\'access_token');

  // Vérifier si expiré (marge 5 min)
  if (creds.expiry_date && new Date(creds.expiry_date).getTime() > Date.now() + 5 * 60 * 1000) {
    return creds.access_token;
  }

  // Token expiré → refresh (avec mutex pour éviter les refresh concurrents)
  if (!creds.refresh_token) throw new Error('Pas de refresh_token — réautorisez le compte');

  return withRefreshMutex(account.id, async () => {
    // Re-vérifier après attente du mutex (un autre appel a pu rafraîchir)
    const currentCreds = JSON.parse(decrypt(account.encrypted_credentials));
    if (currentCreds.expiry_date && new Date(currentCreds.expiry_date).getTime() > Date.now() + 5 * 60 * 1000) {
      return currentCreds.access_token;
    }
    if (!currentCreds.refresh_token) throw new Error('Pas de refresh_token — réautorisez le compte');

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error('OAuth2 non configuré côté serveur');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: currentCreds.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`Refresh token échoué: ${tokenData.error_description || tokenData.error}`);
    }

    const newCreds = {
      ...currentCreds,
      access_token: tokenData.access_token,
      expiry_date: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    };
    if (tokenData.refresh_token) {
      newCreds.refresh_token = tokenData.refresh_token;
    }

    // Mettre à jour en DB
    const db = require('./db');
    const { encrypt } = require('./crypto');
    db.prepare('UPDATE accounts SET encrypted_credentials = ? WHERE id = ?')
      .run(encrypt(JSON.stringify(newCreds)), account.id);

    console.log(`[gmail] Token rafraîchi pour ${account.email}`);
    return newCreds.access_token;
  });
}

/**
 * Appel API Gmail avec gestion d'erreur et retry sur 401.
 */
async function gmailFetch(url, token, retry = true) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    throw new Error('TOKEN_EXPIRED');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Détecte si un message contient un PDF en pièce jointe (via bodyStructure ou headers).
 */
function hasPdfAttachment(payload) {
  if (!payload) return false;
  const parts = payload.parts || [payload];
  for (const part of parts) {
    const filename = part.filename || '';
    const mimeType = part.mimeType || '';
    if (mimeType === 'application/pdf' || /\.pdf$/i.test(filename)) return true;
    if (part.parts) {
      if (hasPdfAttachment(part)) return true;
    }
  }
  return false;
}

/**
 * Recherche les bulletins de paie depuis une date donnée.
 * Utilise la recherche Gmail (q=) pour filtrer efficacement.
 *
 * @param {Object} account - Ligne accounts de la DB
 * @param {Date} sinceDate - Date de début du scan
 * @param {Date|null} beforeDate - Date de fin (optionnel)
 * @param {AbortSignal} signal - Pour annuler le scan
 * @returns {Array<{filename, buffer, receivedAt, messageHash, subject}>}
 */
async function fetchPayslipsSince(account, sinceDate, beforeDate, signal) {
  let token = await getValidToken(account);
  const results = [];

  // Construction de la requête Gmail
  // after:YYYY/MM/DD + (subject:bulletin OR subject:paie OR subject:salaire OR attachment:pdf)
  const afterStr = `${sinceDate.getFullYear()}/${String(sinceDate.getMonth() + 1).padStart(2, '0')}/${String(sinceDate.getDate()).padStart(2, '0')}`;
  let query = `after:${afterStr}`;
  if (beforeDate) {
    const beforeStr = `${beforeDate.getFullYear()}/${String(beforeDate.getMonth() + 1).padStart(2, '0')}/${String(beforeDate.getDate()).padStart(2, '0')}`;
    query += ` before:${beforeStr}`;
  }
  // Filtre metier : limiter la recherche aux messages dont le sujet ou le
  // nom de piece jointe correspond a un bulletin de paie. IN:anywhere conserve
  // les bulletins archives ou classes dans un libelle Gmail.
  query += ' has:attachment (subject:(bulletin OR paie OR paye OR salaire OR payslip) OR filename:(bulletin OR paie OR paye OR salaire OR payslip)) in:anywhere larger:10k';
  console.log(`[gmail] ${account.email}: recherche "${query}"`);

  // Passe 1 : lister les messages (page par page, max 100 par appel)
  let pageToken = null;
  let messageIds = [];
  do {
    if (signal && signal.aborted) throw new Error('Timeout IMAP dépassé');
    const listUrl = `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100${pageToken ? '&pageToken=' + pageToken : ''}`;
    try {
      const list = await gmailFetch(listUrl, token);
      if (list.messages) {
        messageIds.push(...list.messages.map(m => m.id));
      }
      pageToken = list.nextPageToken || null;
    } catch (e) {
      if (e.message === 'TOKEN_EXPIRED') {
        token = await getValidToken(account);
        continue; // retry
      }
      throw e;
    }
  } while (pageToken);

  console.log(`[gmail] ${messageIds.length} messages candidats`);

  // Passe 2 : récupérer chaque message et extraire les PDFs
  for (const msgId of messageIds) {
    if (signal && signal.aborted) throw new Error('Timeout IMAP dépassé');
    try {
      const msgUrl = `${GMAIL_API}/users/me/messages/${msgId}?format=full`;
      const msg = await gmailFetch(msgUrl, token);

      const headers = msg.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const dateHeader = headers.find(h => h.name === 'Date')?.value;
      const receivedAt = dateHeader ? new Date(dateHeader) : new Date();
      const messageIdHeader = headers.find(h => h.name === 'Message-ID')?.value || msgId;

      // Extraire les attachments PDF
      const parts = (msg.payload && msg.payload.parts) || [msg.payload];
      for (const part of flattenParts(msg.payload)) {
        if (signal && signal.aborted) throw new Error('Timeout IMAP dépassé');
        const filename = part.filename || '';
        const mimeType = part.mimeType || '';
        if (mimeType !== 'application/pdf' && !/\.pdf$/i.test(filename)) continue;
        if (isDeniedFilename(filename)) continue;

        // Télécharger le body de la pièce jointe
        if (!part.body || !part.body.attachmentId) continue;
        const attUrl = `${GMAIL_API}/users/me/messages/${msgId}/attachments/${part.body.attachmentId}`;
        const attData = await gmailFetch(attUrl, token);
        if (!attData.data) continue;

        const buffer = Buffer.from(attData.data, 'base64');
        if (buffer.length === 0) continue;

        // Vérifier que c'est un vrai PDF
        const head = buffer.subarray(0, 1024).toString('latin1');
        if (!head.includes('%PDF')) continue;

        const finalFilename = filename || `bulletin-${receivedAt.getFullYear()}-${receivedAt.getMonth() + 1}.pdf`;
        const { hashMessage } = require('./crypto');
        const messageHash = hashMessage(`${messageIdHeader}-${finalFilename}-${buffer.length}`);

        results.push({
          filename: finalFilename,
          buffer,
          receivedAt,
          messageHash,
          subject,
        });
      }
    } catch (e) {
      if (e.message === 'TOKEN_EXPIRED') {
        token = await getValidToken(account);
        continue; // retry
      }
      console.warn(`[gmail] Message ${msgId} ignoré:`, e.message);
    }
  }

  return results;
}

/**
 * Aplatit récursivement les parties d'un message Gmail.
 */
function* flattenParts(part) {
  if (!part) return;
  if (part.parts) {
    for (const child of part.parts) {
      yield* flattenParts(child);
    }
  } else {
    yield part;
  }
}

module.exports = { fetchPayslipsSince, getValidToken };
