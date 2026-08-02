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
 * Retourne une liste de { filename, buffer, receivedAt, messageHash, subject }
 */
async function fetchPayslipsSince({ provider, host, port, secure, email, password, sinceDate, beforeDate }) {
  const preset = PROVIDER_PRESETS[provider] || { host, port, secure };
  const client = new ImapFlow({
    host: preset.host,
    port: preset.port,
    secure: preset.secure,
    auth: { user: email, pass: password },
    logger: false,
    connectTimeout: 10000,
    socketTimeout: Number(process.env.IMAP_SOCKET_TIMEOUT) || 600000,
    maxBodySize: 60000000,
  });
  client.on('error', () => {});

  const results = [];
  await client.connect();
  try {
    let lock = await client.getMailboxLock('INBOX');
    try {
      // Recherche large côté serveur (depuis la dernière sync), filtrage fin fait côté client
      const searchCriteria = { since: sinceDate };
      if (beforeDate) searchCriteria.before = beforeDate;
      for await (const message of client.fetch(searchCriteria, { envelope: true, source: true, internalDate: true })) {
        const subject = message.envelope?.subject || '';
        const receivedAt = message.internalDate || new Date();

        const parsed = await simpleParser(message.source);
        const subjectMatches = matchesPayslipKeywords(subject);

        for (const att of parsed.attachments || []) {
          const isPdf = (att.contentType || '').includes('pdf') || /\.pdf$/i.test(att.filename || '');
          if (!isPdf) continue;
          const filenameMatches = matchesPayslipKeywords(att.filename || '');
          if (!subjectMatches && !filenameMatches) continue;
          // Noms de fichiers manifestement PAS des bulletins (comparatif, devis, support…)
          if (isDeniedFilename(att.filename)) continue;

          if (!att.content || att.content.length === 0) continue;
          const head = att.content.subarray(0, 1024).toString('latin1');
          if (!head.includes('%PDF')) continue;

          const messageHash = hashMessage(`${message.envelope?.messageId || message.uid}-${att.filename}-${att.size}`);
          results.push({
            filename: att.filename || `bulletin-${receivedAt.getFullYear()}-${receivedAt.getMonth() + 1}.pdf`,
            buffer: att.content,
            receivedAt,
            messageHash,
            subject,
          });
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
