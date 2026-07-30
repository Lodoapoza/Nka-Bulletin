require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.log('[server] Mode production détecté');
} else if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

process.on('unhandledRejection', (reason) => {
  console.error('[server] UNHANDLED REJECTION:', reason);
  process.exit(1);
});
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const { fork } = require('child_process');

const { router: authRouter, authMiddleware } = require('./src/routes/auth');
const accountsRouter = require('./src/routes/accounts');
const { router: syncRouter } = require('./src/routes/sync');
const bulletinsRouter = require('./src/routes/bulletins');
const { router: pushRouter } = require('./src/routes/push');
const settingsRouter = require('./src/routes/settings');
const { initScheduler } = require('./src/scheduler');

const app = express();
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'short'));
app.use(express.json({ limit: '15mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Trop de tentatives, réessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter, authRouter);

app.use('/api/accounts', authMiddleware, accountsRouter);
app.use('/api/sync', authMiddleware, syncRouter);
app.use('/api/bulletins', authMiddleware, bulletinsRouter);
app.use('/api/push', authMiddleware, pushRouter);
app.use('/api/settings', authMiddleware, settingsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Gestion globale des erreurs Express
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

let workerProcess = null;
function startWorker() {
  workerProcess = fork(path.join(__dirname, 'worker.js'), [], { stdio: 'inherit' });
  workerProcess.on('exit', (code) => {
    console.error(`[server] Worker terminé (code ${code}), redémarrage dans 2s`);
    setTimeout(startWorker, 2000);
  });
  console.log('[server] Worker démarré, PID', workerProcess.pid);
}

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`✅ Nka Bulletin backend démarré sur http://localhost:${PORT}`);
  initScheduler();
  startWorker();
});
function shutdown(signal) {
  console.log(`[server] Signal ${signal} reçu, arrêt en cours...`);
  if (workerProcess) workerProcess.kill(signal);
  server.close(() => {
    console.log('[server] Serveur HTTP arrêté');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[server] Forcé la fermeture');
    process.exit(1);
  }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
