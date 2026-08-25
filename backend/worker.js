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
  // Claim atomique multi-process : on sélectionne l'id puis on passe en 'running'
  // avec un UPDATE conditionnel par status. Si un autre worker a pris la requête
  // entre les deux (changes === 0), on passe à la suivante. Pas besoin de transaction.
  const row = db.prepare("SELECT id FROM sync_requests WHERE status = 'pending' ORDER BY id LIMIT 1").get();
  if (!row) {
    // Log périodique pour confirmer que le worker tourne
    const pending = db.prepare("SELECT COUNT(*) as n FROM sync_requests WHERE status = 'pending'").get().n;
    const running = db.prepare("SELECT COUNT(*) as n FROM sync_requests WHERE status = 'running'").get().n;
    if (pending > 0 || running > 0) {
      console.log(`[worker] État: ${pending} pending, ${running} running`);
    }
    return;
  }

  const claimed = db.prepare(
    "UPDATE sync_requests SET status = 'running' WHERE id = ? AND status = 'pending'"
  ).run(row.id);
  if (claimed.changes === 0) return; // déjà prise par un autre worker

  const req = db.prepare("SELECT * FROM sync_requests WHERE id = ?").get(row.id);

  console.log(`[worker] Début sync ${req.id} pour ${req.device_id}`);

  const now = new Date().toISOString();

  try {
    const result = await runSyncForDevice(req.device_id, { fullScan: !!req.full_scan, requestId: req.id, scanYear: req.scan_year || null });
    if (result.ok) {
      // Guard `AND status = 'running'` : un request annulé entre-temps n'est pas écrasé.
      const info = db.prepare(
        "UPDATE sync_requests SET status = 'done', new_bulletins = ?, completed_at = ? WHERE id = ? AND status = 'running'"
      ).run(result.totalNew, now, req.id);
      if (info.changes === 0) {
        console.warn(`[worker] Sync ${req.id} ignorée : la requête n'est plus 'running' (annulée entre-temps ?)`);
      } else {
        console.log(`[worker] ✓ Sync ${req.id} pour ${req.device_id}: ${result.totalNew} nouveaux`);
      }
    } else {
      const message = (result.errors && result.errors[0]) || 'Échec de la synchronisation';
      const info = db.prepare(
        "UPDATE sync_requests SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ? AND status = 'running'"
      ).run(message, now, req.id);
      if (info.changes === 0) {
        console.warn(`[worker] Sync ${req.id} ignorée : la requête n'est plus 'running' (annulée entre-temps ?)`);
      } else {
        console.error(`[worker] ✗ Sync ${req.id} pour ${req.device_id}: ${message}`);
      }
    }
  } catch (e) {
    const info = db.prepare(
      "UPDATE sync_requests SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ? AND status = 'running'"
    ).run(e.message, now, req.id);
    if (info.changes === 0) {
      console.warn(`[worker] Sync ${req.id} ignorée : la requête n'est plus 'running' (annulée entre-temps ?)`);
    } else {
      console.error(`[worker] ✗ Sync ${req.id} pour ${req.device_id}:`, e.message);
    }
  }
}

async function main() {
  const resetCount = db.prepare(
    "UPDATE sync_requests SET status = 'pending', error_message = 'relancé après redémarrage worker' WHERE status = 'running'"
  ).run();
  if (resetCount.changes > 0) {
    console.log(`[worker] ${resetCount.changes} sync(s) relancée(s) après redémarrage`);
  }

  // Nettoyage des jobs stuck en 'running' depuis > 30 min (timeout blowup).
  // CRITIQUE : ce cleanup ne doit JAMAIS faire planter le worker — une erreur
  // ici est loguée et ignorée (leçon du 25/08 : colonne inexistante → crash
  // au démarrage → 10 relances → plus de worker du tout → scans sans fin).
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const stuckCount = db.prepare(
      "UPDATE sync_requests SET status = 'failed', error_message = 'timeout: stuck > 30min' WHERE status = 'running' AND requested_at < ?"
    ).run(cutoff);
    if (stuckCount.changes > 0) {
      console.log(`[worker] ${stuckCount.changes} sync(s) stuck nettoyée(s)`);
    }
  } catch (e) {
    console.error('[worker] Cleanup stuck ignoré:', e.message);
  }

  console.log(`[worker] Démarré, PID ${process.pid}, intervalle d'interrogation: ${POLL_INTERVAL}ms`);
  while (true) {
    try { await processOne(); }
    catch (e) { console.error('[worker] Erreur boucle:', e.message); }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main();
