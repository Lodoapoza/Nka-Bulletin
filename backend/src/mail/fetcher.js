import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { insertBulletin, findByHash } from '../db.js';

const KEYWORDS = [
  'bulletin', 'paie', 'salaire', 'pay slip', 'payroll',
  'fiche de paie', 'salaire net', 'bulletins de paie',
  'pay stub', 'payslip', 'salary'
];

function matchesKeywords(text) {
  const lower = text.toLowerCase();
  return KEYWORDS.some(kw => lower.includes(kw));
}

function getImapSettings(provider) {
  const configs = {
    gmail:    { host: 'imap.gmail.com',          port: 993, useTls: true },
    outlook:  { host: 'outlook.office365.com',    port: 993, useTls: true },
    yahoo:    { host: 'imap.mail.yahoo.com',      port: 993, useTls: true }
  };
  return configs[provider] || null;
}

/**
 * Fetch payroll bulletins from an email account via IMAP
 *
 * @param {object} account - Account record from DB
 * @param {object} options - { year, month }
 * @returns {Promise<string[]>} Array of new bulletin IDs
 */
export async function fetchPayrollBulletins(account, { year, month } = {}) {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month !== undefined ? month : now.getMonth(); // 0-indexed

  // Build IMAP configuration
  let imapHost, imapPort, imapSecure;
  let auth;

  if (account.provider === 'imap') {
    const config = JSON.parse(account.config_json || '{}');
    imapHost = config.host;
    imapPort = Number(config.port);
    imapSecure = config.useTls === true || config.useTls === 'true' || imapPort === 993;
    auth = { user: config.user, pass: config.password };
  } else {
    const settings = getImapSettings(account.provider);
    if (!settings) throw new Error(`IMAP non supporté pour ${account.provider}`);
    imapHost = settings.host;
    imapPort = settings.port;
    imapSecure = settings.useTls;
    auth = { user: account.email, accessToken: account.access_token };
  }

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    auth,
    logger: false
  });

  const newBulletins = [];

  try {
    await client.connect();

    const lock = await client.getMailbox('INBOX');

    // Search emails received from 16th of the month to end of month
    const startDate = new Date(targetYear, targetMonth, 16);
    const endDate = targetMonth === 11
      ? new Date(targetYear + 1, 0, 1)
      : new Date(targetYear, targetMonth + 1, 1);

    const messages = await client.search({
      since: startDate,
      before: endDate
    });

    for await (const mail of client.fetch(messages, { source: true })) {
      try {
        const raw = mail.source.toString();
        const parsed = await simpleParser(raw);

        const subject = parsed.subject || '';
        const textContent = parsed.text || '';
        const htmlContent = parsed.html || '';
        const combinedText = `${subject} ${textContent} ${htmlContent}`;

        if (!matchesKeywords(combinedText)) continue;

        // Process PDF attachments
        const pdfAttachments = parsed.attachments.filter(att => {
          const ct = (att.contentType || '').toLowerCase();
          const fn = (att.filename || '').toLowerCase();
          return ct.includes('pdf') || fn.endsWith('.pdf');
        });

        for (const att of pdfAttachments) {
          const content = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content);
          const sha256 = createHash('sha256').update(content).digest('hex');

          // Anti-doublon: check if hash already exists
          const existing = findByHash(sha256);
          if (existing) continue;

          // Save PDF to disk
          const bulletinId = uuidv4();
          const pdfDir = path.join('data', 'bulletins', String(account.id));
          fs.mkdirSync(pdfDir, { recursive: true });

          const monthStr = String(targetMonth + 1).padStart(2, '0');
          const pdfFilename = `${targetYear}-${monthStr}-${bulletinId}.pdf`;
          const pdfPath = path.join(pdfDir, pdfFilename);
          fs.writeFileSync(pdfPath, content);

          // Insert into DB
          const result = insertBulletin({
            id: bulletinId,
            account_id: account.id,
            filename: att.filename || pdfFilename,
            subject: parsed.subject,
            sender: parsed.from ? parsed.from.text : '',
            received_at: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
            month: targetMonth + 1,
            year: targetYear,
            file_path: pdfPath,
            size_bytes: content.length,
            sha256_hash: sha256
          });

          if (!result.duplicate) {
            newBulletins.push(result.id);
          }
        }
      } catch (err) {
        console.error(`Error processing email: ${err.message}`);
      }
    }

    lock.release();
    await client.logout();
  } catch (error) {
    throw new Error(`Échec de la récupération IMAP: ${error.message}`);
  }

  return newBulletins;
}
