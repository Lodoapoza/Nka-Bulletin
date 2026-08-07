const express = require('express');
const db = require('../db');

const router = express.Router();

const pad2 = (m) => String(m).padStart(2, '0');

// Concatène un résultat SQL (year, month, net_amount) en point { year, month, net }
const point = (r) => ({ year: r.year, month: r.month, net: Math.round(r.net_amount * 100) / 100 });

// Agrégats (moyenne, min/max globaux) sur une liste de lignes SQL.
function aggregate(rows) {
  if (!rows.length) return null;
  const totalNet = rows.reduce((a, r) => a + r.net_amount, 0);
  let min = rows[0];
  let max = rows[0];
  for (const r of rows) {
    if (r.net_amount < min.net_amount) min = r;
    if (r.net_amount > max.net_amount) max = r;
  }
  return {
    count: rows.length,
    totalNet: Math.round(totalNet * 100) / 100,
    avgNet: Math.round((totalNet / rows.length) * 100) / 100,
    min: point(min),
    max: point(max),
  };
}

// GET /api/analyse/salary?year=2026
// Évolution des salaires net sur les bulletins du device (lecture seule de
// bulletins.year / month / net_amount — pas de nouvelle colonne en base).
// - sans `year` : toute la période (série complète)
// - avec `year` : uniquement cette année (série, deltas, mois manquants filtrés)
// `totals` (moyenne, min/max) et `period` restent GLOBAUX pour garder le
// min/max de référence affiché en haut même quand on segmente par année.
// hidden:true si l'option « Analyse des montants PDF » est désactivée.
router.get('/salary', (req, res) => {
  const device = db.prepare('SELECT extract_amounts FROM devices WHERE id = ?').get(req.deviceId);
  if (!device || !device.extract_amounts) {
    return res.json({ hidden: true });
  }

  const yearQ = req.query.year ? Number(req.query.year) : null;

  // Toutes les données (net non nul) : sert au global + au par-année.
  const allRows = db.prepare(
    'SELECT year, month, net_amount FROM bulletins WHERE device_id = ? AND net_amount IS NOT NULL ORDER BY year, month'
  ).all(req.deviceId);

  // Série affichée (toutes ou une seule année selon le filtre).
  const rows = yearQ ? allRows.filter(r => r.year === yearQ) : allRows;

  const years = [...new Set(allRows.map(r => r.year))].sort((a, b) => a - b);

  const first = allRows[0];
  const last = allRows[allRows.length - 1];
  const period = {
    startMonth: first ? `${first.year}-${pad2(first.month)}` : null,
    endMonth: last ? `${last.year}-${pad2(last.month)}` : null,
  };

  // Répartition par année + agrégats globaux.
  const totals = aggregate(allRows);
  const perYear = {};
  const byYear = {};
  for (const r of allRows) {
    (byYear[r.year] || (byYear[r.year] = [])).push(r);
  }
  for (const y of years) perYear[String(y)] = aggregate(byYear[y]);

  const series = rows.map(point);

  // Variation vs mois précédent, dans la série affichée (toutes années ou une seule).
  const deltas = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    deltas.push({
      year: cur.year,
      month: cur.month,
      prev: prev.net,
      net: cur.net,
      pct: prev.net ? Math.round(((cur.net - prev.net) / prev.net) * 1000) / 10 : null,
    });
  }

  // Mois manquants : uniquement les mois déjà écoulés — ni le mois courant
  // (son bulletin n'arrive qu'en fin de mois), ni les mois futurs, ni une année future.
  let missing = [];
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;
  const targetYear = yearQ || (years.length === 1 ? years[0] : null);
  if (targetYear && targetYear <= nowYear) {
    const lastMonth = targetYear === nowYear ? Math.max(0, nowMonth - 1) : 12;
    const present = new Set(byYear[targetYear] ? byYear[targetYear].map(r => r.month) : []);
    for (let m = 1; m <= lastMonth; m++) {
      if (!present.has(m)) missing.push(`${targetYear}-${pad2(m)}`);
    }
  }

  // Tendance : comparaison dernier vs premier point de la série (seuil ±5 %).
  let trend = 'flat';
  if (series.length >= 2) {
    const firstNet = series[0].net;
    const lastNet = series[series.length - 1].net;
    if (firstNet) {
      const growth = ((lastNet - firstNet) / firstNet) * 100;
      if (growth > 5) trend = 'up';
      else if (growth < -5) trend = 'down';
    }
  }

  res.json({
    years,
    period,
    totals,
    perYear,
    series,
    deltas,
    missing,
    trend,
  });
});

module.exports = router;