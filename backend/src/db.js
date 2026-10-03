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
  account_id INTEGER,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,             -- 1-12 : mois concerné par le bulletin
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  message_hash TEXT NOT NULL,          -- hash (message-id + nom pièce jointe) ; unique PAR APPAREIL (v4)
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

// Migration v4 : message_hash unique PAR APPAREIL (device_id, message_hash) au lieu
// de global. Sans cela, deux appareils scannant le même compte Gmail entrent en
// collision sur la contrainte UNIQUE et le second échoue (0 bulletin visible).
// Détection : la table bulletins possède un index auto (sqlite_autoindex_*) créé
// par l'ancien "message_hash TEXT UNIQUE".
const hasAutoIndex = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='bulletins' AND name LIKE 'sqlite_autoindex%'"
).get();
if (hasAutoIndex) {
  console.log('[db] Migration v4 : déduplication des bulletins par appareil…');
  db.exec(`
    BEGIN;
    CREATE TABLE bulletins_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      account_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      message_hash TEXT NOT NULL,
      received_at TEXT NOT NULL,
      net_amount REAL,
      currency TEXT DEFAULT 'XOF',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      nom TEXT,
      matricule TEXT,
      FOREIGN KEY(account_id) REFERENCES accounts(id)
    );
    INSERT INTO bulletins_v4 (id, device_id, account_id, year, month, filename, filepath, message_hash, received_at, net_amount, currency, created_at, nom, matricule)
      SELECT id, device_id, account_id, year, month, filename, filepath, message_hash, received_at, net_amount, currency, created_at, nom, matricule FROM bulletins;
    DROP TABLE bulletins;
    ALTER TABLE bulletins_v4 RENAME TO bulletins;
    COMMIT;
  `);
  console.log('[db] Migration v4 terminée');
}

// Index de déduplication par appareil (créé après la migration v4 qui recrée la table)
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bulletins_device_hash ON bulletins(device_id, message_hash);`);

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
if (!hasColumn('sync_requests', 'full_scan')) {
  db.exec("ALTER TABLE sync_requests ADD COLUMN full_scan INTEGER DEFAULT 0");
  console.log('[db] colonne sync_requests.full_scan ajoutée');
}

// ----- Licences (v5) -----
// L'accès au service est accordé par matricule. Une licence active (status='active',
// expires_at NULL = illimité ou > maintenant) autorise le device qui déclare ce matricule.
db.exec(`
CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricule TEXT NOT NULL UNIQUE,
  granted_by TEXT NOT NULL DEFAULT 'admin',   -- 'admin' | 'paydunya'
  months INTEGER,                             -- durée en mois (NULL = illimité)
  expires_at TEXT,                            -- ISO 8601, NULL = sans limite
  status TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'revoked'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_licenses_matricule ON licenses(matricule);
`);

// Seed : la licence du propriétaire/admin F2558 (démarrage propre du système, évite de
// se retrouver soi-même bloqué au premier déploiement).
if (!db.prepare('SELECT id FROM licenses WHERE matricule = ?').get('F2558')) {
  const seed = new Date(); seed.setMonth(seed.getMonth() + 12);
  db.prepare(
    "INSERT INTO licenses (matricule, granted_by, months, expires_at, status) VALUES (?, 'admin', 12, ?, 'active')"
  ).run('F2558', seed.toISOString());
  console.log('[db] Licence de départ F2558 créée (12 mois)');
}

// ----- Multi-appareils (v6) -----
// Comptes utilisateurs (users) et abonnements push (push_subscriptions). Chaque
// device est rattaché à un matricule utilisateur (devices.user_matricule), et la
// déduplication des bulletins passe de (device_id, message_hash) à
// (user_matricule, message_hash) : un même bulletin scanné par deux appareils du
// même utilisateur ne doit exister qu'une seule fois.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  matricule TEXT PRIMARY KEY,
  link_code_salt TEXT NOT NULL DEFAULT '',
  link_code_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_matricule TEXT NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  subscription TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_matricule);
`);

