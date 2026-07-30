const fs = require('fs/promises');
const { existsSync } = require('fs');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');

const NET_AMOUNT_PATTERNS = [
  /net\s*[àa]\s*(?:payer|percevoir)[^0-9XOFCFA€\s]{0,30}(?:[XOFCFA€\s]*)([\d]{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /net\s*payé[^0-9XOFCFA€\s]{0,30}(?:[XOFCFA€\s]*)([\d]{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /salaire\s*net[^0-9XOFCFA€\s]{0,30}(?:[XOFCFA€\s]*)([\d]{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /net\s*mensuel[^0-9XOFCFA€\s]{0,30}(?:[XOFCFA€\s]*)([\d]{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /total\s*net[^0-9XOFCFA€\s]{0,30}(?:[XOFCFA€\s]*)([\d]{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /net\s*à\s*payer\s*:?[^0-9]{0,40}(\d[\d\s.,]*)/i,
];

function parseAmountToNumber(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (/,\d{1,2}$/.test(s)) {
    const normalized = s.replace(/[\s.]/g, '').replace(',', '.');
    const n = parseFloat(normalized);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const cleaned = s.replace(/[,\s]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function extractNetAmount(filePathOrBuffer) {
  const buffer = Buffer.isBuffer(filePathOrBuffer) ? filePathOrBuffer : await fs.readFile(filePathOrBuffer);
  const data = await pdfParse(buffer);
  const text = data.text || '';
  for (const pattern of NET_AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseAmountToNumber(match[1]);
      if (amount) return amount;
    }
  }
  return null;
}

async function mergePdfs(filePaths) {
  const merged = await PDFDocument.create();
  for (const filePath of filePaths) {
    try {
      const bytes = await fs.readFile(filePath);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copiedPages = await merged.copyPages(doc, doc.getPageIndices());
      copiedPages.forEach(page => merged.addPage(page));
    } catch (err) {
      console.error('[mergePdfs] Skipping file, load error:', filePath, err.message);
    }
  }
  const pageCount = merged.getPageCount();
  if (pageCount === 0) throw new Error('Aucune page valide à fusionner');
  return merged.save();
}

module.exports = { extractNetAmount, mergePdfs };
