require('dotenv').config();

process.on('unhandledRejection', (reason) => {
  console.error('[worker] UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[worker] UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

setInterval(() => {
  if (process.send) process.send({ type: 'heartbeat' });
}, 30000);

const db = require('./src/db');
const { runSyncForDevice } = require('./src/syncService');

const POLL_INTERVAL = Number(process.env.WORKER_POLL_INTERVAL) || 2000;

async function processOne() {
  const atomicClaim = db.transaction(() => {
    const row = db.prepare("SELECT id FROM sync_requests WHERE status = 'pending' ORDER BY id LIMIT 1").get();
    if (!row) return null;
    db.prepare("UPDATE sync_requests SET status = 'running' WHERE id = ?").run(row.id);
    return db.prepare("SELECT * FROM sync_requests WHERE id = ?").get(row.id);
  });
  const req = atomicClaim();
  if (!req) return;

  console.log(`[worker] Début sync ${req.id} pour ${req.device_id}`);

  try {
    const totalNew = await runSyncForDevice(req.device_id);
    db.prepare(
      "UPDATE sync_requests SET status = 'done', new_bulletins = ?, completed_at = ? WHERE id = ?"
    ).run(totalNew, new Date().toISOString(), req.id);
    console.log(`[worker] ✓ Sync ${req.id} pour ${req.device_id}: ${totalNew} nouveaux`);
  } catch (e) {
    db.prepare(
      "UPDATE sync_requests SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?"
    ).run(e.message, new Date().toISOString(), req.id);
    console.error(`[worker] ✗ Sync ${req.id} pour ${req.device_id}:`, e.message);
  }
}

async function main() {
  const resetCount = db.prepare(
    "UPDATE sync_requests SET status = 'pending', error_message = 'relancé après redémarrage worker' WHERE status = 'running'"
  ).run();
  if (resetCount.changes > 0) {
    console.log(`[worker] ${resetCount.changes} sync(s) relancée(s) après redémarrage`);
  }

  console.log(`[worker] Démarré, PID ${process.pid}, intervalle d'interrogation: ${POLL_INTERVAL}ms`);
  while (true) {
    try { await processOne(); }
    catch (e) { console.error('[worker] Erreur boucle:', e.message); }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main();
