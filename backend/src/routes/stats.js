import { Router } from 'express';
import { getStats, getYearlyStats } from '../db.js';

const router = Router();

// GET /api/stats/dashboard — dashboard statistics
router.get('/dashboard', (req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stats/yearly/:year — yearly statistics by month
router.get('/yearly/:year', (req, res) => {
  try {
    const year = parseInt(req.params.year);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Année invalide' });
    }
    const stats = getYearlyStats(year);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
