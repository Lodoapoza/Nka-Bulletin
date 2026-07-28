const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db = null;
let dbPath = null;

async function initDb(dbPathArg = './data/nka.sqlite') {
  dbPath = path.resolve(dbPathArg);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs({ locateFile: file => `node_modules/sql.js/dist/${file}` });

  let savedDb = null;
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    savedDb = new SQL.Database(filebuffer);
  } else {
    savedDb = new SQL.Database();
  }

  db = savedDb;

  // Migrations / schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('gmail','outlook','yahoo','imap')),
      refresh_token TEXT,
      access_token TEXT,
      expiry_date INTEGER,
      config_json TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bulletins (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      subject TEXT,
      sender TEXT,
      received_at TEXT NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      year INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0,
      sha256_hash TEXT UNIQUE,
      is_favorite INTEGER DEFAULT 0,
      analyzed INTEGER DEFAULT 0,
      net_salary REAL,
      annual_total REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bulletins_year_month ON bulletins(year, month);
    CREATE INDEX IF NOT EXISTS idx_bulletins_account ON bulletins(account_id);
    CREATE INDEX IF NOT EXISTS idx_bulletins_favorite ON bulletins(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_bulletins_hash ON bulletins(sha256_hash);
  `);

  // Default settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('theme', 'system');
  insertSetting.run('biometric_enabled', 'false');
  insertSetting.run('pdf_analysis_enabled', 'false');
  insertSetting.run('sync_frequency', '3600000');
  insertSetting.run('sync_start_hour', '16');
  insertSetting.run('sync_end_day', '31');
  insertSetting.run('autoSync', 'true');
  insertSetting.run('pdfAutoDetect', 'true');

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb first.');
  return db;
}

function saveDb() {
  if (db && dbPath) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

// ── Bulletin CRUD ──────────────────────────────────────────
function getAllBulletins({ year, month, search, favorites, page = 1, limit = 50 } = {}) {
  const conditions = [];
  const params = [];

  if (year) {
    conditions.push('year = ?');
    params.push(Number(year));
  }
  if (month) {
    conditions.push('month = ?');
    params.push(Number(month));
  }
  if (search) {
    conditions.push('(subject LIKE ? OR sender LIKE ? OR filename LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (favorites) {
    conditions.push('is_favorite = 1');
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM bulletins ${where}`).get(...params);
  const rows = db.prepare(
    `SELECT * FROM bulletins ${where} ORDER BY year DESC, month DESC, received_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return { bulletins: rows, total: countRow.total, page, limit };
}

function getBulletinById(id) {
  return db.prepare('SELECT * FROM bulletins WHERE id = ?').get(id) || null;
}

function insertBulletin(data) {
  const id = data.id || crypto.randomUUID();

  // Anti-doublon
  if (data.sha256_hash) {
    const existing = db.prepare('SELECT id FROM bulletins WHERE sha256_hash = ?').get(data.sha256_hash);
    if (existing) return { duplicate: true, id: existing.id };
  }

  db.prepare(`
    INSERT INTO bulletins (id, account_id, filename, subject, sender, received_at, month, year, file_path, size_bytes, sha256_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.account_id,
    data.filename,
    data.subject || null,
    data.sender || null,
    data.received_at,
    data.month,
    data.year,
    data.file_path,
    data.size_bytes || 0,
    data.sha256_hash || null
  );

  saveDb();
  return { duplicate: false, id };
}

function toggleFavorite(id) {
  const row = db.prepare('SELECT is_favorite FROM bulletins WHERE id = ?').get(id);
  if (!row) return null;
  const newVal = row.is_favorite ? 0 : 1;
  db.prepare('UPDATE bulletins SET is_favorite = ? WHERE id = ?').run(newVal, id);
  saveDb();
  return { id, is_favorite: newVal };
}

function findByHash(sha256) {
  return db.prepare('SELECT id, file_path FROM bulletins WHERE sha256_hash = ?').get(sha256) || null;
}

function updateBulletinAnalysis(id, { netSalary, annualTotal }) {
  db.prepare('UPDATE bulletins SET analyzed = 1, net_salary = ?, annual_total = ? WHERE id = ?')
    .run(netSalary ?? null, annualTotal ?? null, id);
  saveDb();
}

// ── Account CRUD ───────────────────────────────────────────
function getAccounts() {
  return db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all();
}

function getAccountById(id) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) || null;
}

