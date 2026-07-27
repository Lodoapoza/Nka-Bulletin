import { simpleParser } from 'mailparser';

/**
 * Parse raw email content into structured data
 */
export async function parseEmailBody(rawEmail) {
  const parsed = await simpleParser(rawEmail);
  return {
    subject: parsed.subject || '',
    from: parsed.from ? parsed.from.text : '',
    to: parsed.to ? parsed.to.text : '',
    date: parsed.date,
    text: parsed.text || '',
    html: parsed.html || '',
    attachments: parsed.attachments || []
  };
}

/**
 * Extract PDF attachments from a parsed email
 */
export function extractAttachments(parsed) {
  return parsed.attachments.filter(att => {
    const contentType = (att.contentType || '').toLowerCase();
    const filename = (att.filename || '').toLowerCase();
    return contentType.includes('pdf') || filename.endsWith('.pdf');
  });
}
