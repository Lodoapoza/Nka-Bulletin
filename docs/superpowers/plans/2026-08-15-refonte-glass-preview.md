# Refonte Glassmorphism Premium — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refonte look & feel complète de Nka Bulletin en glassmorphism premium (Approche B : refonte structurelle HTML + CSS), sans casser la logique JS existante.

**Architecture:** PWA vanilla JS (pas de framework). Refonte par couches : tokens + fond → chrome (topbar/nav/PIN) → vues une à une → animations → polish → build/déploiement. Chaque ID référencé par le JS est une ancre intouchable (~140 IDs + ~40 classes). Le CSS est la source du look ; le JS n'est modifié que pour 2 points mineurs (meta theme-color, kill-switch éventuel).

**Tech Stack:** HTML/CSS pur, backdrop-filter (avec fallback `@supports`), animations CSS transform/opacity, build `node frontend/build.mjs`, déploiement FTPS `backend/scripts/deploy-ftps.py`.

**Spec de référence :** `docs/superpowers/specs/2026-08-15-refonte-glass-preview-design.md` — TOUTES les valeurs exactes (tokens §3, keyframes §5, structures §6, risques §10) y sont. Le plan ci-dessous orchestre ; la spec est la source des valeurs.

## Global Constraints

- **IDs JS intouchables** : chaque `getElementById`/`create('…')`/`closest('.card')` des 15 fichiers JS doit continuer de matcher. Audit d'ID obligatoire après CHAQUE vue (script Task 0).
- **`.card` jamais supprimé** des cartes settings (`settings.js` fait `pushSwitch.closest('.card')` + insertion `offline-card`).
- **Pas de blur sur les listes** : `.bulletin-item`, `.icon-btn`, `.field input/select`, `.analyse-table` = tint solide (`--glass-surface-solid`), jamais de `backdrop-filter`.
- **Provider cards marques intactes** : gmail `#EA4335`, yahoo `#6001D2`, outlook `#0078D4` — pas de glass-ification.
- **Blobs sans `filter: blur()`** : uniquement `radial-gradient` (perf).
- **Animations en transform/opacity uniquement**, durées 140-280ms, easing `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`.
- **`prefers-reduced-motion`** : règle étendue (spec §5) — jamais d'animation si activé.
- **Fallback `@supports not (backdrop-filter…)`** : surfaces solides `--glass-surface-solid`.
- **Versioning non négociable avant déploiement** : bump `?v=` dans `index.html` ET `sworker.js` (APP_SHELL) + `CACHE_NAME` v22→v23.
- **Modifier `frontend/` uniquement** (jamais `dist/` à la main) ; commit uniquement `frontend/` + docs, jamais de commit global (worktree backend sale).
- **Texte UI français sobre** : « Mettre à jour », « bulletins », « recherche » (pas de « messagerie »/« synchronisation »).
- **Accessibilité** : focus visible (`outline: 2px solid var(--md-primary); outline-offset: 2px`), `.bg-scene` en `aria-hidden="true"`, touch targets ≥ 44px.
- **`--danger: #c0392b`** à définir dans `:root` (correction token, carte danger).
- **`#merge-bar`** : `position: sticky; bottom: calc(96px + env(safe-area-inset-bottom, 0px))` en CSS (retirer le style inline).
- **`#dash-amounts-card`** : conserver `contain: layout style` et le `display` piloté par JS.
- **`#app`** : `position: relative; z-index: 1` ; `.bg-scene` premier enfant de `<body>` avant `#app`, `z-index: 0`, `max-width: 480px`, `pointer-events: none`.
- **Nav flottante** : `left:50%; transform:translateX(-50%); bottom:max(10px, env(safe-area-inset-bottom,0px)); width:calc(100% - 20px); max-width:460px; border-radius:24px` ; `#app { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) }` ; `.app-version { bottom: 92px }`.
- **PIN** : wrapper `.pin-card` intercalé OK (capture par ID), tous les `pin-*` restent descendants de `#pin-screen`.
- **`bulletins-error`** créé APRÈS `bulletins-list` par JS → ne pas envelopper la liste dans un conteneur overflow.
- **`offline-cache-banner`** : laisser solide (alerte temporaire, contraste).