if (!hasColumn('devices', 'user_matricule')) {
  db.exec("ALTER TABLE devices ADD COLUMN user_matricule TEXT");
  console.log('[db] colonne devices.user_matricule ajoutée');
}

// Rebuild de bulletins : ajoute user_matricule et rend account_id nullable
// (un bulletin peut être rattaché à un utilisateur sans compte associé).
if (!hasColumn('bulletins', 'user_matricule')) {
  console.log('[db] Migration v6 : rebuild de bulletins (user_matricule)…');
  db.exec(`
    BEGIN;
    CREATE TABLE bulletins_v6 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      account_id INTEGER,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      message_hash TEXT NOT NULL,
      received_at TEXT NOT NULL,
      net_amount REAL,
      currency TEXT DEFAULT 'XOF',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      nom TEXT,
      matricule TEXT,
      user_matricule TEXT,
      FOREIGN KEY(account_id) REFERENCES accounts(id)
    );
    INSERT INTO bulletins_v6 (id, device_id, account_id, year, month, filename, filepath, message_hash, received_at, net_amount, currency, created_at, nom, matricule, user_matricule)
      SELECT id, device_id, account_id, year, month, filename, filepath, message_hash, received_at, net_amount, currency, created_at, nom, matricule, NULL FROM bulletins;
    DROP TABLE bulletins;
    ALTER TABLE bulletins_v6 RENAME TO bulletins;
    COMMIT;
  `);
  console.log('[db] Migration v6 : rebuild de bulletins terminé');
}

// Backfill (transaction) — ordre strict : users → devices → bulletins → dédup → push.
// Idempotent : INSERT OR IGNORE, UPDATE à valeur identique, dédup sans effet après
// le premier passage (l'index unique est créé APRÈS la dédup, sinon UNIQUE constraint
// failed).
// Une ancienne exécution peut avoir laissé les index v11 avant de s'interrompre.
// Ils doivent être retirés avant le rattachement des bulletins aux utilisateurs.
db.exec('DROP INDEX IF EXISTS idx_bulletins_user_hash; DROP INDEX IF EXISTS idx_bulletins_owner_hash; DROP INDEX IF EXISTS idx_bulletins_owner_period;');
const deletedFilepaths = [];
const backfill = db.transaction(() => {
  // a. Grandfathering : un user par device possédant un owner_matricule.
  //    owner_matricule peut être "F2558;F1234" → on prend le PREMIER matricule.
  const devices = db.prepare(
    "SELECT id, owner_matricule FROM devices WHERE owner_matricule IS NOT NULL AND trim(owner_matricule) != ''"
  ).all();
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (matricule) VALUES (?)');
  const updateDevice = db.prepare('UPDATE devices SET user_matricule = ? WHERE id = ?');
  for (const d of devices) {
    const m = d.owner_matricule.split(';')[0].trim();
    if (!m) continue;
    insertUser.run(m);
    updateDevice.run(m, d.id);
  }

  // b. bulletins.user_matricule ← device.user_matricule (via device_id)
  db.prepare(`
    UPDATE bulletins SET user_matricule = (
      SELECT user_matricule FROM devices WHERE devices.id = bulletins.device_id
    ) WHERE user_matricule IS NULL
  `).run();

  // c. Dédup : (user_matricule, message_hash) en gardant MIN(id). Les filepath des
  //    lignes supprimées sont collectés AVANT la suppression (unlink best-effort après).
  const dups = db.prepare(`
    SELECT b.id, b.filepath FROM bulletins b
    WHERE b.user_matricule IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM bulletins b2
        WHERE b2.user_matricule = b.user_matricule
          AND b2.message_hash = b.message_hash
          AND b2.id < b.id
      )
  `).all();
  const deleteBulletin = db.prepare('DELETE FROM bulletins WHERE id = ?');
  for (const r of dups) {
    if (r.filepath) deletedFilepaths.push(r.filepath);
    deleteBulletin.run(r.id);
  }

  // d. push_subscriptions : un abonnement par device lié à un user
  db.prepare(`
    INSERT OR IGNORE INTO push_subscriptions (user_matricule, device_id, subscription)
    SELECT user_matricule, id, push_subscription FROM devices
    WHERE push_subscription IS NOT NULL AND user_matricule IS NOT NULL
  `).run();
});
backfill();

