const fs = require('fs/promises');
const { existsSync } = require('fs');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');

// Motifs courants sur les bulletins de paie francophones pour repérer le "net à payer"
const NET_AMOUNT_PATTERNS = [
  /net\s*[àa]\s*payer[^0-9]{0,20}([\d]{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /net\s*payé[^0-9]{0,20}([\d]{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /salaire\s*net[^0-9]{0,20}([\d]{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
];

function parseAmountToNumber(raw) {
  if (!raw) return null;
  // On retire les espaces (séparateur de milliers) et on normalise la virgule décimale
  const cleaned = raw.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
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
  const docs = await Promise.all(
    filePaths.map(async (filePath) => {
      const bytes = await fs.readFile(filePath);
      return PDFDocument.load(bytes);
    })
  );
  for (const doc of docs) {
    const copiedPages = await merged.copyPages(doc, doc.getPageIndices());
    copiedPages.forEach(page => merged.addPage(page));
  }
  return merged.save(); // Uint8Array
}

module.exports = { extractNetAmount, mergePdfs };
