const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { parsePeriodFromPayslip } = require('../src/period');

function isValidPdf(filepath) {
  try {
    const st = fs.statSync(filepath);
    if (st.size === 0) return false;
    const fd = fs.openSync(filepath, 'r');
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    return buf.subarray(0, n).toString('latin1').includes('%PDF');
  } catch (e) {
    return false;
  }
}

const all = db.prepare('SELECT id, account_id, filename, filepath, year, month, received_at FROM bulletins').all();

let fixed = 0;
let deletedInvalid = 0;
let deletedDup = 0;

const seen = new Map();

for (const row of all) {
  let changed = false;

  const period = parsePeriodFromPayslip(row.filename);
  if (period) {
    if (row.year !== period.year || row.month !== period.month) {
      db.prepare('UPDATE bulletins SET year = ?, month = ? WHERE id = ?')
        .run(period.year, period.month, row.id);
      console.log(`[fix-période] #${row.id} ${row.filename}: ${row.year}-${row.month} -> ${period.year}-${period.month}`);
      fixed++;
      row.year = period.year;
      row.month = period.month;
    }
  }

  if (!isValidPdf(row.filepath)) {
    db.prepare('DELETE FROM bulletins WHERE id = ?').run(row.id);
    try { fs.unlinkSync(row.filepath); } catch (_) {}
    console.log(`[supprime-invalide] #${row.id} ${row.filename} (${row.filepath})`);
    deletedInvalid++;
    continue;
  }

  const key = `${row.account_id}|${row.filename}|${row.year}|${row.month}`;
  const existing = seen.get(key);
  if (existing) {
    const keep = row.received_at >= existing.received_at ? row : existing;
    const drop = keep.id === row.id ? existing : row;
    db.prepare('DELETE FROM bulletins WHERE id = ?').run(drop.id);
    try { fs.unlinkSync(drop.filepath); } catch (_) {}
    console.log(`[supprime-doublon] #${drop.id} ${drop.filename} (${drop.year}-${drop.month}), garde #${keep.id}`);
    deletedDup++;
    seen.set(key, keep);
  } else {
    seen.set(key, row);
  }
}

console.log('\n=== RÉSULTAT ===');
console.log(`Périodes corrigées: ${fixed}`);
console.log(`Fichiers invalides supprimés: ${deletedInvalid}`);
console.log(`Doublons supprimés: ${deletedDup}`);

const dist = db.prepare('SELECT year, month, COUNT(*) n FROM bulletins GROUP BY year, month ORDER BY year DESC, month DESC').all();
console.log('\nDistribution restante:');
for (const d of dist) {
  console.log(`${d.year}-${String(d.month).padStart(2, '0')}: ${d.n}`);
}