// Suppression best-effort des fichiers des bulletins dédupliqués
for (const fp of deletedFilepaths) {
  try { fs.unlinkSync(fp); } catch (e) { /* best-effort : fichier déjà absent ou verrouillé */ }
}

// Index : la déduplication passe de (device_id, message_hash) à (user_matricule, message_hash).
// L'index non-unique idx_bulletins_device est recréé (le rebuild de la table l'a supprimé).
db.exec(`
DROP INDEX IF EXISTS idx_bulletins_device_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bulletins_user_hash ON bulletins(user_matricule, message_hash);
CREATE INDEX IF NOT EXISTS idx_bulletins_device ON bulletins(device_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_year_month ON bulletins(year, month);
`);

// ----- Gratifications (v7) -----
// En décembre, deux PDF arrivent : le bulletin de paie ET un bulletin de
// GRATIFICATION, avec le même nom de fichier. Le type et la vraie période sont
// déterminés depuis le CONTENU du PDF ("Taux H.Suppl.: Gratification 2024" vs
// "Taux H.Suppl.: Decembre 2024"). type='gratification' → month=0,
// period_label = libellé extrait du PDF.
if (!hasColumn('bulletins', 'type')) {
  db.exec("ALTER TABLE bulletins ADD COLUMN type TEXT DEFAULT 'paie'");
  console.log('[db] colonne bulletins.type ajoutée');
}
if (!hasColumn('bulletins', 'period_label')) {
  db.exec("ALTER TABLE bulletins ADD COLUMN period_label TEXT");
  console.log('[db] colonne bulletins.period_label ajoutée');
}

// Backfill idempotent : re-analyse les bulletins existants sans period_label
// (limité à 200 lignes pour ne pas bloquer le démarrage). Best-effort : chaque
// ligne est en try/catch, un échec n'arrête pas le reste.
(async () => {
  const { analyzePdf } = require('./pdfService');
  const { parsePeriodFromText } = require('./period');
  const toBackfill = db.prepare(
    'SELECT id, filepath FROM bulletins WHERE period_label IS NULL LIMIT 200'
  ).all();
  let backfilled = 0;
  for (const row of toBackfill) {
    try {
      if (!row.filepath || !fs.existsSync(row.filepath)) continue;
      const analysis = await analyzePdf(row.filepath);
      const contentPeriod = analysis && analysis.text ? parsePeriodFromText(analysis.text) : null;
      if (!contentPeriod) continue;
      const type = contentPeriod.type === 'gratification' ? 'gratification' : 'paie';
      // year/month ne doivent jamais être NULL (colonnes NOT NULL) : on garde les
      // valeurs existantes quand le contenu n'en fournit pas.
      const existing = db.prepare('SELECT year, month FROM bulletins WHERE id = ?').get(row.id);
      const year = contentPeriod.year || existing.year;
      const month = type === 'gratification' ? 0 : (contentPeriod.month || existing.month);
      db.prepare('UPDATE bulletins SET type = ?, period_label = ?, year = ?, month = ? WHERE id = ?')
        .run(type, contentPeriod.label || null, year, month, row.id);
      backfilled++;
    } catch (err) {
      console.warn('[db] Backfill v7 : échec bulletin #' + row.id + ' — ' + err.message);
    }
  }
  console.log(`[db] Backfill v7 : ${backfilled}/${toBackfill.length} bulletin(s) reclassé(s) depuis le contenu PDF`);
})();

