import pdf from 'pdf-parse';
import fs from 'fs';

/**
 * Extract salary information from a PDF bulletin
 *
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<{netSalary: number|null, annualTotal: number|null, success: boolean, error?: string}>}
 */
export async function analyzePDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const text = data.text;

    const netSalary = extractNetSalary(text);
    const annualTotal = extractAnnualTotal(text);

    return {
      netSalary,
      annualTotal,
      success: netSalary !== null || annualTotal !== null,
      textLength: text.length,
      pageCount: data.numpages
    };
  } catch (error) {
    return {
      netSalary: null,
      annualTotal: null,
      success: false,
      error: error.message
    };
  }
}

/**
 * Extract "net à payer" amount from text
 */
function extractNetSalary(text) {
  const patterns = [
    /net\s*(?:à|a)\s*payer\s*:?\s*([\d\s.,]+)\s*(?:€|EUR|euros)?/i,
    /salaire\s*net\s*(?:mensuel)?\s*:?\s*([\d\s.,]+)\s*(?:€|EUR|euros)?/i,
    /NET\s*(?:À|A)\s*PAYER\s*:?\s*([\d\s.,]+)/i,
    /net\s*pay\s*:?\s*([\d\s.,]+)\s*(?:€|EUR|euros)?/i,
    /total\s*net\s*(?:à|a)\s*payer\s*:?\s*([\d\s.,]+)/i,
    /montant\s*net\s*(?:à|a)\s*payer\s*:?\s*([\d\s.,]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseAmount(match[1]);
      if (amount !== null) return amount;
    }
  }

  return null;
}

/**
 * Extract annual cumulative total from text
 */
function extractAnnualTotal(text) {
  const patterns = [
    /cumul\s*(?:annuel|net|brut|imposable)?\s*:?\s*([\d\s.,]+)\s*(?:€|EUR|euros)?/i,
    /total\s*(?:annuel|net\s*imposable)?\s*:?\s*([\d\s.,]+)\s*(?:€|EUR|euros)?/i,
    /net\s*imposable\s*(?:cumul|annuel|total)?\s*:?\s*([\d\s.,]+)\s*(?:€|EUR|euros)?/i,
    /cumul\s*net\s*imposable\s*:?\s*([\d\s.,]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseAmount(match[1]);
      if (amount !== null) return amount;
    }
  }

  return null;
}

/**
 * Parse a formatted amount string (French/European format) to a number
 *
 * Handles:
 * - "1 234,56" (French: space as thousand sep, comma as decimal)
 * - "1234.56" (English)
 * - "1,234.56" (English with comma thousand sep)
 * - "1234,56" (European without thousand sep)
 */
function parseAmount(str) {
  if (!str) return null;

  let cleaned = str.trim();

  // If contains both comma and dot, determine which is decimal
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // If dot is before comma: "1.234,56" → European style
    if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // "1,234.56" → English style
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Only comma: "1234,56" or "1 234,56"
    cleaned = cleaned.replace(/\s/g, '').replace(',', '.');
  } else {
    // Only dot: "1234.56" or "1.234"
    // If multiple dots, likely thousand separators
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount > 1) {
      // "1.234.56" doesn't make sense, probably "1.234"
      // Actually let's be conservative: if the last part after the last dot
      // has exactly 2 digits, keep the last dot as decimal
      const parts = cleaned.split('.');
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 2) {
        cleaned = parts.slice(0, -1).join('') + '.' + lastPart;
      } else {
        cleaned = cleaned.replace(/\./g, '');
      }
    }
    cleaned = cleaned.replace(/\s/g, '');
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
