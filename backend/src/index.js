import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import { initDb } from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Ensure data directories exist
['data/bulletins', 'data/merges', 'data/shares'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// DB init
const db = initDb(process.env.DB_PATH || './data/nka.db');

// Routes
import authRoutes from './routes/auth.js';
import mailRoutes from './routes/mail.js';
import bulletinsRoutes from './routes/bulletins.js';
import settingsRoutes from './routes/settings.js';
import statsRoutes from './routes/stats.js';

app.use('/api/auth', authRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/bulletins', bulletinsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Nka Bulletin API running on port ${PORT}`);
});

export default app;
