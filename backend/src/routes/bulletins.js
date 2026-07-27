import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  getAllBulletins,
  getBulletinById,
  toggleFavorite,
  updateBulletinAnalysis
} from '../db.js';
import { analyzePDF } from '../pdf/analyzer.js';
import { mergeSelection } from '../pdf/merger.js';

const router = Router();

// GET /api/bulletins — list with filters
router.get('/', (req, res) => {
  try {
    const { year, month, search, favorites, page, limit } = req.query;
    const result = getAllBulletins({
      year: year || undefined,
      month: month || undefined,
      search: search || undefined,
      favorites: favorites === 'true' || favorites === '1',
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bulletins/merge — merge selected bulletins (must be BEFORE :id)
router.post('/merge', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs des bulletins requis (tableau non vide)' });
    }
    const result = await mergeSelection(ids);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bulletins/:id — detail
router.get('/:id', (req, res) => {
  try {
    const bulletin = getBulletinById(req.params.id);
    if (!bulletin) return res.status(404).json({ error: 'Bulletin introuvable' });
    res.json(bulletin);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bulletins/:id/favorite — toggle favorite
router.post('/:id/favorite', (req, res) => {
  try {
    const result = toggleFavorite(req.params.id);
    if (!result) return res.status(404).json({ error: 'Bulletin introuvable' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bulletins/:id/download — download PDF file
router.get('/:id/download', (req, res) => {
  try {
    const bulletin = getBulletinById(req.params.id);
    if (!bulletin) return res.status(404).json({ error: 'Bulletin introuvable' });

    if (!fs.existsSync(bulletin.file_path)) {
      return res.status(404).json({ error: 'Fichier introuvable sur le disque' });
    }

    res.download(bulletin.file_path, bulletin.filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bulletins/:id/share — create a shareable copy
router.post('/:id/share', async (req, res) => {
  try {
    const bulletin = getBulletinById(req.params.id);
    if (!bulletin) return res.status(404).json({ error: 'Bulletin introuvable' });

    if (!fs.existsSync(bulletin.file_path)) {
      return res.status(404).json({ error: 'Fichier introuvable sur le disque' });
    }

    // Copy to a share directory
    const shareDir = path.join('data', 'shares');
    fs.mkdirSync(shareDir, { recursive: true });

    const shareId = uuidv4();
    const ext = path.extname(bulletin.filename) || '.pdf';
    const shareFilename = `share-${shareId}${ext}`;
    const sharePath = path.join(shareDir, shareFilename);

    fs.copyFileSync(bulletin.file_path, sharePath);

    res.json({
      success: true,
      shareId,
      filename: shareFilename,
      filePath: sharePath
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bulletins/:id/analyze — (bonus) analyze a PDF for salary data
router.post('/:id/analyze', async (req, res) => {
  try {
    const bulletin = getBulletinById(req.params.id);
    if (!bulletin) return res.status(404).json({ error: 'Bulletin introuvable' });

    if (!fs.existsSync(bulletin.file_path)) {
      return res.status(404).json({ error: 'Fichier introuvable sur le disque' });
    }

    const result = await analyzePDF(bulletin.file_path);

    if (result.success) {
      updateBulletinAnalysis(req.params.id, {
        netSalary: result.netSalary,
        annualTotal: result.annualTotal
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
