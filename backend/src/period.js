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

module.exports = { parsePeriodFromPayslip, monthFromName };
