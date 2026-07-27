import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const frontendPath = path.resolve(__dirname, '../../app');

['data/bulletins', 'data/merges', 'data/shares'].forEach(dir => {
  const p = path.resolve(__dirname, '..', dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const db = initDb(process.env.DB_PATH || './data/nka.db');

// API Routes
import authRoutes from './routes/auth.js';
import passwordRoutes from './routes/auth-password.js';
import mailRoutes from './routes/mail.js';
import bulletinsRoutes from './routes/bulletins.js';
import settingsRoutes from './routes/settings.js';
import statsRoutes from './routes/stats.js';

app.use('/api/auth', authRoutes);
app.use('/api/auth/password', passwordRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/bulletins', bulletinsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stats', statsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend as static files
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nka Bulletin running on http://localhost:${PORT}`);
});

export default app;
