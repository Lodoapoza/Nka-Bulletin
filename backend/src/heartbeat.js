const fs = require('fs');
const path = require('path');

const HEARTBEAT_FILE = path.join(__dirname, '..', 'tmp', 'heartbeat.json');

function updateHeartbeat(stats = {}) {
  try {
    const dir = path.dirname(HEARTBEAT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({
      ok: true,
      time: new Date().toISOString(),
      uptime: process.uptime(),
      ...stats,
    }));
  } catch (err) {
    console.error('[heartbeat] Erreur écriture:', err.message);
  }
}

module.exports = { updateHeartbeat };
