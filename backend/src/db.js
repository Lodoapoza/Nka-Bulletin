const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/nka-bulletin.sqlite';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,               -- identifiant unique de l'appareil (UUID généré côté client)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  sync_hour INTEGER DEFAULT 8,        -- heure de synchronisation quotidienne (0-23)
  sync_frequency TEXT DEFAULT 'daily',-- 'daily' | 'hourly' | 'twice_daily'
  extract_amounts INTEGER DEFAULT 0,  -- option "analyse des montants PDF"
  push_subscription TEXT              -- JSON.stringify de la subscription Web Push
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  provider TEXT NOT NULL,             -- 'gmail' | 'outlook' | 'yahoo' | 'imap'
  label TEXT,
  email TEXT NOT NULL,
  imap_host TEXT,
  imap_port INTEGER,
  imap_secure INTEGER DEFAULT 1,
  encrypted_credentials TEXT NOT NULL, -- AES-256-GCM: mot de passe / mot de passe d'application
  last_sync_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS bulletins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,             -- 1-12 : mois concerné par le bulletin
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  message_hash TEXT UNIQUE NOT NULL,  -- hash (message-id + nom pièce jointe) pour anti-doublon
  received_at TEXT NOT NULL,
  net_amount REAL,                    -- rempli seulement si "extract_amounts" est actif
  currency TEXT DEFAULT 'XOF',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  account_id INTEGER,
  status TEXT NOT NULL,               -- 'success' | 'error'
  message TEXT,
  new_bulletins INTEGER DEFAULT 0,
  ran_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',       -- pending | running | done | failed | cancelled
  new_bulletins INTEGER DEFAULT 0,
  error_message TEXT,
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bulletins_device ON bulletins(device_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_year_month ON bulletins(year, month);
CREATE INDEX IF NOT EXISTS idx_sync_requests_status ON sync_requests(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_device ON sync_logs(device_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Version des migrations
const MIGRATION_VERSION = 3;
const currentVersion = db.prepare("SELECT value FROM settings WHERE key = 'db_version'").get();
if (!currentVersion) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_version', ?)").run(String(MIGRATION_VERSION));
  console.log('[db] Migration initiale v' + MIGRATION_VERSION);
}

// Migrations incrémentales (v3)
function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}
if (!hasColumn('bulletins', 'nom')) {
  db.exec("ALTER TABLE bulletins ADD COLUMN nom TEXT");
  console.log('[db] colonne bulletins.nom ajoutée');
}
if (!hasColumn('bulletins', 'matricule')) {
  db.exec("ALTER TABLE bulletins ADD COLUMN matricule TEXT");
  console.log('[db] colonne bulletins.matricule ajoutée');
}
if (!hasColumn('devices', 'owner_matricule')) {
  db.exec("ALTER TABLE devices ADD COLUMN owner_matricule TEXT");
  console.log('[db] colonne devices.owner_matricule ajoutée');
}

module.exports = db;