---

### Task 0: Préparation — branche, baseline, audit ID

**Files:**
- Create: `scripts/audit-ids.mjs` (à la racine du repo, ou `frontend/scripts/audit-ids.mjs`)
- Modify: aucun

**Interfaces:**
- Produces: script `audit-ids.mjs` — sortie : liste des IDs/classes référencés par le JS et manquants dans `index.html`. Utilisé comme gate après chaque tâche de vue.

- [ ] **Step 1: Créer le script d'audit ID**

```js
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

const missingIds = [...ids].filter(id => !html.includes(`id="${id}"`));
const missingClasses = [...classes].filter(c => !html.includes(`class="${c}"`) && !html.includes(`class="... ${c}`) && !html.includes(`${c} `));
console.log(`JS files analysés : ${jsFiles.length}`);
console.log(`IDs référencés : ${ids.size} — manquants : ${missingIds.length}`);
if (missingIds.length) { console.log('MISSING IDS:'); missingIds.forEach(i => console.log('  -', i)); }
console.log(`Classes référencées (closest/querySelector) : ${classes.size} — manquantes : ${missingClasses.length}`);
if (missingClasses.length) { console.log('MISSING CLASSES:'); missingClasses.forEach(c => console.log('  -', c)); }
process.exit(missingIds.length ? 1 : 0);
```

- [ ] **Step 2: Exécuter l'audit sur l'état actuel**

Run: `node scripts/audit-ids.mjs`
Expected: `IDs référencés : ~140 — manquants : 0` (exit 0). Si des manquants apparaissent, ce sont des IDs créés dynamiquement par JS (ex. `bulletins-error`, `reset-overlay`) — les ajouter à une liste blanche `dynamicIds` dans le script (commentaire : « créés par JS »).

- [ ] **Step 3: Build baseline + screenshots**

Run: `node frontend/build.mjs`
Expected: build OK, `frontend/dist/` régénéré.
Screenshots de référence (4 accents × 2 thèmes × vue dashboard) via navigateur sur `frontend/index.html` (ou serveur local) — archiver dans `/tmp/refonte-baseline/`.

- [ ] **Step 4: Commit**

```bash
git add scripts/audit-ids.mjs
git commit -m "chore(frontend): add ID audit script for glass refonte"
```

---

### Task 1: Tokens + fond

**Files:**
- Modify: `frontend/css/app.css` (tokens §3, blobs §3.3, `.bg-scene` §4)
- Modify: `frontend/index.html` (insérer `.bg-scene` avant `#app`)
- Modify: `frontend/js/settings.js` (meta theme-color, 2 hex — spec §10 risque 14)

**Interfaces:**
- Consumes: spec §3 (tokens exacts), §4 (structure bg-scene)
- Produces: variables `--bg-base`, `--glass-*`, `--blob-1/2/3` (8 combos accent×thème), `.bg-scene` + `.blob--1/2/3` — consommés par toutes les tâches suivantes.

- [ ] **Step 1: Ajouter les tokens glass + fond dans `app.css`**

Copier depuis la spec §3.1, §3.2, §3.3 (valeurs EXACTES) : `--bg-base` (clair + dark), `--glass-surface/-strong/-soft/-solid`, `--glass-border/-subtle`, `--glass-blur/-sm/-lg`, `--glass-saturate`, `--glass-shadow/-lg`, `--ease-out`, `--danger: #c0392b`, et les 8 blocs `--blob-1/2/3` dans les blocs `[data-accent]` × `[data-accent][data-theme="dark"]` existants. Ne PAS encore modifier les surfaces existantes (elles restent opaques — critère : aucun changement visuel).

- [ ] **Step 2: Ajouter `.bg-scene` + blobs dans `app.css`**

