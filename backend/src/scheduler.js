const cron = require('node-cron');
const db = require('./db');

const activeTasks = new Map(); // deviceId -> cron.ScheduledTask

function buildCronExpression(device) {
  const hour = Number.isInteger(device.sync_hour) ? device.sync_hour : 8;
  switch (device.sync_frequency) {
    case 'hourly':      return '0 * * * *';               // toutes les heures
    case 'twice_daily':  return `0 ${hour},20 * * *`;       // à l'heure choisie + 20h
    case 'daily':
    default:              return `0 ${hour} * * *`;          // une fois par jour à l'heure choisie
  }
}

function scheduleDevice(device, runSyncForDevice) {
  const expr = buildCronExpression(device);
  const task = cron.schedule(expr, async () => {
    console.log(`[scheduler] Synchro planifiée pour l'appareil ${device.id}`);
    try { await runSyncForDevice(device.id); }
    catch (e) { console.error(`[scheduler] Échec synchro ${device.id}:`, e.message); }
  });
  activeTasks.set(device.id, task);
}

function rescheduleDevice(deviceId) {
  const existing = activeTasks.get(deviceId);
  if (existing) existing.stop();
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  if (device) {
    // require tardif pour éviter une dépendance circulaire avec sync.js
    const { runSyncForDevice } = require('./routes/sync');
    scheduleDevice(device, runSyncForDevice);
  }
}

function initScheduler() {
  const { runSyncForDevice } = require('./routes/sync');
  const devices = db.prepare('SELECT * FROM devices').all();
  devices.forEach(device => scheduleDevice(device, runSyncForDevice));
  console.log(`[scheduler] ${devices.length} appareil(s) planifié(s) au démarrage`);
}

module.exports = { initScheduler, rescheduleDevice };
