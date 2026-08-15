# Nka Bulletin — Refonte Glassmorphism Premium

**Date :** 2026-08-15
**Statut :** conception validée en conversation (sections 1-2 approuvées par l'utilisateur), décisions finales prises par @sage (analyse du code réel)
**Périmètre :** toute l'application (PIN, 4 vues, bottom nav, À propos, overlays licence/admin, modales)

## 1. Objectif

Look & feel prioritaire — verre dépoli premium, dégradés, ombres douces, coins arrondis. Les 4 thèmes existants (emerald/sapphire/amber/ruby) + dark mode sont conservés et adaptés au glass. Animations légères incluses. **Approche B : refonte structurelle** — le HTML des vues peut être refactoré (nouvelle hiérarchie, composants glass), MAIS chaque ID référencé par le JS doit être STRICTEMENT préservé.

## 2. Décisions validées

1. Look & feel prioritaire
2. Glassmorphism premium (verre dépoli, dégradés, ombres douces, coins arrondis)
3. Garder les 4 thèmes actuels + dark mode (adaptés au glass)
4. Portée : TOUTE l'app (4 vues + PIN + À propos + overlays licence/admin)
5. Dark mode conservé + adapté glass
6. Animations légères incluses (transitions de vues, micro-interactions — pas d'animations lourdes)
7. Approche B : refonte structurelle HTML, IDs JS strictement préservés (~140 IDs + ~40 classes référencés par les 15 fichiers JS — aucun ne doit disparaître)
8. Verdict technique backdrop-filter : **OUI pour le chrome et les surfaces transitoires, NON pour les listes à haute fréquence** (`.bulletin-item` = tint solide, jamais de blur). Compromis : ≤ ~10 surfaces floutées simultanément.

### Support & fallback

- iOS Safari / WebView Capacitor : supporté sans préfixe depuis iOS 14 ; garder `-webkit-backdrop-filter` pour iOS 12-13.
- Android Chrome / WebView : supporté depuis Chrome 76.
- Fallback obligatoire : `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` → surfaces solides (`--glass-surface-solid`).
- **Kill-switch global** : variable `--glass-blur` pilotée par `data-low-gpu` sur `<html>` (posé par 3 lignes JS si `navigator.hardwareConcurrency <= 4`) → `--glass-blur: 0px` + fonds solides. À n'activer QUE si jank constaté sur appareil réel.
- **Blobs SANS `filter: blur()`** : `radial-gradient` à dégradé doux (fondus naturels) — jamais de `filter: blur(60px)` sur de gros éléments (piège perf classique).

### Matrice de décision par surface

| Surface | Décision | Valeur | Raison |
|---|---|---|---|
| `.topbar` (sticky) | blur | 20px | 1 seule, chrome permanent, effet signature |
| `.bottom-nav` (flottante) | blur | 20px | 1 seule, chrome permanent |
| `.card` (toutes) | blur | 16-20px | 4-8 visibles max par vue |
| `.search-bar`, `#merge-bar`, `.dropdown-trigger` | blur | 14-16px | 2-3 par vue |
| `.custom-dropdown-panel` | blur | 20px | transitoire |
| `.pin-screen`, `.fullscreen-overlay`, `.overlay-card`, `.reset-modal` | blur | 24-28px | transitoires, plein écran |
| `.bulletin-item` (liste) | **tint seul, PAS de blur** | `--glass-surface-solid` + bordure | haute fréquence = jank scroll |
| `.icon-btn`, `.field input/select`, `.analyse-table` | tint seul | idem | flou invisible = coût pur |
| `.provider-card` marques | **couleurs de marque intactes** | `#EA4335`, `#6001D2`, `#0078D4` | identité produit |

## 3. Tokens

### 3.1 Fond de scène (par thème, indépendant de l'accent)

```css
:root {
  --bg-base: linear-gradient(165deg, #F4F9F6 0%, #EDF3F8 48%, #F8F3EE 100%);
}
[data-theme="dark"] {
  --bg-base: linear-gradient(165deg, #0A1512 0%, #0D191C 48%, #14100D 100%);
}
```

### 3.2 Tokens glass (clair / sombre)

```css
:root {
  --glass-surface:       rgba(255,255,255,0.58);  /* cartes */
  --glass-surface-strong: rgba(255,255,255,0.80); /* topbar, nav, merge-bar, overlays */
  --glass-surface-soft:   rgba(255,255,255,0.42); /* search, triggers, pin-keys */
  --glass-surface-solid:  #F6F8F6;                /* fallback @supports + listes */
  --glass-border:        rgba(255,255,255,0.65);
  --glass-border-subtle: rgba(20,40,33,0.10);     /* hairlines internes */
  --glass-blur:   20px;   --glass-blur-sm: 14px;  --glass-blur-lg: 28px;
  --glass-saturate: 175%;
  --glass-shadow:    0 8px 32px rgba(20,40,33,0.10), 0 2px 10px rgba(20,40,33,0.06);
  --glass-shadow-lg: 0 20px 48px rgba(20,40,33,0.16), 0 4px 14px rgba(20,40,33,0.08);
}
[data-theme="dark"] {
  --glass-surface:       rgba(16,30,26,0.55);
  --glass-surface-strong: rgba(22,38,32,0.74);
  --glass-surface-soft:   rgba(16,30,26,0.38);
  --glass-surface-solid:  #13221C;
  --glass-border:        rgba(255,255,255,0.12);
  --glass-border-subtle: rgba(231,238,233,0.10);
  --glass-blur: 20px;  --glass-blur-sm: 14px;  --glass-blur-lg: 28px;
  --glass-saturate: 150%;
  --glass-shadow:    0 8px 32px rgba(0,0,0,0.36), 0 2px 10px rgba(0,0,0,0.26);
  --glass-shadow-lg: 0 20px 48px rgba(0,0,0,0.48), 0 4px 14px rgba(0,0,0,0.30);
}
```

### 3.3 Couleurs des blobs (par accent × thème)

Déclarées dans les 8 blocs accent/thème existants (`[data-accent]` × `[data-accent][data-theme="dark"]`). Logique : blob 1 = primaire, blob 2 = secondaire ambre, blob 3 = primaire-deep.

**Clair :**

| Accent | `--blob-1` | `--blob-2` | `--blob-3` |
|---|---|---|---|
| emerald | `rgba(27,110,92,.34)` | `rgba(242,169,59,.20)` | `rgba(14,74,60,.16)` |
| sapphire | `rgba(30,90,168,.30)` | `rgba(242,169,59,.18)` | `rgba(18,58,112,.16)` |
| amber | `rgba(180,120,0,.26)` | `rgba(27,110,92,.18)` | `rgba(242,169,59,.16)` |
| ruby | `rgba(165,52,58,.26)` | `rgba(242,169,59,.18)` | `rgba(110,32,37,.14)` |

**Sombre** (alphas plus bas ; blob 3 = container couleur profonde) :

| Accent | `--blob-1` | `--blob-2` | `--blob-3` |
|---|---|---|---|
| emerald | `rgba(127,217,190,.20)` | `rgba(242,169,59,.12)` | `rgba(14,74,60,.45)` |
| sapphire | `rgba(155,192,245,.18)` | `rgba(242,169,59,.10)` | `rgba(18,58,112,.45)` |
| amber | `rgba(255,199,99,.18)` | `rgba(127,217,190,.10)` | `rgba(122,82,0,.45)` |
| ruby | `rgba(255,178,180,.16)` | `rgba(242,169,59,.10)` | `rgba(110,32,37,.45)` |

### 3.4 Recette par surface

```css
.card {
  background: var(--glass-surface);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  /* radius 24px, padding 20px, margin, backface-visibility : inchangés */
}
.card.elevated, #add-account-form { background: var(--glass-surface-strong); box-shadow: var(--glass-shadow-lg); }
.bulletin-item { background: var(--glass-surface-solid); border: 1px solid var(--glass-border); } /* PAS de blur */
.topbar { background: var(--glass-surface-strong); backdrop-filter: ...; border-bottom: 1px solid var(--glass-border); }
.bottom-nav { background: var(--glass-surface-strong); backdrop-filter: ...; border: 1px solid var(--glass-border); border-radius: 24px; box-shadow: var(--glass-shadow-lg); }
.search-bar, .dropdown-trigger, .filter-select { background: var(--glass-surface-soft); backdrop-filter: blur(var(--glass-blur-sm)); border: 1px solid var(--glass-border-subtle); }
.custom-dropdown-panel { background: var(--glass-surface-strong); backdrop-filter: ...; border: 1px solid var(--glass-border); box-shadow: var(--glass-shadow-lg); }
.pin-screen { background: linear-gradient(180deg, var(--glass-surface-strong), var(--glass-surface-soft)); backdrop-filter: blur(var(--glass-blur-lg)) saturate(var(--glass-saturate)); }
.fullscreen-overlay { background: rgba(255,255,255,0.45) / dark rgba(10,20,17,0.5); backdrop-filter: blur(24px); }
.pin-key, .icon-btn, .field input, .field select { background: var(--glass-surface-soft); border: 1px solid var(--glass-border-subtle); } /* tint, pas de blur */
```

## 4. Architecture visuelle

- **Fond** : dégradé ambiant animé très subtil (3 blobs radial-gradient dérivés de l'accent actif, ~15-20% d'opacité) + grain léger. En dark : dégradé profond (bleu nuit → violet) avec les mêmes blobs.
- **Topbar** : verre dépoli (blur 20px, saturate 175%), bordure basse translucide, logo + titre. Badge connexion et toggle thème identiques (IDs préservés).
- **Bottom nav** : verre dépoli **flottante** (détachée du bas, coins 24px, ombre douce), icône active avec pastille accent + micro-animation. 4 items conservés (`data-view` préservés).
- **Cartes** : surfaces translucides, coins 20px, bordure 1px translucide, ombres douces multicouches. Stack-hero = cartes glass superposées avec profondeur.
- **Typographie** : Plus Jakarta Sans (titres) + Inter (texte) + Roboto Mono (montants) — déjà chargées, zéro coût. Hiérarchie renforcée : titres plus grands, eyebrows uppercase letter-spacing, montants plus imposants.
- **PIN screen** : fond glass + logo avec halo lumineux, keypad circulaire glass, feedback tactile.

### Structure du fond animé

```html
<div class="bg-scene" aria-hidden="true">
  <span class="blob blob--1"></span>
  <span class="blob blob--2"></span>
  <span class="blob blob--3"></span>
</div>
```
Premier enfant de `<body>`, AVANT `#app`.

```css
.bg-scene { position: fixed; inset: 0 auto 0 50%; transform: translateX(-50%); width: 100%; max-width: 480px; overflow: hidden; pointer-events: none; z-index: 0; }
#app { position: relative; z-index: 1; }
.blob { position: absolute; border-radius: 50%; will-change: transform; }
.blob--1 { width: 480px; height: 480px; top: -140px; left: -140px;  background: radial-gradient(circle, var(--blob-1) 0%, transparent 70%); animation: blob-drift-1 26s ease-in-out infinite alternate; }
.blob--2 { width: 380px; height: 380px; top: 30%; right: -160px;   background: radial-gradient(circle, var(--blob-2) 0%, transparent 70%); animation: blob-drift-2 34s ease-in-out infinite alternate; animation-delay: -9s; }
.blob--3 { width: 420px; height: 420px; bottom: -160px; left: -80px; background: radial-gradient(circle, var(--blob-3) 0%, transparent 70%); animation: blob-drift-3 42s ease-in-out infinite alternate; animation-delay: -18s; }
```
Contrainte max-width 480px : la colonne app (desktop garde le dégradé nu sur les côtés — effet "colonne de verre").

## 5. Animations

Easing commun : `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`. **Tout en `transform`/`opacity` uniquement**. Durées 140-280 ms sauf blobs.

| Animation | Élément | Keyframes | Durée / easing | Déclencheur |
|---|---|---|---|---|
| **view-enter** | `.view:not(.hidden)` | `from { opacity:0; transform: translateY(10px); }` | 260ms `--ease-out`, `both` | Re-montage auto par le Router (display none→block relance l'animation CSS — zéro JS) |
| **blob-drift** | `.blob--1/2/3` | `translate(±24-36px) scale(1.08-1.15)` alterné | 26s / 34s / 42s, `ease-in-out infinite alternate`, délais `0 / -9s / -18s` | Permanent |
| **panel-pop** | `.custom-dropdown-panel` | `from { opacity:0; transform: translateY(-4px) scale(0.98); }` | 160ms `--ease-out` | Apparition du panel |
| **merge-bar-in** | `#merge-bar` | `from { opacity:0; transform: translateY(10px); }` | 220ms `--ease-out` | `.hidden` retiré (≥2 sélections) |
| **dot-pop** | `.pin-dot.filled` | `from { transform: scale(0.6); opacity:0.5; }` | 140ms `--ease-out` | Saisie PIN |
| **hero-float** | `.stack-card:nth-child(3)` | `translateY(-2px)` | 7s `ease-in-out infinite alternate` | Permanent (subtil) |
| **nav-icon** | `.nav-item.active svg` | `scale(1.08)` | 200ms `--ease-out` | Changement d'onglet |
| **active press** | `.btn:active` | `scale(0.97)` | 120ms | Déjà en place, conservé |

### prefers-reduced-motion — extension de la règle existante

```css
@media (prefers-reduced-motion: reduce) {
  .view, .card, .btn, .btn-spinner, .topbar, .bottom-nav, .nav-item,
  .blob, .stack-card, .pin-dot, .custom-dropdown-panel, #merge-bar,
  .search-bar, .dropdown-trigger, .filter-select { animation: none !important; transition: none !important; }
}
```

## 6. Structure HTML par vue

### Principe directeur (réduit le risque JS à ~zéro)

1. `section.view` garde son ID et sa classe — le Router ne touche que `hidden` dessus. On ne restructure QUE l'intérieur.
2. `.card` devient glass par défaut → aucune balise card à modifier pour le look ; surcharges par classes modificateurs, jamais par suppression de `.card`.
3. Chaque ID référencé par le JS est une ancre intouchable : on peut l'envelopper, jamais le déplacer hors de son conteneur attendu.
4. Les `style=""` inline que le JS bascule restent ; les `style=""` purement cosmétiques sont laissés ou déplacés en classes utilitaires uniquement si la balise est déjà touchée.

### PIN (`#pin-screen`)

`pin.js` capture `pin-dots`, `pin-keypad`, `pin-error`, `pin-title`, `pin-subtitle`, `pin-forgot-btn` au chargement : tous doivent rester descendants directs de `#pin-screen` (le wrapper `.pin-card` s'intercale sans problème car les const sont par ID) :

```
#pin-screen (id, classe, z-index 100, glass)
└─ .pin-card (NOUVEAU : glass strong, blur 28px, radius 24px, padding 28px, max-width 320px, centré)
   ├─ img.pin-logo (conservé, fond blanc logo)
   ├─ h1#pin-title / p#pin-subtitle / #pin-dots / #pin-error / #pin-keypad
   └─ button#pin-forgot-btn (style inline display conservé — JS le bascule)
```

### Topbar

Classes/IDs inchangés, juste restylé glass. `topbar-title`, `connection-badge`, `theme-toggle`, `theme-icon` intouchables. Remplacer le `background: linear-gradient(180deg, var(--md-primary-container)...)` par `--glass-surface-strong` + blur.

### Dashboard

IDs : `guided-status-card`(+`-title/-body/-action`), `dash-year-label`, `dash-total`, `dash-latest`(+`-title/-open`), `dash-amounts-card`(+`amounts-eye/-icon`, `dash-last-net`, `dash-cumul-net`, `dash-cumul-label`), `.export-card` + `[data-merge]`, `dash-sync-status`, `dash-sync-now`.

Restructure : `.stack-hero` devient la pièce maîtresse glass (cartes 1-2 : `--glass-surface-soft` + blur 16, opacity conservée ; carte 3 : `linear-gradient(135deg, color-mix(in srgb, var(--md-primary-container) 55%, transparent), var(--glass-surface))` + blur). **`#dash-amounts-card` garde `contain: layout style`** et son `display` inline piloté par JS.

### Bulletins

`search-input`, `year-trigger`/`month-trigger` (AppDropdown via `create('year-trigger')` — les IDs servent au `aria-labelledby` du panel, intouchables), `bulletins-list` (+ `bulletins-error` créé APRÈS la liste par JS → ne pas l'envelopper), `merge-bar` (+`merge-count`, `merge-selected-btn`).

**`#merge-bar` : déplacer le `style="position:sticky;bottom:96px"` inline en CSS** :
```css
#merge-bar { position: sticky; bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
```
`.bulletin-item` = tint solide (pas de blur).

### Analyse

`analyse-year-trigger`, `analyse-stats` (display JS), `analyse-max/-min/-avg/-total` + `-sub` (le code fait `getElementById(id + '-sub')` → garder le pattern `<ID>-sub`), `analyse-chart`(+`-hint`), `analyse-table`, `analyse-alerts-card`(+`-alerts`), `analyse-empty`(+`-msg`). Aucune restructure nécessaire — les 4 `.stat-tile` et cartes héritent du glass `.card`.

### Settings

Le plus dense : `settings-accounts-card`, `accounts-list` (rows créés avec inline styles par accounts.js : `display:flex; padding:12px 0; borderBottom: var(--md-outline)` → les conserver tels quels), `add-account-form` (`.card.elevated` → glass strong), `add-account-btn`, `cancel-account-btn`, `submit-account-btn` (textContent changé par JS), `account-email/-password`, `account-form-error`, `toggle-password-btn/-icon`, `imap-host/-port`, `custom-imap-fields`, `app-pwd-link` (display JS — rester un bloc), `app-pwd-url`, `app-pwd-provider`, `.provider-card` (gmail/yahoo/outlook = **couleurs de marque intactes**, IMAP passe en `--glass-surface-strong` + bordure), `dark-mode-switch`, `.accent-swatch` (4 pastilles), `amounts-switch`, `owner-matricule`, `sync-frequency`, `sync-hour`, `save-settings-btn`, `rescan-all-btn`, `push-switch`, `change-pin-btn`, `reset-device-btn`, `about-btn`, + carte offline dynamique (`offline-card` insérée AVANT la carte de `push-switch` via `closest('.card')` — **ne pas retirer `.card` des cartes settings**).

### About

`about-back-btn`, `about-version` (**5 taps → admin**, garder le clic), `about-website-btn` ; `.about-hero` + `.pin-logo` restylés.

### Overlays

`licence-screen`(+`-msg`, `-close-btn`), `admin-screen`(+`admin-login-block`, `admin-panel`, `admin-password`, `admin-login-btn`, `admin-error`, `admin-matricule`, `admin-duration`, `admin-grant-btn`, `admin-licenses`, `admin-close-btn`, `.license-row` etc.) → `.fullscreen-overlay` glass + `.overlay-card` glass strong. `reset-overlay`/`reset-modal`/`confirm` (créés dynamiquement) : restylés via CSS, classes conservées.

### Bottom nav

`.bottom-nav` (id, classe, `data-view` sur `.nav-item` conservés ; `applyAnalyseNav` bascule `style.display` sur `[data-view="analyse"]`). Nouveau : **flottante** :
```css
.bottom-nav { left: 50%; transform: translateX(-50%); bottom: max(10px, env(safe-area-inset-bottom, 0px)); width: calc(100% - 20px); max-width: 460px; border-radius: 24px; }
#app { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
.app-version { bottom: 92px; }
```

## 7. Accessibilité

- Focus visible conservé et renforcé sur glass (`outline: 2px solid var(--md-primary); outline-offset: 2px` + anneau inputs)
- `.bg-scene` en `aria-hidden="true"` et `pointer-events: none`
- Contrastes vérifiés : on-surface sur `--glass-surface` ≈ 15:1 (clair) / 14:1 (sombre) ; eyebrow primaire ≥ 4.5:1
- `prefers-reduced-motion` : règle étendue (§5)
- Touch targets ≥ 44px (nav, icon-btn, pin-key déjà 72px)
- Texte français sobre conservé (« Mettre à jour », « bulletins », « recherche »)

## 8. Phases d'implémentation

| Phase | Contenu | Risque | Critère de validation |
|---|---|---|---|
| **0. Préparation** | Build baseline (`node build.mjs`) ; screenshots (4 accents × 2 thèmes × 3 vues) ; **script d'audit ID** : extrait tous les `getElementById('…')` des 15 JS + `create('…')` dropdown + `closest('.card')` → assert chaque ID existe dans `index.html` | Faible | Audit = 0 manquant ; build OK ; screenshots archivés |
| **1. Tokens + fond** | §3 complet : tokens glass, 8 blobs accent/thème, `.bg-scene` + 3 blobs, `body { background: var(--bg-base) }`, `#app z-index:1`, meta theme-color, extension reduced-motion | Moyen | 8 combos rendent correctement ; blobs dérivent ; reduced-motion OFF ; aucun changement visuel des surfaces existantes |
| **2. Chrome** | Topbar glass, nav flottante glass + safe-area, `#app` padding 96px, `.app-version` 92px, PIN glass (`#pin-screen` + `.pin-card`) | Moyen | PIN setup/unlock/change fonctionnent ; nav flotte avec safe-area ; nav-analyse hide/show ; badge offline ; banner offline au-dessus du topbar |
| **3. Vues une à une** | Dashboard → Bulletins → Analyse → Settings → About → Overlays. **Après CHAQUE vue : audit ID + test matrix** | **Élevé** | Matrice par vue 100 % verte avant de passer à la suivante |
| **4. Animations** | §5 complet : keyframes + classes + extension reduced-motion | Faible-Moyen | Router re-joue `view-enter` à chaque navigation ; merge-bar, dropdown, dots, blobs animent ; reduced-motion respecté |
| **5. Polish + a11y** | Focus rings sur glass, `aria-hidden` sur `.bg-scene`, contrastes vérifiés, touch targets ≥44px, scrollbars dropdown, HTML validator | Faible | Lighthouse/axe ≥ 90 ; focus visible partout ; contrast checker AA |
| **6. Build + SW + prod** | Bump `?v=` dans `index.html` **et** `sworker.js` (APP_SHELL) **+ `CACHE_NAME` v22→v23** ; `node build.mjs` ; vérifier les hashs dist ; `backend/scripts/deploy-ftps.py` ; smoke test production | Moyen | Hashs identiques source/dist ; smoke test complet en prod ; rollback = redéployer le dist précédent |

### Test matrix par vue

- **PIN** : setup / unlock / change / cooldown
- **Sync** : bouton + spinner + statut
- **Eye** : masquer / voir
- **Merge** : ≥2 sélections + barre
- **Dropdowns** : clavier + esc
- **Provider switch** : gmail/yahoo/outlook/imap
- **Password toggle** : voir/masquer
- **Save settings** : persistance
- **Rescan** : déclenchement
- **Admin** : 5 taps
- **Licence** : affichage
- **Reset** : confirmation
- **Offline banner** : affichage

## 9. Critères de validation

- Audit d'ID : 0 ID manquant après chaque vue
- 8 combos accent×thème rendent correctement
- Test matrix 100 % verte
- Lighthouse/axe ≥ 90, contrastes AA
- Perf : pas de jank scroll sur appareil réel (sinon kill-switch `--glass-blur`)
- Build + hashs + smoke test prod

## 10. Risques & mitigations

| # | Risque | Gravité | Parade |
|---|---|---|---|
| 1 | `pin.js:14-19` capture 6 éléments au parse — toute restructure qui les déplace casse le PIN silencieusement | Critique | Garder les IDs, wrapper `.pin-card` intercalé OK (capture par ID) |
| 2 | `settings.js:125` `pushSwitch.closest('.card')` + insertion `offline-card` | Critique | Ne JAMAIS retirer `.card` des cartes settings ; garder `push-switch` dans une carte |
| 3 | `merge-bar` inline `position:sticky;bottom:96px` — un `transform` animé + glass | Moyen | Déplacer en CSS (valeurs identiques) ; animation en opacity/translateY seulement |
| 4 | `dash-amounts-card` : `contain: layout style` + gradient spécial + JS `style.display='block'` | Moyen | Conserver `contain` ; adapter le gradient en glass via `color-mix` ; ne pas toucher au display |
| 5 | Styles inline cosmétiques qui écraseraient les tokens (margins, `font-weight:700` sur `dash-latest-title`, `#about-back-btn`, `licence-msg`, `.admin-header h2`, provider cards marques) | Faible | Laisser les marges (inertes pour le glass) ; ne pas glass-ifier les provider cards marques ; `#app-pwd-link` reste un bloc info |
| 6 | Carte danger `style="border-color:var(--danger,#c0392b)"` — `--danger` n'existe pas dans `:root` (fallback #c0392b) | Faible | Définir `--danger: #c0392b` dans `:root` (correction token propre) |
| 7 | `offline-cache-banner` créé par JS avec styles inline `position:sticky;top:0;z-index:60` (au-dessus du topbar) | Moyen | Le laisser solide (alerte temporaire, contraste) ; override CSS `!important` si glass souhaité |
| 8 | `stack-hero` : `.stack-card` absolus `inset:0`, opacity 0.55/0.8 — le blur sur la carte 3 floutera les cartes 1-2 derrière (effet recherché) | Faible | Z-index naturel par DOM order (3 en dernier) ; blobs 1-2 en `--glass-surface-soft` |
| 9 | `bulletins-list` + `bulletins-error` créé APRÈS la liste (`insertBefore(listEl, listEl.nextSibling)`) | Moyen | Ne pas envelopper la liste dans un conteneur overflow (casserait l'insertion) ; listes = tint solide |
| 10 | `applyAnalyseNav` bascule `display` du nav-item analyse | Faible | CSS nav glass compatible `display:none` |
| 11 | `toast` bottom:96px et `app-version` bottom:80px vs nav flottante (~78px de haut avec marge) | Faible | `app-version → bottom:92px` ; toast 96px OK |
| 12 | `.hidden` = `display:none !important` vs animations `both` | Faible | Compatible (display gagne) — vérifié |
| 13 | Perf blur multiples sur Android bas de gamme (Capacitor WebView) | Moyen | Listes sans blur + `@supports` + kill-switch `--glass-blur:0` si nécessaire |
| 14 | `meta theme-color` hardcodé `#10201C` dans `settings.js:10-14` | Faible | Mettre à jour les 2 hex (light/dark) vers la base du dégradé — JS modifié, changement mineur autorisé |
| 15 | Worktree non commité (backend modifié) | Moyen | Branche isolée `feature/refonte-glass`, commit uniquement `frontend/`, jamais de commit global |

## 11. Hors-périmètre (YAGNI)

- Pas de pagination API (déjà identifiée, hors refonte)
- Pas de typo supplémentaire (CSP font-src bloqué à fonts.gstatic.com)
- Pas de librairie externe (CSP script-src 'self')
- Pas de parallaxe au scroll, pas d'intersection-observer, pas de stagger JS
- Pas de refonte du logo ni des icônes, pas de 3D, pas de dark-mode horaire
- Pas de modification de la logique JS (sauf meta theme-color + kill-switch éventuel)

## 12. Procédure build / déploiement

1. Modifier `frontend/` (jamais `dist/` à la main)
2. Bump `?v=` dans `frontend/index.html` ET `frontend/sworker.js` (APP_SHELL) + `CACHE_NAME` v22→v23
3. `node frontend/build.mjs` (régénère dist + hashs)
4. `python3 backend/scripts/deploy-ftps.py`
5. Smoke test sur www.nka-bulletin.glocal-innov.com
6. Rollback : redéployer le dist précédent (jamais de déploiement le vendredi)