Copier depuis la spec §4 (structure `.bg-scene`, `.blob`, `.blob--1/2/3` avec positions/durées EXACTES) + `#app { position: relative; z-index: 1; }` + `body { background: var(--bg-base); }`.

- [ ] **Step 3: Insérer `.bg-scene` dans `index.html`**

Premier enfant de `<body>`, AVANT `#app` :
```html
<div class="bg-scene" aria-hidden="true">
  <span class="blob blob--1"></span>
  <span class="blob blob--2"></span>
  <span class="blob blob--3"></span>
</div>
```

- [ ] **Step 4: Mettre à jour meta theme-color dans `settings.js`**

Remplacer les 2 hex hardcodés (actuellement `#10201C` light/dark) par la base du dégradé : light `#F4F9F6`, dark `#0A1512`.

- [ ] **Step 5: Vérifier**

Run: `node scripts/audit-ids.mjs` → exit 0. `node frontend/build.mjs` → OK.
Vérification visuelle : 8 combos (4 accents × clair/dark) — le fond dégradé + blobs dérivent ; les surfaces existantes sont INCHANGÉES (encore opaques) ; `prefers-reduced-motion` → blobs immobiles.

- [ ] **Step 6: Commit**

```bash
git add frontend/css/app.css frontend/index.html frontend/js/settings.js
git commit -m "feat(frontend): glass tokens, animated background scene, theme-color sync"
```

---

### Task 2: Chrome — topbar, nav flottante, PIN

**Files:**
- Modify: `frontend/css/app.css` (`.topbar`, `.bottom-nav`, `#app` padding, `.app-version`, `#pin-screen`, `.pin-card`)
- Modify: `frontend/index.html` (wrapper `.pin-card` dans `#pin-screen`)

**Interfaces:**
- Consumes: tokens Task 1
- Produces: chrome glass (topbar, nav flottante, PIN) — base visuelle des vues.

- [ ] **Step 1: Topbar glass**

`.topbar` : `background: var(--glass-surface-strong)` + `backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))` + `-webkit-backdrop-filter` + `border-bottom: 1px solid var(--glass-border)`. Supprimer le `linear-gradient(180deg, var(--md-primary-container)...)` actuel. Classes/IDs intouchés.

- [ ] **Step 2: Nav flottante glass**

`.bottom-nav` : valeurs EXACTES des Global Constraints (flottante, blur 20px, `--glass-surface-strong`, `border-radius: 24px`, `--glass-shadow-lg`). `#app { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) }`. `.app-version { bottom: 92px }`. Vérifier que `applyAnalyseNav` (display:none sur `[data-view="analyse"]`) fonctionne toujours.

- [ ] **Step 3: PIN glass**

`#pin-screen` : `background: linear-gradient(180deg, var(--glass-surface-strong), var(--glass-surface-soft))` + `backdrop-filter: blur(var(--glass-blur-lg)) saturate(var(--glass-saturate))` (z-index 100 conservé). Dans `index.html`, envelopper le contenu de `#pin-screen` dans `.pin-card` (glass strong, blur 28px, radius 24px, padding 28px, max-width 320px, centré) — TOUS les `pin-*` restent descendants de `#pin-screen` (spec §6 PIN). `.pin-key` : `--glass-surface-soft` + bordure `--glass-border-subtle` (tint, pas de blur).

- [ ] **Step 4: Vérifier**

Run: `node scripts/audit-ids.mjs` → exit 0. `node frontend/build.mjs` → OK.
Test matrix : PIN setup / unlock / change / cooldown ; nav flotte avec safe-area ; nav-analyse hide/show ; badge offline ; banner offline au-dessus du topbar.

- [ ] **Step 5: Commit**

```bash
git add frontend/css/app.css frontend/index.html
git commit -m "feat(frontend): glass chrome — topbar, floating nav, glass PIN"
```

---

### Task 3: Vue Dashboard

