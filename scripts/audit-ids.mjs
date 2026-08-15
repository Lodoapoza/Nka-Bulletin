// scripts/audit-ids.mjs — vérifie que chaque ID/class référencé par le JS existe dans index.html
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const frontend = join(process.cwd(), 'frontend');
const html = readFileSync(join(frontend, 'index.html'), 'utf8');
const jsFiles = readdirSync(join(frontend, 'js')).filter(f => f.endsWith('.js'));

const ids = new Set();
const classes = new Set();
for (const f of jsFiles) {
  const src = readFileSync(join(frontend, 'js', f), 'utf8');
  for (const m of src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) ids.add(m[1]);
  for (const m of src.matchAll(/create\(\s*['"]([^'"]+)['"]\s*\)/g)) ids.add(m[1]);
  for (const m of src.matchAll(/closest\(\s*['"]\.([^'"]+)['"]\s*\)/g)) classes.add(m[1]);
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*['"]#([^'"]+)['"]\s*\)/g)) ids.add(m[1]);
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*['"]\.([^'"\s]+)['"]\s*\)/g)) classes.add(m[1]);
}

// IDs créés par JS (absents de index.html par conception) :
// bulletins-error (bulletins.js), reset-cancel-btn/reset-confirm-btn (reset.js),
// offline-card/prepare-offline-btn/offline-status/rescan-status (settings.js),
// offline-cache-banner (app.js)
const dynamicIds = new Set([
  'bulletins-error', 'reset-cancel-btn', 'reset-confirm-btn',
  'offline-card', 'prepare-offline-btn', 'offline-status', 'rescan-status',
  'offline-cache-banner',
]);

const missingIds = [...ids].filter(id => !html.includes(`id="${id}"`) && !dynamicIds.has(id));
const missingClasses = [...classes].filter(c => !html.includes(`class="${c}"`) && !html.includes(`class="... ${c}`) && !html.includes(`${c} `));
console.log(`JS files analysés : ${jsFiles.length}`);
console.log(`IDs référencés : ${ids.size} — manquants : ${missingIds.length}`);
if (missingIds.length) { console.log('MISSING IDS:'); missingIds.forEach(i => console.log('  -', i)); }
console.log(`Classes référencées (closest/querySelector) : ${classes.size} — manquantes : ${missingClasses.length}`);
if (missingClasses.length) { console.log('MISSING CLASSES:'); missingClasses.forEach(c => console.log('  -', c)); }
process.exit(missingIds.length ? 1 : 0);