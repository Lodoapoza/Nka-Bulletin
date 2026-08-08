const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { mergePdfs, analyzePdf } = require('../pdfService');

const router = express.Router();

// GET /api/bulletins?year=2026&month=7&q=texte
router.get('/', (req, res) => {
  const { year, month, q } = req.query;
  const mat = req.userMatricule;
  const where = mat ? 'b.user_matricule = ?' : 'b.device_id = ?';
  let sql = `SELECT b.*, a.email as account_email, a.provider FROM bulletins b
             LEFT JOIN accounts a ON a.id = b.account_id
             WHERE ${where}`;
  const params = [mat || req.deviceId];

  if (year) { sql += ' AND b.year = ?'; params.push(Number(year)); }
  if (month) { sql += ' AND b.month = ?'; params.push(Number(month)); }
  if (q) { sql += ' AND (b.filename LIKE ? OR a.email LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  sql += ' ORDER BY b.year DESC, b.month DESC, b.received_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Statistiques du tableau de bord
router.get('/stats', (req, res) => {
  const currentYear = new Date().getFullYear();
  const mat = req.userMatricule;
  const where = mat ? 'user_matricule = ?' : 'device_id = ?';
  const totalThisYear = db.prepare(
    `SELECT COUNT(*) as n FROM bulletins WHERE ${where} AND year = ?`
  ).get(mat || req.deviceId, currentYear).n;

  const latest = db.prepare(
    `SELECT * FROM bulletins WHERE ${where} ORDER BY year DESC, month DESC, received_at DESC LIMIT 1`
  ).get(mat || req.deviceId);

  const device = db.prepare('SELECT extract_amounts FROM devices WHERE id = ?').get(req.deviceId);
  let cumulativeNet = null;
  if (device && device.extract_amounts) {
    const row = db.prepare(
      `SELECT SUM(net_amount) as total FROM bulletins WHERE ${where} AND year = ? AND net_amount IS NOT NULL`
    ).get(mat || req.deviceId, currentYear);
    cumulativeNet = row.total;
  }

  res.json({
    totalThisYear,
    latest,
    lastNetAmount: (device && device.extract_amounts) ? latest?.net_amount ?? null : null,
    cumulativeNetThisYear: cumulativeNet,
    amountsEnabled: !!(device && device.extract_amounts),
  });
});

// Téléchargement d'un bulletin individuel
router.get('/:id/download', (req, res) => {
  const mat = req.userMatricule;
  const where = mat ? 'user_matricule = ?' : 'device_id = ?';
  const row = db.prepare(`SELECT * FROM bulletins WHERE id = ? AND ${where}`).get(req.params.id, mat || req.deviceId);
  if (!row) return res.status(404).json({ error: 'Bulletin introuvable' });
  if (!fs.existsSync(row.filepath)) return res.status(410).json({ error: 'Fichier manquant sur le disque' });
  const mm = String(row.month).padStart(2, '0');
  const filename = `Bulletin_${row.year}-${mm}${row.matricule ? '_' + row.matricule : ''}.pdf`;
  res.download(row.filepath, filename);
});

router.delete('/:id', (req, res) => {
  const mat = req.userMatricule;
  const where = mat ? 'user_matricule = ?' : 'device_id = ?';
  const row = db.prepare(`SELECT * FROM bulletins WHERE id = ? AND ${where}`).get(req.params.id, mat || req.deviceId);
  if (!row) return res.status(404).json({ error: 'Bulletin introuvable' });
  db.prepare('DELETE FROM bulletins WHERE id = ?').run(row.id);
  try { fs.unlinkSync(row.filepath); } catch (_) {}
  res.json({ ok: true });
});

/**
 * Fusionne plusieurs bulletins sélectionnés (ids explicites, ou toute une année, ou les N derniers
 * mois) en un seul PDF téléchargeable / partageable.
 * body: { ids: [1,2,3] } OU { year: 2026 } OU { lastNMonths: 3 }
 */
router.post('/export/merge', async (req, res) => {
  const { ids, year, lastNMonths } = req.body;
  const mat = req.userMatricule;
  const where = mat ? 'user_matricule = ?' : 'device_id = ?';
  let rows;

  if (Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    rows = db.prepare(
      `SELECT * FROM bulletins WHERE ${where} AND id IN (${placeholders}) ORDER BY year, month`
    ).all(mat || req.deviceId, ...ids);
  } else if (year) {
    rows = db.prepare(
      `SELECT * FROM bulletins WHERE ${where} AND year = ? ORDER BY month`
    ).all(mat || req.deviceId, Number(year));
  } else if (lastNMonths) {
    const n = Number(lastNMonths);
    const now = new Date();
    // Mois 1-indexé du mois courant + fenêtre de n mois (ex: août 2026, n=3 → mai).
    // Attention : ne PAS ajouter +1 ici — le seuil doit être le premier mois inclus.
    const threshold = now.getFullYear() * 12 + now.getMonth() + 1 - n;
    rows = db.prepare(
      `SELECT * FROM bulletins WHERE ${where} AND (year * 12 + month) >= ? ORDER BY year, month`
    ).all(mat || req.deviceId, threshold);
  } else {
    return res.status(400).json({ error: 'Fournir ids, year ou lastNMonths' });
  }

  if (!rows.length) return res.status(404).json({ error: 'Aucun bulletin trouvé pour cette sélection' });

  const filePaths = rows.filter(r => fs.existsSync(r.filepath)).map(r => r.filepath);
  if (!filePaths.length) return res.status(410).json({ error: 'Aucun fichier disponible sur le disque' });

  try {
    const mergedBytes = await mergePdfs(filePaths);
    // Nom descriptif : période réelle des bulletins fusionnés + matricule
    // (ex. "Bulletins_2026-01_a_2026-07_F2558.pdf", ou "Bulletin_2026-07_F2558.pdf" si un seul)
    const sorted = [...rows].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const matricule = rows.find(r => r.matricule)?.matricule || '';
    const mm = (m) => String(m).padStart(2, '0');
    const period = first.year === last.year && first.month === last.month
      ? `${first.year}-${mm(first.month)}`
      : `${first.year}-${mm(first.month)}_a_${last.year}-${mm(last.month)}`;
    const filename = `${rows.length === 1 ? 'Bulletin' : 'Bulletins'}_${period}${matricule ? '_' + matricule : ''}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(Buffer.from(mergedBytes));
  } catch (e) {
    res.status(500).json({ error: `Échec de la fusion PDF : ${e.message}` });
  }
});

// Reprocess les bulletins existants : extrait net + nom + matricule (avec OCR si scanné)
router.post('/reprocess-amounts', async (req, res) => {
  const mat = req.userMatricule;
  const where = mat ? 'user_matricule = ?' : 'device_id = ?';
  const rows = db.prepare(
    `SELECT id, filepath FROM bulletins WHERE ${where}`
  ).all(mat || req.deviceId);

  let processed = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      if (!fs.existsSync(row.filepath)) continue;
      const analysis = await analyzePdf(row.filepath);
      db.prepare('UPDATE bulletins SET net_amount = ?, nom = ?, matricule = ? WHERE id = ?')
        .run(analysis.netAmount, analysis.nom, analysis.matricule, row.id);
      processed++;
    } catch (_) { errors++; }
  }
  res.json({ ok: true, processed, total: rows.length, errors });
});

module.exports = router;
