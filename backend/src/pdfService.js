const fs = require('fs/promises');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
const { ocrPdf } = require('./ocrService');

// Marqueurs forts : le document EST un bulletin de paie.
const STRONG_MARKERS = [
  'bulletin de paie', 'fiche de paie', 'bulletin de salaire',
  'fiche de paye', 'payslip', 'bulletin de rémunération', 'bulletin de remuneration',
];

// Marqueurs faibles : caractéristiques d'un bulletin, mais insuffisants seuls.
const WEAK_MARKERS = [
  'net à payer', 'net a payer', 'net à percevoir', 'net a percevoir',
  'salaire net', 'total net', 'net mensuel', 'matricule',
  'num. employeur', 'n° inps', 'salaire de base',
];

// Nom de fichiers manifestement PAS des bulletins (docs, comparatifs, tests…)
const FILENAME_DENYLIST = [
  'comparatif', 'devis', 'support', 'procédure', 'procedure', 'ordre de paiement',
  'cours', 'test', 'reçu', 'recu', 'exemple', 'etat de salaire', 'etat des salaires',
];

// Marqueurs négatifs : présents dans le contenu, le document n'est PAS un bulletin
// (comparatifs de paie, reçus de caisse/INPS, procédures, supports de cours…).
// Regex avec limites de mots : "devis" seul est exclu car il matche "devise".
const NEGATIVE_MARKERS = [
  /\bcomparatif\b/i, /\betat(?:s)?\s+de\s+salaire\b/i, /\bétat(?:s)?\s+de\s+salaire\b/i,
  /\bre?çu\s+de\s+caisse\b/i, /\breçu\s+de\s+paiement\b/i,
  /\bsupport\s+de\s+cours\b/i, /\bproc[ée]dure\s+paie\b/i,
  /\bordre\s+de\s+paiement\b/i, /\btableau\s+de\s+paie\b/i,
  /\betat(?:s)?\s+de\s+paie\b/i, /\bétat(?:s)?\s+de\s+paie\b/i,
];

// Mots qui ne sont PAS des matricules (ex. "Matricule Nom Prénom" dans un tableau)
const MATRICULE_STOPWORDS = new Set([
  'nom', 'prénom', 'prenom', 'name', 'numero', 'numéro', 'n°', 'rem', 'remarque',
  'sexe', 'date', 'fonction', 'categorie', 'catégorie', 'employeur', 'échelon',
  'echelon', 'indice', 'situation', 'statut', 'et', 'de', 'du', 'des', 'la', 'le', 'les',
]);

