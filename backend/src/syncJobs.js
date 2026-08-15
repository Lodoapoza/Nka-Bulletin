/**
 * Synchronizer Jobs Manager
 * Single-flight + resumable synchronization for Phase 2 of the backend.
 *
 * Interfaces:
 * - requestSync(deviceId, { fullScan }) → { id, status, reused, fullScan }
 * - claimNext() → row | null
 * - updateProgress(id, progress) → boolean
 * - completeJob(id, result) → boolean
 * - requeueAfterRestart() → number
 */

const db = require('./db');

/**
 * Request a synchronization job for a device.
 * Handles single-flight semantics: only one concurrent job per device.
 * If a pending/running job exists, converts or reuses it.
 * Otherwise creates a new pending job.
 *
 * @param {string} deviceId - Unique device identifier
 * @param {Object} opts - Optional { fullScan } - whether to treat as full scan
 * @returns {{ id: number, status: 'pending'|'running'|'done', reused: boolean, fullScan: boolean }}
 */
function requestSync(deviceId, { fullScan = false } = {}) {
  return db.transaction(() => {
    // Find an active job (pending or running) for this device
    const active = db.prepare(
      "SELECT * FROM sync_requests WHERE device_id = ? AND status IN ('pending', 'running') ORDER BY id DESC LIMIT 1"
    ).get(deviceId);

    if (active) {
      if (active.status === 'running' && active.full_scan === 1) {
        // Full scan already in progress → reuse the same job
        return {
          id: active.id,
          status: active.status,
          reused: true,
          fullScan: true,
        };
      }
      if (active.status === 'pending') {
        if (fullScan) {
          // Convert pending incremental → full scan
          db.prepare("UPDATE sync_requests SET full_scan = 1 WHERE id = ?").run(active.id);
          return {
            id: active.id,
            status: active.status,
            reused: true,
            fullScan: true,
          };
        }
        // Pending incremental → reuse (convert to full scan internally)
        return {
          id: active.id,
          status: active.status,
          reused: true,
          fullScan: false,
        };
      }
      if (active.status === 'running' && active.full_scan === 0) {
        // Running incremental → reuse the job (single-flight). Only mark a
        // full scan for after the current run if one was actually requested.
        if (fullScan) {
          db.prepare("UPDATE sync_requests SET full_scan_after_current = 1 WHERE id = ?").run(active.id);
        }
        return {
          id: active.id,
          status: active.status,
          reused: true,
          fullScan: false,
        };
      }
    }

    // No active job → create a new pending one
    const info = db.prepare(
      "INSERT INTO sync_requests (device_id, status, full_scan) VALUES (?, 'pending', ?)"
    ).run(deviceId, fullScan ? 1 : 0);
    return {
      id: info.lastInsertRowid,
      status: 'pending',
      reused: false,
      fullScan: fullScan,
    };
  })();
}

/**
 * Claim the next available job.
 * Atomically selects the highest-priority pending job and transitions it to running.
 *
 * @returns {Object|null} The claimed job row or null if none available
 */
function claimNext() {
  const row = db.prepare(
    "SELECT id FROM sync_requests WHERE status = 'pending' ORDER BY id DESC LIMIT 1"
  ).get();

  if (!row) return null;

  const info = db.prepare(
    "UPDATE sync_requests SET status = 'running' WHERE id = ? AND status = 'pending'"
  ).run(row.id);

  if (info.changes === 0) return null;

  return db.prepare("SELECT * FROM sync_requests WHERE id = ?").get(row.id);
}

/**
 * Update the progress of a running job.
 * Stores cursor, phase, and new_bulletins for resumption (the caller
 * serializes the cursor — this module only persists the values).
 *
 * @param {number} id - Job ID
 * @param {Object} progress - { cursor, phase, totalNew }
 * @returns {boolean} True if the update succeeded
 */
function updateProgress(id, progress = {}) {
  const cursor = progress.cursor || null;
  const phase = progress.phase || null;
  const totalNew = progress.totalNew !== undefined ? progress.totalNew : 0;

  const updated = db.prepare(
    "UPDATE sync_requests SET cursor = ?, phase = ?, new_bulletins = ? WHERE id = ? AND status = 'running'"
  ).run(cursor, phase, totalNew, id);

  return updated.changes > 0;
}

/**
 * Mark a running job as completed.
 * Sets status to 'done', records new_bulletins, and sets completion timestamp.
 *
 * @param {number} id - Job ID
 * @param {Object} result - { newBulletins: number }
 * @returns {boolean} True if the update succeeded
 */
function completeJob(id, result = {}) {
  const newBulletins = result.newBulletins || 0;
  const completedAt = new Date().toISOString();

  const updated = db.prepare(
    "UPDATE sync_requests SET status = 'done', new_bulletins = ?, completed_at = ? WHERE id = ? AND status = 'running'"
  ).run(newBulletins, completedAt, id);

  return updated.changes > 0;
}

/**
 * Re-queue a running job after a restart.
 * Preserves cursor, phase, new_bulletins, and full_scan_after_current.
 *
 * @returns {number} Number of rows affected (should be 1)
 */
function requeueAfterRestart() {
  const affected = db.prepare(
    "UPDATE sync_requests SET status = 'pending' WHERE status = 'running'"
  ).run();

  return affected.changes;
}

module.exports = {
  requestSync,
  claimNext,
  updateProgress,
  completeJob,
  requeueAfterRestart,
};