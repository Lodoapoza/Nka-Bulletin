const MONTH_MAP = {
  janvier: 1,
  janv: 1,
  jan: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  jul: 7,
  aout: 8,
  aou: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

const NAMES = Object.keys(MONTH_MAP).sort((a, b) => b.length - a.length).join('|');

const NAME_YEAR = new RegExp(`\\b(${NAMES})\\s*(1[89]\\d{2}|20\\d{2})`, 'i');
const YEAR_NAME = new RegExp(`(1[89]\\d{2}|20\\d{2})\\s*\\b(${NAMES})\\b`, 'i');
const YYYYMM = /(?:1[89]\d{2}|20\d{2})(0[1-9]|1[0-2])/;
const YYYY_MM = /(?:1[89]\d{2}|20\d{2})\s+(0[1-9]|1[0-2])\b/;
const MM_YYYY = /\b(0?[1-9]|1[0-2])\s+(1[89]\d{2}|20\d{2})\b/;

function norm(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function monthFromName(name) {
  return MONTH_MAP[name.toLowerCase()] || null;
}

function clampYear(year) {
  return year >= 1990 && year <= 2100 ? year : null;
}

function parsePeriodFromPayslip(text) {
  const s = norm(text);
  if (!s) return null;

  let m = NAME_YEAR.exec(s);
  if (m) {
    const year = clampYear(parseInt(m[2], 10));
    const month = monthFromName(m[1]);
    if (year && month) return { year, month };
  }

  m = YEAR_NAME.exec(s);
  if (m) {
    const year = clampYear(parseInt(m[1], 10));
    const month = monthFromName(m[2]);
    if (year && month) return { year, month };
  }

  m = s.match(YYYYMM);
  if (m) {
    const mm = m[0];
    const year = clampYear(parseInt(mm.slice(0, 4), 10));
    const month = parseInt(mm.slice(4, 6), 10);
    if (year && month >= 1 && month <= 12) return { year, month };
  }

  m = s.match(YYYY_MM);
  if (m) {
    const idx = s.indexOf(m[0]);
    const year = clampYear(parseInt(s.slice(idx, idx + 4), 10));
    const month = parseInt(m[1], 10);
    if (year && month >= 1 && month <= 12) return { year, month };
  }

  m = s.match(MM_YYYY);
  if (m) {
    const idx = s.indexOf(m[0]);
    const year = clampYear(parseInt(s.slice(idx + m[1].length + 1, idx + m[1].length + 5), 10));
    const month = parseInt(m[1], 10);
    if (year && month >= 1 && month <= 12) return { year, month };
  }

  return null;
}

/**
 * Détermine la période ET le type (paie / gratification) depuis le CONTENU du PDF.
 * Prioritaire sur le nom de fichier : en décembre, deux documents arrivent
 * (bulletin de paie + gratification) avec le même nom de fichier.
 *
 * Pattern 1 (le plus fiable) : le libellé après "Taux H.Suppl.:"
 *   - "Taux H.Suppl.: Decembre 2024 BASELIBELLE"  → paie, décembre 2024
 *   - "Taux H.Suppl.: Gratification 2024 BASELIBELLE" → gratification 2024
 * Pattern 2 (fallback) : "D. Retour: 01/12/2024 AU :31/12/2024"
 * Pattern 3 (fallback) : "Period: 01/12/24-25/12/24"
 * @returns {{type:'paie'|'gratification', year:number|null, month:number|null, label:string|null}|null}
 */
function parsePeriodFromText(text) {
  if (!text) return null;

  // Pattern 1 : libellé après "Taux H.Suppl.:" (texte normalisé : accents et
  // ponctuation retirés par norm(), espaces simples).
  const s = norm(text);
  const m1 = /taux\s*h\.?\s*suppl[^:]*:\s*([a-zà-ÿ]+(?:\s+20\d{2})?)/i.exec(s);
  if (m1) {
    const label = m1[1].trim();
    if (/gratification/.test(label)) {
      const ym = label.match(/(1[89]\d{2}|20\d{2})/);
      return {
        type: 'gratification',
        year: ym ? clampYear(parseInt(ym[1], 10)) : null,
        month: null,
        label,
      };
    }
    const parts = label.split(/\s+/);
    const month = monthFromName(parts[0]);
    const year = parts[1] ? clampYear(parseInt(parts[1], 10)) : null;
    if (month) return { type: 'paie', year, month, label };
  }

  // Patterns 2 et 3 : sur le texte BRUT (espaces simples) — norm() remplace les
  // "/" par des espaces, ce qui détruirait les dates.
  const raw = String(text || '').replace(/\s+/g, ' ').trim();

  // Pattern 2 : "D. Retour: 01/12/2024 AU :31/12/2024" (DD/MM/YYYY)
  const m2 = /D\.?\s*Retour\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*AU\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(raw);
  if (m2) {
    const year = clampYear(parseInt(m2[3], 10));
    const month = parseInt(m2[2], 10);
    if (year && month >= 1 && month <= 12) return { type: 'paie', year, month };
  }

  // Pattern 3 : "Period: 01/12/24-25/12/24" (année 2 ou 4 chiffres)
  const m3 = /Period\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(raw);
  if (m3) {
    let year = parseInt(m3[3], 10);
    if (year < 100) year += 2000;
    year = clampYear(year);
    const month = parseInt(m3[2], 10);
    if (year && month >= 1 && month <= 12) return { type: 'paie', year, month };
  }

  return null;
}

module.exports = { parsePeriodFromPayslip, parsePeriodFromText, monthFromName };
