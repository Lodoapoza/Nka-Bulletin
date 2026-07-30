require('dotenv').config();
const db = require('./src/db');
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const result = db.prepare('DELETE FROM sync_logs WHERE ran_at < ?').run(cutoff);
console.log(`Nettoyage terminé : ${result.changes} logs supprimés`);
process.exit(0);
