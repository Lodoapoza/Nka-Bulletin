// Reprocess complet : ré-analyse chaque bulletin (texte + OCR si scanné),
// met à jour net_amount, nom et matricule. Non destructif.
// Usage : node scripts/reprocess-all.js
require('dotenv').config({ path: __dirname + '/../.env' });
const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db'));
const { analyzePdf } = require(path.join(__dirname, '..', 'src', 'pdfService'));

(async () => {
  const rows = db.prepare('SELECT id, filepath, filename FROM bulletins ORDER BY id').all();
  console.log(`${rows.length} bulletins à analyser`);
  let ok = 0, ocr = 0, errors = 0;

  for (const row of rows) {
    try {
      const a = await analyzePdf(row.filepath);
      db.prepare('UPDATE bulletins SET net_amount = ?, nom = ?, matricule = ? WHERE id = ?')
        .run(a.netAmount, a.nom, a.matricule, row.id);
      if (a.ocrUsed) ocr++;
      ok++;
      console.log(`#${row.id} [${row.filename}] payslip=${a.isPayslip} net=${a.netAmount} nom=${a.nom} mat=${a.matricule}${a.ocrUsed ? ' (OCR)' : ''}`);
    } catch (e) {
      errors++;
      console.log(`#${row.id} [${row.filename}] ERREUR: ${e.message}`);
    }
  }
  console.log(`\nTerminé : ${ok} analysés, ${ocr} via OCR, ${errors} erreurs`);
})();
