#!/usr/bin/env node
/**
 * build.mjs — Pipeline de build du frontend Nka Bulletin
 *
 * 1. Minifie css/app.css (clean-css, niveau 2)
 * 2. Minifie chaque js/*.js (terser) — un fichier par fichier
 * 3. Copie manifest.json + icons/ tels quels
 * 4. Hash de contenu : sha256 -> 8 premiers hex, pour chaque asset minifié
 * 5. Inlining : CSS + JS injectés directement dans dist/index.html
 *    (la source montre 3 lignes au lieu de 200)
 * 6. Les fichiers individuels restent dans dist/ pour le service worker
 * 7. Réécrit dist/sworker.js : hash dans APP_SHELL
 * 8. Nettoie dist/ avant chaque build
 *
 * Les fichiers sources (frontend/) ne sont JAMAIS modifiés.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CleanCSS from 'clean-css';
import { minify } from 'terser';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(SRC, 'dist');

const hash8 = (content) =>
  createHash('sha256').update(content).digest('hex').slice(0, 8);

const fmt = (n) => n.toLocaleString('fr-FR') + ' o';

async function mustRead(rel) {
  try {
    return await readFile(path.join(SRC, rel), 'utf8');
  } catch {
    throw new Error(`Fichier source introuvable : ${rel}`);
  }
}

async function main() {
  // --- 1. Nettoyage de dist/ ------------------------------------------------
  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, 'css'), { recursive: true });
  await mkdir(path.join(DIST, 'js'), { recursive: true });
  await mkdir(path.join(DIST, 'icons'), { recursive: true });

  const hashes = {}; // 'js/xxx.js' -> hash8
  const sizes = {};  // 'js/xxx.js' -> { before, after }
  const minifiedContents = {}; // 'js/xxx.js' -> minified string

  // --- 2. CSS -----------------------------------------------------------------
  const cssRaw = await mustRead('css/app.css');
  const cssMin = new CleanCSS({ level: 2 }).minify(cssRaw);
  if (cssMin.errors.length > 0) {
    throw new Error(`clean-css : ${cssMin.errors.join(' ; ')}`);
  }
  const cssHash = hash8(cssMin.styles);
  hashes['css/app.css'] = cssHash;
  sizes['css/app.css'] = {
    before: Buffer.byteLength(cssRaw),
    after: Buffer.byteLength(cssMin.styles),
  };
  minifiedContents['css/app.css'] = cssMin.styles;
  // Écriture individuelle pour le service worker
  await writeFile(path.join(DIST, 'css/app.css'), cssMin.styles);

  // --- 3. JS (un fichier par fichier, noms conservés) --------------------------
  const jsFiles = (await readdir(path.join(SRC, 'js')))
    .filter((f) => f.endsWith('.js'))
    .sort();
  if (jsFiles.length === 0) {
    throw new Error('Aucun fichier .js trouvé dans frontend/js/');
  }
  for (const file of jsFiles) {
    const rel = `js/${file}`;
    const raw = await mustRead(rel);
    const result = await minify(raw, {
      compress: true,
      mangle: true,
      format: { comments: false },
    });
    if (result.error) {
      throw new Error(`terser ${file} : ${result.error.message}`);
    }
    hashes[rel] = hash8(result.code);
    sizes[rel] = {
      before: Buffer.byteLength(raw),
      after: Buffer.byteLength(result.code),
    };
    minifiedContents[rel] = result.code;
    // Écriture individuelle pour le service worker
    await writeFile(path.join(DIST, rel), result.code);
  }

  // --- 4. Copie statique (manifest + icônes) -----------------------------------
  await copyFile(path.join(SRC, 'manifest.json'), path.join(DIST, 'manifest.json'));
  const icons = (await readdir(path.join(SRC, 'icons'))).filter((f) => f.endsWith('.png'));
  for (const icon of icons) {
    await copyFile(path.join(SRC, 'icons', icon), path.join(DIST, 'icons', icon));
  }

  // --- 5. Inlining : CSS + JS dans index.html -----------------------------------
  // Le HTML source ne montre plus que la structure, le code est invisible
  const html = await mustRead('index.html');

  // 5a. Remplacer le <link rel="stylesheet"> par <style> inline
  let htmlInlined = html.replace(
    /<link\s+rel="stylesheet"\s+href="css\/app\.css\?[^"]*"\s*\/?>/i,
    `<style>${minifiedContents['css/app.css']}</style>`
  );

  // 5b. Remplacer chaque <script src="js/..."> par <script> inline
  //    (avec ou sans query string ?v=...)
  htmlInlined = htmlInlined.replace(
    /<script\s+src="(js\/[^"]+?)(?:\?[^"]*)?"><\/script>/gi,
    (m, assetPath) => {
      const content = minifiedContents[assetPath];
      if (!content) throw new Error(`Asset référencé dans index.html mais absent du build : ${assetPath}`);
      return `<script>${content}</script>`;
    }
  );

  await writeFile(path.join(DIST, 'index.html'), htmlInlined);

  // --- 6. Réécriture de dist/sworker.js (non minifié) ----------------------------
  // Le SW continue de cacher les fichiers individuels pour le cache offline
  const sw = await mustRead('sworker.js');
  const swOut = sw.replace(
    /((?:\/)?(?:css|js)\/[^'"?]+)((?:\?[^'"]*)?)/g,
    (m, ref, query) => {
      const h = hashes[ref.replace(/^\//, '')];
      if (!h) return m;
      return `${ref}?v=${h}`;
    }
  );
  await writeFile(path.join(DIST, 'sworker.js'), swOut);

  // --- 7. Résumé -----------------------------------------------------------------
  const total = { before: 0, after: 0 };
  console.log('\n=== Build Nka Bulletin ===');
  for (const [rel, s] of Object.entries(sizes)) {
    total.before += s.before;
    total.after += s.after;
    const pct = ((1 - s.after / s.before) * 100).toFixed(1);
    console.log(
      `  ${rel.padEnd(18)} ${fmt(s.before).padStart(9)} -> ${fmt(s.after).padStart(9)}  (-${pct}%)  hash: ${hashes[rel]}`
    );
  }
  const pct = ((1 - total.after / total.before) * 100).toFixed(1);
  console.log(
    `  ${'TOTAL'.padEnd(18)} ${fmt(total.before).padStart(9)} -> ${fmt(total.after).padStart(9)}  (-${pct}%)`
  );
  console.log(`  Fichiers : ${Object.keys(sizes).length} (1 css + ${jsFiles.length} js) + manifest.json + ${icons.length} icônes`);
  console.log(`  Mode : INLINE (CSS + JS dans index.html)`);
  console.log(`  Sortie : ${DIST}\n`);
}

main().catch((err) => {
  console.error(`\n[build] ERREUR : ${err.message}`);
  process.exit(1);
});
