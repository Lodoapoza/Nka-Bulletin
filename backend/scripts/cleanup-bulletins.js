// Nettoyage : supprime les bulletins qui ne sont PAS de vrais bulletins de paie,
// ou (si le device a un owner_matricule) qui appartiennent à un autre salarié.
// DRY-RUN par défaut : --apply pour réellement supprimer.
// Usage : node scripts/cleanup-bulletins.js [--apply]
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const fs = require('fs');
const db = require(path.join(__dirname, '..', 'src', 'db'));
const { analyzePdf, matchesOwner } = require(path.join(__dirname, '..', 'src', 'pdfService'));

const apply = process.argv.includes('--apply');
const byDevice = db.prepare('SELECT id, owner_matricule FROM devices').all();
const ownerByDevice = Object.fromEntries(byDevice.map(d => [d.id, d.owner_matricule || null]));

(async () => {
  const rows = db.prepare('SELECT id, device_id, filepath, filename FROM bulletins ORDER BY id').all();
  let removed = 0, kept = 0;

  for (const row of rows) {
    let analysis;
    try {
      analysis = await analyzePdf(row.filepath);
    } catch (e) {
      console.log(`#${row.id} [${row.filename}] ERREUR analyse, conservé : ${e.message}`);
      kept++;
      continue;
    }
    const owner = ownerByDevice[row.device_id];
    const notPayslip = !analysis.isPayslip;
    const notOwned = !!owner && !matchesOwner(analysis, owner);
    const reason = notPayslip ? 'pas un bulletin de paie' : (notOwned ? `matricule différent (${analysis.matricule || '?'} ≠ ${owner})` : null);

    if (!reason) {
      kept++;
      continue;
    }

    console.log(`#${row.id} [${row.filename}] SUPPRIMER — ${reason}`);
    if (apply) {
      db.prepare('DELETE FROM bulletins WHERE id = ?').run(row.id);
      try { fs.unlinkSync(row.filepath); } catch (_) {}
      removed++;
    }
  }

  console.log(`\n${apply ? `SUPPRESSION RÉELLE : ${removed} bulletins retirés.` : `DRY-RUN : ${removed} bulletins seraient retirés (lancez avec --apply).`} — ${kept} conservés.`);
})();
