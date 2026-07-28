const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/nka-bulletin.sqlite';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

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

CREATE INDEX IF NOT EXISTS idx_bulletins_device ON bulletins(device_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_year_month ON bulletins(year, month);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  account_id INTEGER,
  status TEXT NOT NULL,               -- 'success' | 'error'
  message TEXT,
  new_bulletins INTEGER DEFAULT 0,
  ran_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