// ----- Login par email (v8) -----
// L'accès au compte se fait désormais par email (au lieu de matricule + code de
// liaison). La colonne users.email est ajoutée ; les colonnes link_code_* restent
// en base mais ne sont plus utilisées.
if (!hasColumn('users', 'email')) {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT");
  console.log('[db] colonne users.email ajoutée');
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != '';`);

db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_version', ?)").run('8');
console.log('[db] Migration v8 terminée (db_version=8)');

// ----- Sync jobs resumables (v9) -----
// Colonnes pour la reprise des jobs de synchro par tranches (Phase 2) :
//  - phase            : 'incremental' | 'recent' | 'history' (état du planner)
//  - cursor           : curseur de reprise sérialisé (JSON { phase, from })
//  - full_scan_after_current : un full scan demandé pendant un run incrémental
//                              sera lancé après le job courant (pas de nouvelle ligne)
//  - recent_window_months     : taille de la fenêtre récente (défaut 24 mois)
// Idempotent : hasColumn + CREATE INDEX IF NOT EXISTS.
if (!hasColumn('sync_requests', 'phase')) {
  db.exec("ALTER TABLE sync_requests ADD COLUMN phase TEXT DEFAULT 'incremental'");
  console.log('[db] colonne sync_requests.phase ajoutée');
}
if (!hasColumn('sync_requests', 'cursor')) {
  db.exec("ALTER TABLE sync_requests ADD COLUMN cursor TEXT");
  console.log('[db] colonne sync_requests.cursor ajoutée');
}
if (!hasColumn('sync_requests', 'full_scan_after_current')) {
  db.exec("ALTER TABLE sync_requests ADD COLUMN full_scan_after_current INTEGER DEFAULT 0");
  console.log('[db] colonne sync_requests.full_scan_after_current ajoutée');
}
if (!hasColumn('sync_requests', 'recent_window_months')) {
  db.exec("ALTER TABLE sync_requests ADD COLUMN recent_window_months INTEGER DEFAULT 24");
  console.log('[db] colonne sync_requests.recent_window_months ajoutée');
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_requests_device_status ON sync_requests(device_id, status);`);

db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_version', ?)").run('9');
console.log('[db] Migration v9 terminée (db_version=9)');

// ----- Recherche ciblée par année (v10) -----
// scan_year : année précise demandée pour une synchro (modale « Rechercher une
// année »). NULL = comportement historique (incrémental ou full_scan).
if (!hasColumn('sync_requests', 'scan_year')) {
  db.exec("ALTER TABLE sync_requests ADD COLUMN scan_year INTEGER");
  console.log('[db] colonne sync_requests.scan_year ajoutée');
}
for (const [column, definition] of [
  ['started_at', 'TEXT'],
  ['finished_at', 'TEXT'],
  ['attachments_found', 'INTEGER DEFAULT 0'],
  ['rejected_count', 'INTEGER DEFAULT 0'],
  ['already_imported', 'INTEGER DEFAULT 0'],
]) {
  if (!hasColumn('sync_requests', column)) {
    db.exec(`ALTER TABLE sync_requests ADD COLUMN ${column} ${definition}`);
    console.log(`[db] colonne sync_requests.${column} ajoutée`);
  }
}
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_version', ?)").run('10');
console.log('[db] Migration v10 terminée (db_version=10)');

