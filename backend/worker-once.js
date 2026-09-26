'use strict';

// Worker autonome pour o2switch/Passenger.
// Il ouvre sa propre connexion SQLite, traite un seul job, puis quitte.
// Le verrouillage est assuré par cron-worker.sh afin d'éviter deux scans concurrents.
require('dotenv').config();

const db = require('./src/db');
const { runSyncForDevice } = require('./src/syncService');

const STUCK_AFTER_MS = Number(process.env.SYNC_STUCK_AFTER_MS) || 2 * 60 * 60 * 1000;

function recoverStuckJobs() {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  return db.prepare(
    "UPDATE sync_requests SET status = 'failed', error_message = 'Le scan a dépassé le délai autorisé', finished_at = ?, completed_at = ? WHERE status = 'running' AND requested_at < ?"
  ).run(new Date().toISOString(), new Date().toISOString(), cutoff).changes;
}

function claimNext() {
  const row = db.prepare("SELECT id FROM sync_requests WHERE status = 'pending' ORDER BY id ASC LIMIT 1").get();
  if (!row) return null;
  const startedAt = new Date().toISOString();
  const updated = db.prepare(
    "UPDATE sync_requests SET status = 'running', started_at = ?, error_message = NULL WHERE id = ? AND status = 'pending'"
  ).run(startedAt, row.id);
  if (!updated.changes) return null;
  return db.prepare('SELECT * FROM sync_requests WHERE id = ?').get(row.id);
}

function queueRequestedFollowup(req) {
  if (!req.full_scan_after_current) return;
  const existing = db.prepare("SELECT id FROM sync_requests WHERE device_id = ? AND status IN ('pending','running') AND full_scan = 1").get(req.device_id);
  if (!existing) {
    db.prepare("INSERT INTO sync_requests (device_id, status, full_scan) VALUES (?, 'pending', 1)").run(req.device_id);
    console.log(`[worker-once] Scan complet mis en file après le job ${req.id}`);
  }
  db.prepare('UPDATE sync_requests SET full_scan_after_current = 0 WHERE id = ?').run(req.id);
}

async function processOne() {
  const recovered = recoverStuckJobs();
  if (recovered) console.warn(`[worker-once] ${recovered} job(s) bloqué(s) marqué(s) failed`);
  const req = claimNext();
  if (!req) return false;

  const startedAt = req.started_at || new Date().toISOString();
  console.log(`[worker-once] Début job ${req.id} (${req.device_id}) à ${startedAt}`);
  try {
    const result = await runSyncForDevice(req.device_id, {
      fullScan: !!req.full_scan,
      requestId: req.id,
      scanYear: req.scan_year || null,
    });
    const finishedAt = new Date().toISOString();
    const status = result.ok ? 'done' : 'failed';
    const error = result.ok ? null : ((result.errors && result.errors[0]) || 'Échec de la synchronisation');
    db.prepare(
      `UPDATE sync_requests
       SET status = ?, new_bulletins = ?, attachments_found = ?, rejected_count = ?,
           already_imported = ?, error_message = ?, finished_at = ?, completed_at = ?
       WHERE id = ? AND status = 'running'`
    ).run(
      status,
      result.totalNew || 0,
      result.totalCandidates || 0,
      result.totalRejected || 0,
      result.totalAlreadyImported || 0,
      error,
      finishedAt,
      finishedAt,
      req.id,
    );
    queueRequestedFollowup(req);
    console.log(`[worker-once] Job ${req.id} ${status}: ${result.totalNew || 0} nouveau(x), ${result.totalCandidates || 0} candidat(s)`);
    return true;
  } catch (err) {
    const finishedAt = new Date().toISOString();
    db.prepare(
      "UPDATE sync_requests SET status = 'failed', error_message = ?, finished_at = ?, completed_at = ? WHERE id = ? AND status = 'running'"
    ).run(err.message, finishedAt, finishedAt, req.id);
    queueRequestedFollowup(req);
    console.error(`[worker-once] Job ${req.id} failed:`, err.message);
    return true;
  }
}

processOne()
  .catch((err) => {
    console.error('[worker-once] Erreur fatale:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    try { db.close(); } catch (_) {}
  });