**Files:**
- Modify: `frontend/css/app.css` (`.card` glass par défaut, `.stack-hero`, `#dash-amounts-card`, `.guided-status-card`, `.export-card`)
- Modify: `frontend/index.html` (restructure intérieure de `#view-dashboard` uniquement)

**Interfaces:**
- Consumes: tokens Task 1, chrome Task 2
- Produces: pattern `.card` glass (consommé par toutes les vues suivantes).

- [ ] **Step 1: `.card` glass par défaut**

`.card` : `background: var(--glass-surface)` + blur 16-20px + saturate + `border: 1px solid var(--glass-border)` + `--glass-shadow` (radius/padding/margin inchangés). `.card.elevated` : `--glass-surface-strong` + `--glass-shadow-lg`. Ajouter le fallback `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` → `.card { background: var(--glass-surface-solid) }` (et idem pour toutes les surfaces blur des tâches suivantes).

- [ ] **Step 2: Stack-hero glass**

`.stack-card` 1-2 : `--glass-surface-soft` + blur 16 (opacity conservée). Carte 3 : `linear-gradient(135deg, color-mix(in srgb, var(--md-primary-container) 55%, transparent), var(--glass-surface))` + blur. `#dash-amounts-card` : conserver `contain: layout style` et le `display` piloté par JS.

- [ ] **Step 3: Cartes dashboard**

