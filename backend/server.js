require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.log('[server] Mode production détecté');
} else if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

let server;
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
const fs = require('fs');

const { router: authRouter, authMiddleware } = require('./src/routes/auth');
const { router: adminRouter, licenceGate } = require('./src/routes/admin');
const accountsRouter = require('./src/routes/accounts');
const { router: syncRouter } = require('./src/routes/sync');
const bulletinsRouter = require('./src/routes/bulletins');
const analyseRouter = require('./src/routes/analyse');
const { router: pushRouter } = require('./src/routes/push');
const settingsRouter = require('./src/routes/settings');
const deviceRouter = require('./src/routes/device');
const googleAuthRouter = require('./src/routes/googleAuth');
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

const LOG_DIR = path.join(__dirname, 'logs');
const REQUEST_LOG_FILE = path.join(LOG_DIR, 'requests.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function extractDeviceIdFromAuth(header) {
  const token = (header || '').startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const normalized = payloadB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(payloadB64.length + (4 - payloadB64.length % 4) % 4, '=');
    const payload = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    return payload.deviceId || null;
  } catch (e) {
    return null;
  }
}

app.use((req, res, next) => {
  res.on('finish', () => {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        device_id: req.deviceId || extractDeviceIdFromAuth(req.headers.authorization) || null,
        status: res.statusCode,
      };
      if (req.method === 'DELETE' && req.baseUrl === '/api/accounts' && req.params && req.params.id) {
        entry.account_id = req.params.id;
      }
      if (req.method === 'POST' && req.baseUrl === '/api/accounts' && req.path === '/') {
        entry.provider = req.body && req.body.provider ? req.body.provider : null;
        entry.email = req.body && req.body.email ? req.body.email : null;
      }
      fs.appendFileSync(REQUEST_LOG_FILE, JSON.stringify(entry) + '\n');
    } catch (e) {
      // Ignore logging errors to avoid affecting request handling.
    }
  });
  next();
});

// Les rponses API contiennent des donnes prives et ne doivent jamais tre
// rutilises par le navigateur, un proxy ou une ancienne installation PWA.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

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
// OAuth2 Google : callback sans authMiddleware (Google redirige avec ?code=...)
// Le callback utilise son propre middleware d'auth interne (device_id dans le state)
app.use('/api/auth/google', googleAuthRouter);

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
        worker: { mode: 'cron', alive: null, restarts: 0 },
  });
});

app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

const PORT = process.env.PORT || 4000;
server = app.listen(PORT, () => {
  console.log(`✅ Nka Bulletin backend démarré sur http://localhost:${PORT}`);
  console.log('[server] Les scans sont exécutés par worker-once.js via cron o2switch');

  setInterval(() => {
    const mem = process.memoryUsage();
    updateHeartbeat({
      memory: Math.round(mem.heapUsed / 1024 / 1024),
      workerAlive: null,
      workerMode: 'cron',
      workerRestarts: 0,
    });
    if (mem.heapUsed > 400 * 1024 * 1024) {
      console.warn('[server] Mémoire haute:', Math.round(mem.heapUsed / 1024 / 1024), 'MB');
    }
  }, 60000);
});

function shutdown(signal) {
  console.log(`[server] Signal ${signal} reçu, arrêt en cours...`);
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
