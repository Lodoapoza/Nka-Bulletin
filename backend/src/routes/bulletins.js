const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { mergePdfs } = require('../pdfService');

const router = express.Router();

// GET /api/bulletins?year=2026&month=7&q=texte
router.get('/', (req, res) => {
  const { year, month, q } = req.query;
  let sql = `SELECT b.*, a.email as account_email, a.provider FROM bulletins b
             LEFT JOIN accounts a ON a.id = b.account_id
             WHERE b.device_id = ?`;
  const params = [req.deviceId];

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
  const totalThisYear = db.prepare(
    'SELECT COUNT(*) as n FROM bulletins WHERE device_id = ? AND year = ?'
  ).get(req.deviceId, currentYear).n;

  const latest = db.prepare(
    'SELECT * FROM bulletins WHERE device_id = ? ORDER BY year DESC, month DESC, received_at DESC LIMIT 1'
  ).get(req.deviceId);

  const device = db.prepare('SELECT extract_amounts FROM devices WHERE id = ?').get(req.deviceId);
  let cumulativeNet = null;
  if (device && device.extract_amounts) {
    const row = db.prepare(
      'SELECT SUM(net_amount) as total FROM bulletins WHERE device_id = ? AND year = ? AND net_amount IS NOT NULL'
    ).get(req.deviceId, currentYear);
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
  const row = db.prepare('SELECT * FROM bulletins WHERE id = ? AND device_id = ?').get(req.params.id, req.deviceId);
  if (!row) return res.status(404).json({ error: 'Bulletin introuvable' });
  if (!fs.existsSync(row.filepath)) return res.status(410).json({ error: 'Fichier manquant sur le disque' });
  res.download(row.filepath, row.filename);
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM bulletins WHERE id = ? AND device_id = ?').get(req.params.id, req.deviceId);
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
  let rows;

  if (Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    rows = db.prepare(
      `SELECT * FROM bulletins WHERE device_id = ? AND id IN (${placeholders}) ORDER BY year, month`
    ).all(req.deviceId, ...ids);
  } else if (year) {
    rows = db.prepare(
      'SELECT * FROM bulletins WHERE device_id = ? AND year = ? ORDER BY month'
    ).all(req.deviceId, Number(year));
  } else if (lastNMonths) {
    const n = Number(lastNMonths);
    const now = new Date();
    const threshold = now.getFullYear() * 12 + now.getMonth() + 1 - n + 1;
    rows = db.prepare(
      'SELECT * FROM bulletins WHERE device_id = ? AND (year * 12 + month) >= ? ORDER BY year, month'
    ).all(req.deviceId, threshold);
  } else {
    return res.status(400).json({ error: 'Fournir ids, year ou lastNMonths' });
  }

  if (!rows.length) return res.status(404).json({ error: 'Aucun bulletin trouvé pour cette sélection' });

  const filePaths = rows.filter(r => fs.existsSync(r.filepath)).map(r => r.filepath);
  if (!filePaths.length) return res.status(410).json({ error: 'Aucun fichier disponible sur le disque' });

  try {
    const mergedBytes = await mergePdfs(filePaths);
    const filename = `nka-bulletins-fusion-${Date.now()}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(Buffer.from(mergedBytes));
  } catch (e) {
    res.status(500).json({ error: `Échec de la fusion PDF : ${e.message}` });
  }
});

module.exports = router;