// Règles d'extraction du net, dans l'ordre de priorité (validé sur la base réelle) :
// 1. Montant juste AVANT le label (format FEKOLA : "2 273 801NET A PAYER :Virement…")
// 2. Montant juste APRÈS le label (format : "NET A PAYER : 1 250 000")
// 3. "salaire net" (format BUL : "== Salaire Net == 1 337 624")
// 4. "total net" (format : "== TOTAL NET2 273 801")
const NET_PATTERNS = [
  /(\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)\s*net\s*[àa]\s*(?:payer|percevoir)/i,
  /net\s*[àa]\s*(?:payer|percevoir)\s*[:=]?\s*(\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /salaire\s*net[^0-9]{0,60}?(\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
  /total\s*net[^0-9]{0,60}?(\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?)/i,
];

// En-dessous de ce nombre de caractères extraits, on tente l'OCR (PDF scanné/fax).
const OCR_TEXT_THRESHOLD = 120;

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

function parseNetFromText(text) {
  if (!text) return null;
  for (const pattern of NET_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseAmountToNumber(match[1]);
      if (amount) return amount;
    }
  }
  return null;
}

/**
 * Extraction d'identité (nom + matricule) depuis le texte d'un bulletin.
 * Formats connus : "SAMAKE Louis Matricule : F2558" / "Nom : SAMAKE Louis …" / "F2558 N° 2558".
 */
function extractIdentity(text) {
  if (!text) return { nom: null, matricule: null };

  let matricule = null;
  const mm = text.match(/matricule\s*:?\s*([a-z0-9]{3,12})/i);
  if (mm && !MATRICULE_STOPWORDS.has(mm[1].toLowerCase())) matricule = mm[1].toUpperCase();
  if (!matricule) {
    const fm = text.match(/\bF\d{3,4}\b/i);
    if (fm) matricule = fm[0].toUpperCase();
  }

  let nom = null;
  const nm = text.match(/nom\s*:?\s*([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2})/i);
  if (nm) nom = nm[1].trim();
  if (!nom) {
    const bm = text.match(/([A-ZÀ-Ý]{2,}(?:\s+[A-Za-zÀ-ÿ]+){0,2})\s+Matricule/);
    if (bm) nom = bm[1].trim();
  }
  if (nom) {
    nom = nom
      .replace(/^(et|prénom|de|l'|d')\s+/i, '')
      .replace(/\s+(fonction|matricule|prénom|n°|rem|numéro|catégorie).*$/i, '')
      .replace(/^\s*net\s+[àa]\s+payer.*$/i, '')
      .trim();
    if (nom.length < 3 || /^net\b/i.test(nom)) nom = null;
  }

  return { nom: nom || null, matricule: matricule || null };
}

function isPayslipText(text) {
  if (!text) return false;
  const up = text.toLowerCase();
  if (NEGATIVE_MARKERS.some(m => m.test(text))) return false;
  if (STRONG_MARKERS.some(m => up.includes(m))) return true;
  const weakCount = WEAK_MARKERS.filter(m => up.includes(m)).length;
  const { matricule } = extractIdentity(text);
  return weakCount >= 2 && !!matricule;
}

/**
 * Vérifie que le bulletin appartient à l'un des matricules autorisés.
 * `ownerMatricule` peut contenir plusieurs matricules séparés par ';' (ou ',').
 */
function matchesOwner(analysis, ownerMatricule) {
  if (!ownerMatricule) return true;
  if (!analysis || !analysis.matricule) return false;
  const digits = s => String(s || '').toUpperCase().replace(/\D/g, '');
  const expected = String(ownerMatricule)
    .split(/[;,]/)
    .map(s => s.trim())
    .filter(Boolean);
  if (expected.length === 0) return true;
  const target = digits(analysis.matricule);
  return expected.some(m => digits(m) === target);
}

function isDeniedFilename(filename) {
  if (!filename) return false;
  const normalized = filename
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/_/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return FILENAME_DENYLIST.some(k => normalized.includes(k));
}

async function extractText(buffer) {
  try {
    const data = await pdfParse(buffer);
    return (data.text || '').replace(/\s+/g, ' ').trim();
  } catch (_) {
    return '';
  }
}

/**
 * Analyse complète d'un bulletin : texte (ou OCR si scanné), validation "est un bulletin",
 * montant net, nom et matricule.
 * @returns {Promise<{text:string, ocrUsed:boolean, isPayslip:boolean, netAmount:number|null, nom:string|null, matricule:string|null}>}
 */
async function analyzePdf(input, { ocr = true } = {}) {
  const isPath = typeof input === 'string';
  const buffer = Buffer.isBuffer(input) ? input : await fs.readFile(input);
  const filename = isPath ? input.split(/[\\/]/).pop() : null;
  if (isDeniedFilename(filename)) {
    return { text: '', ocrUsed: false, isPayslip: false, netAmount: null, nom: null, matricule: null };
  }
  let text = await extractText(buffer);
  let ocrUsed = false;

  if (ocr && text.length < OCR_TEXT_THRESHOLD) {
    try {
      const ocrText = await ocrPdf(buffer);
      if (ocrText && ocrText.length > text.length) {
        text = ocrText.replace(/\s+/g, ' ').trim();
        ocrUsed = true;
      }
    } catch (err) {
      console.warn('[pdfService] OCR indisponible:', err.message);
    }
  }

  const { nom, matricule } = extractIdentity(text);
  return {
    text,
    ocrUsed,
    isPayslip: isPayslipText(text),
    netAmount: parseNetFromText(text),
    nom,
    matricule,
  };
}

/**
 * Compat : extraction du net seul à partir d'un chemin ou d'un Buffer.
 */
async function extractNetAmount(filePathOrBuffer) {
  const buffer = Buffer.isBuffer(filePathOrBuffer) ? filePathOrBuffer : await fs.readFile(filePathOrBuffer);
  const text = await extractText(buffer);
  return parseNetFromText(text);
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

module.exports = {
  extractNetAmount, mergePdfs, analyzePdf,
  parseNetFromText, extractIdentity, isPayslipText, matchesOwner, isDeniedFilename,
};