`.guided-status-card`, `.export-card`, `#dash-latest`, `#dash-sync-status` : héritent du `.card` glass (aucune restructure HTML nécessaire sauf si la spec §6 Dashboard l'exige). Vérifier `dash-latest-title` (font-weight inline conservé), `amounts-eye/-icon`, `dash-sync-now`.

- [ ] **Step 4: Vérifier**

Run: `node scripts/audit-ids.mjs` → exit 0. `node frontend/build.mjs` → OK.
Test matrix dashboard : sync (bouton + spinner + statut), eye (masquer/voir), guided card (états), export rapide, `[data-merge]`.

- [ ] **Step 5: Commit**

```bash
git add frontend/css/app.css frontend/index.html
git commit -m "feat(frontend): glass dashboard — cards, stack-hero, guided card"
```

---

### Task 4: Vue Bulletins

**Files:**
- Modify: `frontend/css/app.css` (`.search-bar`, `.dropdown-trigger`, `.custom-dropdown-panel`, `.bulletin-item`, `#merge-bar`)
- Modify: `frontend/index.html` (restructure intérieure de `#view-bulletins` uniquement)

**Interfaces:**
- Consumes: `.card` glass (Task 3)
- Produces: pattern liste tint solide + merge-bar sticky CSS.

- [ ] **Step 1: Recherche + dropdowns glass**

`.search-bar`, `.dropdown-trigger`, `.filter-select` : `--glass-surface-soft` + `blur(var(--glass-blur-sm))` + bordure `--glass-border-subtle`. `.custom-dropdown-panel` : `--glass-surface-strong` + blur 20 + `--glass-shadow-lg`. `year-trigger`/`month-trigger` intouchables (aria-labelledby).

- [ ] **Step 2: Liste tint solide**

`.bulletin-item` : `background: var(--glass-surface-solid)` + `border: 1px solid var(--glass-border)` — **PAS de backdrop-filter** (perf scroll). Ne pas envelopper `bulletins-list` dans un conteneur overflow (`bulletins-error` inséré après par JS).

- [ ] **Step 3: Merge-bar sticky CSS**

Retirer le `style="position:sticky;bottom:96px"` inline de `#merge-bar` dans `index.html` et ajouter en CSS : `#merge-bar { position: sticky; bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }` + `--glass-surface-strong` + blur 16 + `--glass-shadow-lg`.

- [ ] **Step 4: Vérifier**

Run: `node scripts/audit-ids.mjs` → exit 0. `node frontend/build.mjs` → OK.
Test matrix bulletins : recherche, dropdowns (clavier + esc), sélection multiple, merge-bar (≥2 sélections, count, bouton), scroll liste fluide.

- [ ] **Step 5: Commit**

```bash
git add frontend/css/app.css frontend/index.html
git commit -m "feat(frontend): glass bulletins — search, dropdowns, tint list, sticky merge bar"
```

---

### Task 5: Vue Analyse

**Files:**
- Modify: `frontend/css/app.css` (`.stat-tile`, `#analyse-chart`, `.analyse-table`, `#analyse-alerts-card`)
- Modify: `frontend/index.html` (restructure intérieure de `#view-analyse` uniquement)

**Interfaces:**
- Consumes: `.card` glass (Task 3)
- Produces: — (aucune dépendance aval)

- [ ] **Step 1: Stat tiles + cartes glass**

Les 4 `.stat-tile` et cartes héritent du `.card` glass. `analyse-max/-min/-avg/-total` + `-sub` : garder le pattern `<ID>-sub` (le JS fait `getElementById(id + '-sub')`). `analyse-stats` : `display` piloté par JS conservé.

- [ ] **Step 2: Chart + table + alerts**

`#analyse-chart` : fond glass, barres/points avec glow accent subtil. `.analyse-table` : tint solide (pas de blur). `#analyse-alerts-card` + `#analyse-alerts` : glass standard. `analyse-empty`(+`-msg`) : glass.

- [ ] **Step 3: Vérifier**

Run: `node scripts/audit-ids.mjs` → exit 0. `node frontend/build.mjs` → OK.
Test matrix analyse : stats affichées/masquées, chart rendu, table, alerts, empty state.

- [ ] **Step 4: Commit**

```bash
git add frontend/css/app.css frontend/index.html
git commit -m "feat(frontend): glass analyse — stat tiles, chart, table, alerts"
```

---

### Task 6: Vue Settings

**Files:**
- Modify: `frontend/css/app.css` (`.provider-card`, `.accent-swatch`, switches, `.field input/select`, `#add-account-form`)
- Modify: `frontend/index.html` (restructure intérieure de `#view-settings` uniquement)

**Interfaces:**
- Consumes: `.card` glass (Task 3)
- Produces: — (⚠️ la vue la plus risquée : `closest('.card')` + `offline-card`)

- [ ] **Step 1: Cartes settings — NE PAS retirer `.card`**

Toutes les cartes settings gardent la classe `.card` (obligatoire : `settings.js` fait `pushSwitch.closest('.card')` et insère `offline-card` AVANT la carte de `push-switch`). `#add-account-form` (`.card.elevated`) → glass strong.

- [ ] **Step 2: Provider cards — marques intactes**

`.provider-card` gmail/yahoo/outlook : couleurs de marque `#EA4335`/`#6001D2`/`#0078D4` INTACTES (pas de glass). Carte IMAP : `--glass-surface-strong` + bordure. `accounts-list` rows : conserver les inline styles JS (`display:flex; padding:12px 0; borderBottom: var(--md-outline)`).

- [ ] **Step 3: Switches, swatches, champs**

Switches : track glass + thumb accent. `.accent-swatch` (4 pastilles) : halo accent au focus. `.field input/select` : `--glass-surface-soft` + bordure `--glass-border-subtle` (tint, pas de blur) + focus ring accent. `#app-pwd-link` : reste un bloc info (display piloté par JS).

- [ ] **Step 4: Vérifier**

Run: `node scripts/audit-ids.mjs` → exit 0. `node frontend/build.mjs` → OK.
Test matrix settings : provider switch (gmail/yahoo/outlook/imap), password toggle, save settings (persistance), rescan, dark-mode switch, accent swatches, push-switch + offline-card insertion, change PIN, reset device, about.

- [ ] **Step 5: Commit**

```bash
git add frontend/css/app.css frontend/index.html
git commit -m "feat(frontend): glass settings — cards, providers, switches, form"
```

---

### Task 7: About + Overlays

**Files:**
- Modify: `frontend/css/app.css` (`.about-hero`, `.fullscreen-overlay`, `.overlay-card`, `.reset-modal`, `.license-row`)
- Modify: `frontend/index.html` (restructure intérieure de `#view-about`, `#licence-screen`, `#admin-screen`)

**Interfaces:**
- Consumes: `.card` glass (Task 3)
- Produces: — (aucune dépendance aval)

- [ ] **Step 1: About glass**

`.about-hero` + `.pin-logo` restylés glass. `about-back-btn`, `about-version` (5 taps → admin conservé), `about-website-btn` intouchables.

- [ ] **Step 2: Overlays glass**

`.fullscreen-overlay` : `background: rgba(255,255,255,0.45)` / dark `rgba(10,20,17,0.5)` + `backdrop-filter: blur(24px)`. `.overlay-card` : glass strong + blur 28. `#licence-screen`(+`-msg`, `-close-btn`), `#admin-screen`(+`admin-login-block`, `admin-panel`, `admin-password`, `admin-login-btn`, `admin-error`, `admin-matricule`, `admin-duration`, `admin-grant-btn`, `admin-licenses`, `admin-close-btn`, `.license-row`) : restylés via CSS, classes/IDs conservés. `reset-overlay`/`reset-modal`/`confirm` (créés dynamiquement par confirm.js/reset.js) : restylés via CSS uniquement.

- [ ] **Step 3: Vérifier**

Run: `node scripts/audit-ids.mjs` → exit 0. `node frontend/build.mjs` → OK.
Test matrix : admin (5 taps), licence (affichage), reset (confirmation), overlays ouverts/fermés.

- [ ] **Step 4: Commit**

```bash
git add frontend/css/app.css frontend/index.html
git commit -m "feat(frontend): glass about and overlays — licence, admin, reset"
```

---

### Task 8: Animations

**Files:**
- Modify: `frontend/css/app.css` (keyframes §5, classes, extension reduced-motion)

**Interfaces:**
- Consumes: structures Tasks 2-7
- Produces: — (aucune dépendance aval)

- [ ] **Step 1: Keyframes + classes**

Copier depuis la spec §5 (tableau EXACT) : `view-enter` (260ms, `both`), `blob-drift-1/2/3` (26s/34s/42s, délais 0/-9s/-18s), `panel-pop` (160ms), `merge-bar-in` (220ms), `dot-pop` (140ms), `hero-float` (7s), `nav-icon` (200ms). Easing `--ease-out` partout. Tout en transform/opacity.

- [ ] **Step 2: Extension reduced-motion**

Copier depuis la spec §5 (liste EXACTE des sélecteurs) : `animation: none !important; transition: none !important`.

- [ ] **Step 3: Vérifier**

Run: `node frontend/build.mjs` → OK.
Vérification : le Router re-joue `view-enter` à chaque navigation (display none→block) ; merge-bar, dropdown, dots, blobs animent ; `prefers-reduced-motion` → tout immobile.

- [ ] **Step 4: Commit**

```bash
git add frontend/css/app.css
git commit -m "feat(frontend): light animations — view transitions, blobs, micro-interactions"
```

---

### Task 9: Polish + a11y

**Files:**
- Modify: `frontend/css/app.css` (focus rings, scrollbars dropdown, touch targets)

**Interfaces:**
- Consumes: tout le CSS des Tasks 1-8
- Produces: — (aucune dépendance aval)

- [ ] **Step 1: Focus rings + a11y**

Focus visible sur glass : `outline: 2px solid var(--md-primary); outline-offset: 2px` (boutons, inputs, nav, swatches). Vérifier `.bg-scene` en `aria-hidden="true"` (déjà posé Task 1). Touch targets ≥ 44px (nav, icon-btn, pin-key 72px OK).

- [ ] **Step 2: Contrastes + scrollbars**

Vérifier contrastes AA (on-surface sur `--glass-surface` ≈ 15:1 clair / 14:1 dark ; eyebrow primaire ≥ 4.5:1). Scrollbars dropdown stylées. HTML validator sur `index.html`.

- [ ] **Step 3: Vérifier**

Run: `node frontend/build.mjs` → OK. Lighthouse/axe ≥ 90 (si outil dispo) ; sinon vérification manuelle focus/contraste.

- [ ] **Step 4: Commit**

```bash
git add frontend/css/app.css frontend/index.html
git commit -m "feat(frontend): polish and a11y — focus rings, contrast, scrollbars"
```

---

### Task 10: Build + SW + déploiement production

**Files:**
- Modify: `frontend/index.html` (bump `?v=` de TOUS les assets modifiés)
- Modify: `frontend/sworker.js` (APP_SHELL `?v=` + `CACHE_NAME` v22→v23)

**Interfaces:**
- Consumes: tout (Tasks 0-9)
- Produces: déploiement production vérifié.

- [ ] **Step 1: Bump versions**

Dans `frontend/index.html` : bump `?v=` de tous les fichiers JS/CSS modifiés (app.css, app.js, dashboard.js, bulletins.js, analyse.js, settings.js, theme.js, etc. — chaque fichier touché). Dans `frontend/sworker.js` : bump les `?v=` de l'APP_SHELL + `CACHE_NAME` v22→v23.

- [ ] **Step 2: Build**

Run: `node frontend/build.mjs`
Expected: build OK ; vérifier que les hashs dist correspondent aux sources (`frontend/dist/`).

- [ ] **Step 3: Audit final**

Run: `node scripts/audit-ids.mjs` → exit 0. Test matrix COMPLÈTE (spec §8) sur build local.

- [ ] **Step 4: Déployer**

Run: `python3 backend/scripts/deploy-ftps.py`
Expected: upload complet (frontend + backend), restart Passenger via tmp/restart.txt.

- [ ] **Step 5: Smoke test production**

Sur `https://www.nka-bulletin.glocal-innov.com` : chargement, PIN, 4 vues, thèmes (4 accents × dark), sync, merge, admin. Vérifier `CACHE_NAME v23` + `?v=` bumpés dans le réseau. Rollback si régression : redéployer le dist précédent.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/sworker.js
git commit -m "release(frontend): glass refonte v23 — cache bump, build, deploy"
```

---

## Self-Review

**1. Spec coverage :**
- §2 verdict backdrop-filter → Global Constraints + Task 3 Step 1 (fallback @supports) + Task 4 Step 2 (listes tint) ✅
- §3 tokens → Task 1 ✅ ; §3.4 recette par surface → Tasks 2-7 ✅
- §4 architecture (bg-scene, nav flottante) → Tasks 1-2 ✅
- §5 animations + reduced-motion → Task 8 ✅
- §6 structure par vue → Tasks 2-7 (PIN Task 2, dashboard Task 3, bulletins Task 4, analyse Task 5, settings Task 6, about/overlays Task 7) ✅
- §7 accessibilité → Task 9 ✅
- §8 phases + test matrix → Tasks 0-10, matrices dans chaque tâche ✅
- §9 critères de validation → audit ID + build + matrices dans chaque tâche ✅
- §10 risques 1-15 → Global Constraints (1,2,3,4,9,12,15) + Tasks (5→Task 1, 6→Task 1, 7→Task 2, 8→Task 3, 10→Task 2, 11→Task 2, 13→Task 3, 14→Task 1) ✅
- §11 YAGNI → respecté (aucune tâche hors périmètre) ✅
- §12 build/déploiement → Task 10 ✅

**2. Placeholder scan :** aucun « TBD/TODO » ; chaque étape a commande ou code concret ; les valeurs exactes sont déléguées à la spec (référencée explicitement) — pas de placeholder, la spec est la source des valeurs.

**3. Type consistency :** `audit-ids.mjs` (Task 0) réutilisé dans Tasks 1-7, 10 avec la même commande `node scripts/audit-ids.mjs` ; tokens `--glass-*`/`--blob-*` définis Task 1, consommés Tasks 2-7 ; `--ease-out` défini Task 1, consommé Task 8. ✅