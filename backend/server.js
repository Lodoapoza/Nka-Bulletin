require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.log('[server] Mode production détecté');
} else if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

let server;
let workerProcess = null;
let workerRestartCount = 0;
let workerRestartTimer = null;
const MAX_WORKER_RESTARTS = 10;

process.on('unhandledRejection', (reason) => {
  console.error('[server] UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] UNCAUGHT EXCEPTION:', err);
  if (server) {
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000);
  } else {
    process.exit(1);
  }
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
const { router: adminRouter, licenceGate } = require('./src/routes/admin');
const accountsRouter = require('./src/routes/accounts');
const { router: syncRouter } = require('./src/routes/sync');
const bulletinsRouter = require('./src/routes/bulletins');
const analyseRouter = require('./src/routes/analyse');
const { router: pushRouter } = require('./src/routes/push');
const settingsRouter = require('./src/routes/settings');
const deviceRouter = require('./src/routes/device');
const { initScheduler } = require('./src/scheduler');
const { updateHeartbeat } = require('./src/heartbeat');

const app = express();

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'short'));
app.use(express.json({ limit: '15mb' }));

const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT) || 25000;
app.use((req, res, next) => {
  res.setTimeout(REQUEST_TIMEOUT, () => {
    console.error('[server] Timeout:', req.method, req.path);
    if (!res.headersSent) res.status(503).json({ error: 'Délai dépassé', code: 'TIMEOUT' });
    req.destroy();
  });
  next();
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives, réessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter, authRouter);

// Admin : rate limit ne comptant QUE les échecs (5 tentatives de mot de passe / 10 min / IP).
const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives, réessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/admin', adminLimiter, adminRouter);

// licenceGate : un appareil qui déclare un owner_matricule sans licence active est bloqué (403).
app.use('/api/accounts', authMiddleware, accountsRouter);
app.use('/api/sync', authMiddleware, licenceGate, syncRouter);
app.use('/api/bulletins', authMiddleware, licenceGate, bulletinsRouter);
app.use('/api/analyse', authMiddleware, licenceGate, analyseRouter);
app.use('/api/push', authMiddleware, pushRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/device', authMiddleware, deviceRouter);

app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    time: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024), heapTotal: Math.round(mem.heapTotal / 1024 / 1024) },
    worker: { alive: workerProcess !== null && !!workerProcess.connected, restarts: workerRestartCount },
  });
});

app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

function startWorker() {
  if (workerRestartCount >= MAX_WORKER_RESTARTS) {
    console.error('[server] Trop de redémarrages worker, attente prochain restart Passenger');
    return;
  }
  if (workerRestartTimer) clearTimeout(workerRestartTimer);
  try {
    workerProcess = fork(path.join(__dirname, 'worker.js'), [], { stdio: 'inherit' });
    workerProcess.on('message', (msg) => {
      if (msg && msg.type === 'heartbeat' && workerRestartCount > 0) {
        workerRestartCount--;
      }
    });
    workerProcess.on('exit', (code) => {
      workerProcess = null;
      const delay = Math.min(60000, 2000 * Math.pow(2, workerRestartCount));
      workerRestartCount++;
      console.error(`[server] Worker terminé (code ${code}), redémarrage #${workerRestartCount} dans ${delay}ms`);
      workerRestartTimer = setTimeout(startWorker, delay);
    });
    console.log('[server] Worker démarré, PID', workerProcess.pid);
  } catch (err) {
    console.error('[server] Erreur fork worker:', err.message);
    workerRestartTimer = setTimeout(startWorker, 30000);
  }
}

const PORT = process.env.PORT || 4000;
server = app.listen(PORT, () => {
  console.log(`✅ Nka Bulletin backend démarré sur http://localhost:${PORT}`);
  initScheduler();
  startWorker();

  setInterval(() => {
    const mem = process.memoryUsage();
    updateHeartbeat({
      memory: Math.round(mem.heapUsed / 1024 / 1024),
      workerAlive: workerProcess !== null && !!workerProcess.connected,
      workerRestarts: workerRestartCount,
    });
    if (mem.heapUsed > 400 * 1024 * 1024) {
      console.warn('[server] Mémoire haute:', Math.round(mem.heapUsed / 1024 / 1024), 'MB');
    }
  }, 60000);
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
