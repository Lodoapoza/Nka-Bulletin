'use strict';

/**
 * Tests for syncJobs.js
 * Run with: npx -y node@22 --test test/syncJobs.test.js
 */

// IMPORTANT: set DB_PATH BEFORE requiring db.js so tests use a temp DB,
// never the production database. better-sqlite3 is compiled for Node 22.
const path = require('path');
const os = require('os');
process.env.DB_PATH = path.join(os.tmpdir(), 'nka-syncjobs-test-' + Date.now() + '.sqlite');

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const {
  requestSync,
  claimNext,
  updateProgress,
  completeJob,
  requeueAfterRestart,
} = require('../src/syncJobs');

/**
 * Clean up sync_requests table before each test to ensure isolation.
 */
test.beforeEach(() => {
  db.prepare('DELETE FROM sync_requests').run();
});

/**
 * Helper to count rows in sync_requests.
 */
function countSyncRequests() {
  return db.prepare('SELECT COUNT(*) as n FROM sync_requests').get().n;
}

/**
 * Helper to get a sync_request by id.
 */
function getSyncRequest(id) {
  return db.prepare('SELECT * FROM sync_requests WHERE id = ?').get(id);
}

test('2 requestSync pending pour un device → 1 ligne, reused: true la 2e fois', () => {
  const r1 = requestSync('dev1', { fullScan: false });
  assert.equal(r1.reused, false);
  assert.equal(r1.status, 'pending');
  const r2 = requestSync('dev1', { fullScan: false });
  assert.equal(r2.reused, true);
  assert.equal(r2.id, r1.id);
  assert.equal(countSyncRequests(), 1);
});

test('fullScan sur pending incrémental → même ligne, full_scan=1', () => {
  const r1 = requestSync('dev1', { fullScan: false });
  assert.equal(r1.reused, false);
  const r2 = requestSync('dev1', { fullScan: true });
  assert.equal(r2.reused, true);
  assert.equal(r2.fullScan, true);
  assert.equal(countSyncRequests(), 1);
  const row = getSyncRequest(r1.id);
  assert.equal(row.full_scan, 1);
});

test('fullScan sur running incrémental → full_scan_after_current=1, aucune nouvelle ligne', () => {
  const r1 = requestSync('dev1', { fullScan: false });
  assert.equal(r1.reused, false);
  claimNext(); // Claim the job to make it running
  const r2 = requestSync('dev1', { fullScan: true });
  assert.equal(r2.reused, true);
  assert.equal(r2.fullScan, false); // fullScan flag is false, but full_scan_after_current is set
  assert.equal(countSyncRequests(), 1);
  const row = getSyncRequest(r1.id);
  assert.equal(row.full_scan_after_current, 1);
});

test('2 claimNext concurrents (séquentiel dans le test) → 1 seul gagnant, le 2e retourne null', () => {
  const r1 = requestSync('dev1', { fullScan: false });
  const claim1 = claimNext();
  assert.ok(claim1);
  const claim2 = claimNext();
  assert.strictEqual(claim2, null);
});

test('completeJob deux fois → la 2e retourne false (garde status=\'running\')', () => {
  const r1 = requestSync('dev1', { fullScan: false });
  const claimed = claimNext(); // Make it running
  assert.ok(claimed);
  const firstComplete = completeJob(claimed.id, { newBulletins: 5 });
  assert.strictEqual(firstComplete, true);
  const secondComplete = completeJob(claimed.id, { newBulletins: 10 });
  assert.strictEqual(secondComplete, false);
});

test('requeueAfterRestart préserve cursor/phase/new_bulletins/full_scan_after_current', () => {
  const r = requestSync('dev1', { fullScan: false });
  claimNext(); // Convert to running
  updateProgress(r.id, { phase: 'history', cursor: '2022-01-01', totalNew: 5 });
  // Simulate a full scan requested during the incremental run
  requestSync('dev1', { fullScan: true });
  
  const n = requeueAfterRestart();
  assert.strictEqual(n, 1);
  const row = getSyncRequest(r.id);
  assert.strictEqual(row.status, 'pending');
  assert.strictEqual(row.phase, 'history');
  assert.strictEqual(row.cursor, '2022-01-01');
  assert.strictEqual(row.new_bulletins, 5);
  assert.strictEqual(row.full_scan_after_current, 1);
});