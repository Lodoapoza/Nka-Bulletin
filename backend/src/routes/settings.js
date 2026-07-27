import { Router } from 'express';
import { getSettings, updateSetting } from '../db.js';

const router = Router();

// GET /api/settings — get all settings
router.get('/', (req, res) => {
  try {
    const settings = getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settings — update a setting
router.put('/', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key et value requis' });
    }
    const result = updateSetting(key, value);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