function insertAccount(data) {
  const id = data.id || crypto.randomUUID();
  db.prepare(`
    INSERT INTO accounts (id, email, provider, refresh_token, access_token, expiry_date, config_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.email,
    data.provider,
    data.refresh_token || null,
    data.access_token || null,
    data.expiry_date || null,
    data.config_json || null
  );
  saveDb();
  return getAccountById(id);
}

function updateAccountTokens(id, { access_token, refresh_token, expiry_date }) {
  db.prepare('UPDATE accounts SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expiry_date = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(access_token || null, refresh_token || null, expiry_date || null, id);
  saveDb();
}

function deleteAccount(id) {
  const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  saveDb();
  return result.changes > 0;
}

// ── Settings CRUD ──────────────────────────────────────────
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function updateSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  saveDb();
  return { key, value: String(value) };
}

// ── Stats ──────────────────────────────────────────────────
function getStats() {
  const now = new Date();
  const currentYear = now.getFullYear();

  const totalCount = db.prepare('SELECT COUNT(*) as count FROM bulletins WHERE year = ?').get(currentYear);
  const lastBulletin = db.prepare('SELECT month, year, net_salary, received_at, size_bytes FROM bulletins ORDER BY received_at DESC LIMIT 1').get();
  const annualTotal = db.prepare('SELECT SUM(net_salary) as total FROM bulletins WHERE year = ? AND net_salary IS NOT NULL').get(currentYear);
  const favoriteCount = db.prepare('SELECT COUNT(*) as count FROM bulletins WHERE is_favorite = 1').get();
  const totalSize = db.prepare('SELECT SUM(size_bytes) as total FROM bulletins').get();
  const allTimeCount = db.prepare('SELECT COUNT(*) as count FROM bulletins').get();

  return {
    currentYear,
    totalBulletins: totalCount.count,
    totalBulletinsAllTime: allTimeCount.count,
    favoriteBulletins: favoriteCount.count,
    lastBulletinDate: lastBulletin ? lastBulletin.received_at : null,
    lastBulletinMonth: lastBulletin ? lastBulletin.month : null,
    lastBulletinYear: lastBulletin ? lastBulletin.year : null,
    lastNetSalary: lastBulletin ? lastBulletin.net_salary : null,
    annualSalaryTotal: annualTotal ? (annualTotal.total || 0) : 0,
    totalSize: totalSize ? (totalSize.total || 0) : 0
  };
}

function getYearlyStats(year) {
  const rows = db.prepare(`
    SELECT
      month,
      COUNT(*) as count,
      SUM(net_salary) as total_salary,
      SUM(size_bytes) as total_size
    FROM bulletins
    WHERE year = ?
    GROUP BY month
    ORDER BY month ASC
  `).all(Number(year));

  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const found = rows.find(r => r.month === m);
    monthly.push({
      month: m,
      count: found ? found.count : 0,
      total_salary: found ? found.total_salary : 0,
      total_size: found ? found.total_size : 0
    });
  }

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_bulletins,
      SUM(net_salary) as annual_salary_total,
      SUM(size_bytes) as total_size
    FROM bulletins WHERE year = ?
  `).get(Number(year));

  return {
    year: Number(year),
    monthly,
    totals: {
      total_bulletins: totals.total_bulletins || 0,
      annual_salary_total: totals.annual_salary_total || 0,
      total_size: totals.total_size || 0
    }
  };
}

module.exports = {
  initDb,
  getDb,
  saveDb,
  getAllBulletins,
  getBulletinById,
  insertBulletin,
  toggleFavorite,
  findByHash,
  updateBulletinAnalysis,
  getAccounts,
  getAccountById,
  insertAccount,
  updateAccountTokens,
  deleteAccount,
  getSettings,
  getSetting,
  updateSetting,
  getStats,
  getYearlyStats
};