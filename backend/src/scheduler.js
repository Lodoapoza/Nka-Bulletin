const cron = require('node-cron');
const db = require('./db');

const activeTasks = new Map();

function buildCronExpression(device) {
  const hour = Number.isInteger(device.sync_hour) ? device.sync_hour : 8;
  switch (device.sync_frequency) {
    case 'hourly':      return '0 * * * *';
    case 'twice_daily':  return `0 ${hour},20 * * *`;
    case 'daily':
    default:              return `0 ${hour} * * *`;
  }
}

function scheduleDevice(device) {
  const expr = buildCronExpression(device);
  const task = cron.schedule(expr, () => {
    console.log(`[scheduler] Demande de synchro pour l'appareil ${device.id}`);
    db.prepare("INSERT INTO sync_requests (device_id) VALUES (?)").run(device.id);
  });
  activeTasks.set(device.id, task);
}

function rescheduleDevice(deviceId) {
  const existing = activeTasks.get(deviceId);
  if (existing) existing.stop();
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  if (device) scheduleDevice(device);
}

function initScheduler() {
  const devices = db.prepare(`
    SELECT DISTINCT d.* FROM devices d
    INNER JOIN accounts a ON a.device_id = d.id
  `).all();
  devices.forEach(device => scheduleDevice(device));
  console.log(`[scheduler] ${devices.length} appareil(s) avec compte(s) planifié(s) au démarrage`);
}

module.exports = { initScheduler, rescheduleDevice };
