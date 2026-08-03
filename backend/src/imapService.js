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
 */
async function fetchPayslipsSince({ provider, host, port, secure, email, password, sinceDate, beforeDate }) {
  const preset = PROVIDER_PRESETS[provider] || { host, port, secure };
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
  client.on('error', () => {});

  const results = [];
  await client.connect();
  try {
    let lock = await client.getMailboxLock('INBOX');
    try {
      const searchCriteria = { since: sinceDate };
      if (beforeDate) searchCriteria.before = beforeDate;

      // Passe 1 : récupérer envelope + uid pour filtrage léger côté client
      const candidateUids = [];
      for await (const msg of client.fetch(searchCriteria, { envelope: true, uid: true, internalDate: true })) {
        const subject = msg.envelope?.subject || '';
        const subjectMatches = matchesPayslipKeywords(subject);
        if (subjectMatches && msg.uid) {
          candidateUids.push({ uid: msg.uid, subject, receivedAt: msg.internalDate || new Date(), messageId: msg.envelope?.messageId });
        }
      }

      // Passe 2 : fetch le source complet uniquement pour les candidats
      for (const cand of candidateUids) {
        let fullMsg;
        try {
          fullMsg = await client.fetch(cand.uid, { source: true, uid: true });
        } catch (_) { continue; }
        // client.fetch avec UID unique retourne un async iter d'1 seul élément
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
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return results;
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
