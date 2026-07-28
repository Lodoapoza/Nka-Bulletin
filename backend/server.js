require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { router: authRouter, authMiddleware } = require('./src/routes/auth');
const accountsRouter = require('./src/routes/accounts');
const { router: syncRouter } = require('./src/routes/sync');
const bulletinsRouter = require('./src/routes/bulletins');
const { router: pushRouter } = require('./src/routes/push');
const settingsRouter = require('./src/routes/settings');
const { initScheduler } = require('./src/scheduler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Route publique : enregistrement de l'appareil (pas de PIN côté serveur, cf. src/routes/auth.js)
app.use('/api/auth', authRouter);

// Toutes les routes suivantes exigent le token d'appareil
app.use('/api/accounts', authMiddleware, accountsRouter);
app.use('/api/sync', authMiddleware, syncRouter);
app.use('/api/bulletins', authMiddleware, bulletinsRouter);
app.use('/api/push', authMiddleware, pushRouter);
app.use('/api/settings', authMiddleware, settingsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Nka Bulletin backend démarré sur http://localhost:${PORT}`);
  initScheduler();
});