// ----- Coordination multi-appareils (v11) -----
// Un même email connecté sur plusieurs appareils doit fonctionner sans
// chevauchement : vue partagée au niveau user (existante), import coordonné.
// 1. Backfill : les bulletins d'appareils rattachés à un user héritent du
//    user_matricule (les vieux imports avant la feature restaient NULL).
// 2. Dédoublonnage visible : même (propriétaire, filename, année, mois, type)
//    → on garde l'import le plus ancien (le même PDF arrive dans la boîte de
//    chaque appareil = emails distincts, hash différent, mais un seul doit
//    rester visible).
// 3. Filets de sécurité en base :
//    - unicité hash PAR PROPRIÉTAIRE (IFNULL(user_matricule, device_id))
//    - unicité période PAR PROPRIÉTAIRE (filename, year, month, type)
try {
  // Une version précédente pouvait avoir créé les index puis échoué pendant
  // le backfill. Les supprimer d’abord rend la migration idempotente et permet
  // de rattacher les lignes avant de refaire la déduplication.
  db.exec('DROP INDEX IF EXISTS idx_bulletins_owner_hash; DROP INDEX IF EXISTS idx_bulletins_owner_period;');
  const backfill = db.prepare(`
    UPDATE bulletins SET user_matricule =
      (SELECT d.user_matricule FROM devices d WHERE d.id = bulletins.device_id)
    WHERE user_matricule IS NULL
      AND device_id IN (SELECT id FROM devices WHERE user_matricule IS NOT NULL)
  `).run();
  if (backfill.changes > 0) console.log(`[db] v11: ${backfill.changes} bulletin(s) rattachés au user`);

  // Réparation des périodes : le nom de fichier est la source de vérité quand
  // il porte un mois explicite qui contredit la ligne stockée (décalage
  // « mois de paiement » vs « période » observé sur les PDFs réels).
  // GRATIFICATION dans le nom → type gratification, mois 0.
  const { parsePeriodFromPayslip, parseYearFromText } = require('./period');
  const fixStmt = db.prepare('UPDATE bulletins SET year = ?, month = ?, type = ? WHERE id = ?');
  let repaired = 0;
  for (const r of db.prepare('SELECT id, filename, year, month, type FROM bulletins').all()) {
    if (/gratification/i.test(r.filename)) {
      const fp = parsePeriodFromPayslip(r.filename);
      const gy = fp && fp.year ? fp.year : (parseYearFromText(r.filename) || r.year);
      if (r.type !== 'gratification' || r.month !== 0 || r.year !== gy) {
        fixStmt.run(gy, 0, 'gratification', r.id);
        repaired++;
      }
      continue;
    }
    if (r.type === 'gratification') continue; // ne pas écraser une gratification légitime
    const fp = parsePeriodFromPayslip(r.filename);
    if (fp && fp.month && (r.year !== fp.year || r.month !== fp.month)) {
      fixStmt.run(fp.year, fp.month, r.type || 'paie', r.id);
      repaired++;
    }
  }
  if (repaired > 0) console.log(`[db] v11: ${repaired} période(s) réparée(s) depuis le nom de fichier`);

  // Exports fusionnés de l'app revenus par email et réimportés comme bulletins :
  // artefacts dérivés (les périodes couvertes existent déjà individuellement).
  const delMerge = db.prepare("DELETE FROM bulletins WHERE filename LIKE 'Bulletins du %' OR filename LIKE 'Bulletins_du_%'").run();
  if (delMerge.changes > 0) console.log(`[db] v11: ${delMerge.changes} export(s) fusionné(s) réimporté(s) supprimé(s)`);

  const dedupPeriod = db.prepare(`
    DELETE FROM bulletins WHERE id NOT IN (
      SELECT MIN(id) FROM bulletins
      GROUP BY IFNULL(user_matricule, device_id), filename, year, month, type
    )
  `).run();
  if (dedupPeriod.changes > 0) console.log(`[db] v11: ${dedupPeriod.changes} doublon(s) de période supprimé(s)`);

  const dedupHash = db.prepare(`
    DELETE FROM bulletins WHERE id NOT IN (
      SELECT MIN(id) FROM bulletins
      GROUP BY IFNULL(user_matricule, device_id), message_hash
    )
  `).run();
  if (dedupHash.changes > 0) console.log(`[db] v11: ${dedupHash.changes} doublon(s) de hash supprimé(s)`);

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bulletins_owner_hash ON bulletins(IFNULL(user_matricule, device_id), message_hash);`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bulletins_owner_period ON bulletins(IFNULL(user_matricule, device_id), filename, year, month, type);`);
  console.log('[db] v11: index unicite proprietaire crees');
} catch (e) {
  console.error('[db] Migration v11 partiellement échouée:', e.message);
}
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_version', ?)").run('11');
console.log('[db] Migration v11 terminée (db_version=11)');

module.exports = db;
