# Liste des bulletins, offline et qualité UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la consultation des bulletins scalable, cache-first et compréhensible, puis terminer l’accessibilité, l’analyse et le responsive.

**Architecture:** Faire évoluer l’API bulletins vers une projection paginée avec curseur stable, migrer tous les appelants dans un même lot rétrocompatible, séparer les métadonnées IndexedDB des Blobs PDF et rendre la liste incrémentale/virtualisée. Les audits accessibilité, contraste et responsive deviennent des gates de livraison.

**Tech Stack:** Express/better-sqlite3, Node `node:test`, IndexedDB versionnée, JavaScript vanilla/IIFE, CSS Material.

## Global Constraints

- Dépend de la Phase 1 (états guidés, tests, keep-list) et de la Phase 2 (poller unique et état de job).
- Aucun appelant ne doit continuer à supposer que `Api.getBulletins()` renvoie directement un tableau après migration.
- Les PDF déjà présents localement sont servis en priorité lorsque le cache est valide ; le réseau reste disponible via une action explicite de rechargement.
- Aucun champ sensible ou chemin serveur (`filepath`, `message_hash`) ne doit être envoyé dans la projection de liste.
- Les filtres année/mois/recherche, export, cache offline et préparation offline doivent rester fonctionnels.
- Contraste minimum cible : 4,5:1 pour le texte courant ; mesurer avant de changer les tokens ambre.
- Interface française, Material existant, minification seule, worktree isolé.

---

### Task 1: Projection et curseur de l’API bulletins

**Files:**
- Create: `backend/src/bulletinProjection.js`
- Create: `backend/test/bulletinProjection.test.js`
- Modify: `backend/src/routes/bulletins.js`

**Interfaces:**
- `projectBulletin(row) -> BulletinSummary`.
- `encodeCursor({ year, month, receivedAt, id }) -> string`.
- `decodeCursor(value) -> object | null`.
- `GET /api/bulletins?limit=50&cursor=... -> { items, nextCursor, years, total }`.

- [ ] **Step 1: Définir la projection**

Le résumé contient exactement : `id`, `year`, `month`, `type`, `period_label`, `filename`, `nom`, `matricule`, `net_amount`, `received_at`, `account_email`, `provider`, `cached`. Il ne contient ni `filepath`, ni `message_hash`, ni `device_id`.

- [ ] **Step 2: Écrire les tests rouges**

Tester la suppression des champs internes, le tri `year DESC, month DESC, received_at DESC, id DESC`, la borne `limit` entre 1 et 100 et la stabilité du curseur lorsqu’une ligne plus récente est insérée.

```js
test('projectBulletin retire filepath message_hash et device_id', () => {
  const result = projectBulletin({ id: 4, filepath: '/secret/a.pdf', message_hash: 'x', device_id: 'd', year: 2026, month: 8 });
  assert.equal(result.filepath, undefined);
  assert.equal(result.message_hash, undefined);
  assert.equal(result.device_id, undefined);
  assert.equal(result.id, 4);
});
```

- [ ] **Step 3: Implémenter le curseur stable**

Encoder en base64url un JSON compact `{ y, m, r, i }`. La condition SQL suivante reprend la comparaison lexicographique de l’ordre avec `id` comme dernier tie-breaker.

- [ ] **Step 4: Ajouter le nouvel objet de réponse**

Quand `limit` ou `cursor` est présent, la route renvoie `{ items, nextCursor, years, total }`. Pour la migration, le client normalisera aussi l’ancien tableau ; aucun champ de projection ne doit exposer le chemin de stockage.

- [ ] **Step 5: Vérifier et committer**

```bash
cd backend
node --test test/bulletinProjection.test.js
node --check src/bulletinProjection.js && node --check src/routes/bulletins.js
git add src/bulletinProjection.js test/bulletinProjection.test.js src/routes/bulletins.js
git commit -m "feat(backend): project and paginate bulletin summaries"
```

### Task 2: Migrer les clients vers les pages

**Files:**
- Modify: `frontend/js/client.js`
- Modify: `frontend/js/bulletins.js`
- Modify: `frontend/js/dashboard.js`
- Modify: `frontend/js/settings.js`

**Interfaces:**
- `Api.getBulletins(params) -> { items, nextCursor, years, total }`.
- `Bulletins.refresh({ append = false } = {})`.
- `Bulletins.loadMore()`.

- [ ] **Step 1: Normaliser `Api.getBulletins`**

Remplacer le retour direct par :

```js
getBulletins: async (params = {}) => {
  const body = await request('/bulletins?' + new URLSearchParams(params).toString());
  if (Array.isArray(body)) return { items: body, nextCursor: null, years: [], total: body.length };
  return body;
},
```

- [ ] **Step 2: Ajouter le jeton anti-réponse-stale**

Dans `bulletins.js`, incrémenter `requestSequence` à chaque nouveau filtre. Une réponse ne modifie le DOM que si elle porte la séquence courante.

- [ ] **Step 3: Ajouter « Charger plus »**

Conserver `nextCursor`, append les `items` suivants sans recréer les lignes existantes et afficher le bouton uniquement si le curseur existe. Une nouvelle recherche réinitialise la page et la sélection invisible.

- [ ] **Step 4: Migrer export et préparation offline**

Tous les usages de `getBulletins` consomment `response.items`. `Settings.prepareOffline` boucle sur les curseurs jusqu’à `null` ; export par année et dernier nombre de mois utilisent la même projection.

- [ ] **Step 5: Vérifier**

```bash
cd frontend
node --check js/client.js && node --check js/bulletins.js && node --check js/dashboard.js && node --check js/settings.js
npm test
npm run build
```

Manual: année, mois, recherche, « Charger plus », export, préparation offline, réponse vide et réponse legacy.

```bash
git add js/client.js js/bulletins.js js/dashboard.js js/settings.js
git commit -m "feat(frontend): consume paginated bulletin summaries"
```

### Task 3: Cache IndexedDB des métadonnées et PDF cache-first

**Files:**
- Create: `frontend/js/cache-planner.js`
- Create: `frontend/test/cache-planner.test.cjs`
- Modify: `frontend/js/client.js`

**Interfaces:**
- `planCacheMigration(records) -> { metadata, blobs }`.
- `OfflineCache.listBulletinMeta() -> Promise<Meta[]>`.
- `OfflineCache.getPdf(id) -> Promise<{ blob, filename, cachedAt } | undefined>`.

- [ ] **Step 1: Écrire les tests purs**

Tester qu’un enregistrement PDF existant produit une metadata sans Blob, qu’une migration répétée ne duplique pas l’ID et qu’un ancien enregistrement sans metadata reste lisible avec `filename` et `key`.

- [ ] **Step 2: Migrer IndexedDB de version 1 à 2**

Dans `client.js`, passer `DB_VERSION` à `2`, créer `pdf_meta` avec `keyPath: 'key'` dans `onupgradeneeded` et copier `key`, `filename`, `meta`, `cachedAt` depuis `pdf` une seule fois. Ne pas supprimer `pdf`.

- [ ] **Step 3: Écrire les deux stores**

`setPdf` écrit le Blob dans `pdf` et la fiche dans `pdf_meta`. `listPdfRecords` lit `pdf_meta`; le fallback `pdf` reste disponible pendant la migration.

- [ ] **Step 4: Rendre l’ouverture cache-first**

Dans `fetchBulletinBlob`, chercher le PDF local avant le réseau lorsque le résumé indique `cached`. Retourner immédiatement un Object URL ; réserver le téléchargement réseau à une action explicite de rechargement ou à l’absence de cache.

- [ ] **Step 5: Vérifier et committer**

```bash
cd frontend
node --test test/cache-planner.test.cjs
node --check js/client.js && node --check js/cache-planner.js
npm run build
git add js/client.js js/cache-planner.js test/cache-planner.test.cjs
git commit -m "perf(frontend): separate bulletin metadata from cached PDFs"
```

Manual DevTools : ouvrir deux fois le même bulletin en ligne ; la deuxième ouverture ne doit pas faire de requête download et `listBulletins` ne doit pas lire les Blobs.

### Task 4: Rendu incrémental et états de liste

**Files:**
- Create: `frontend/js/virtual-list.js`
- Create: `frontend/test/virtual-list.test.cjs`
- Modify: `frontend/js/bulletins.js`
- Modify: `frontend/index.html`
- Modify: `frontend/css/app.css`

**Interfaces:**
- `getVisibleRange({ itemCount, scrollTop, viewportHeight, rowHeight, overscan }) -> { start, end }`.
- `Bulletins.renderState(kind, payload)` pour `no-account`, `loading`, `empty`, `no-filter-result`, `error`, `offline`.

- [ ] **Step 1: Tester la fenêtre de rendu**

Pour 500 éléments, hauteur 72 px et viewport 720 px, vérifier une fenêtre de 10 lignes plus l’overscan ; le scroll modifie `start/end` sans modifier `itemCount`.

- [ ] **Step 2: Implémenter le module pur**

`virtual-list.js` reste UMD, sans accès DOM. La sélection des bulletins reste dans le `Set` d’IDs existant, indépendamment du DOM virtualisé.

- [ ] **Step 3: Distinguer les états**

Utiliser les actions exactes :

```text
aucun compte   → Connecter ma boîte mail
aucun bulletin → Rechercher à nouveau
filtres vides  → Effacer les filtres
erreur réseau  → Réessayer
hors ligne     → Voir les données disponibles hors connexion
```

Une erreur réseau ne doit jamais remplacer une liste valide par une liste vide.

- [ ] **Step 4: Clarifier les actions PDF**

Chaque bouton reçoit `aria-label="Ouvrir le PDF"`; l’indicateur cache reçoit `aria-label="Disponible hors connexion"`. Après un filtre, retirer du `Set` les IDs qui ne sont plus visibles si la sélection visible est utilisée.

- [ ] **Step 5: Vérifier responsive et committer**

Tester 320, 360, 375 et 480 px avec email et filename longs ; aucun débordement, bouton « Charger plus » accessible et action PDF compréhensible sans l’icône.

```bash
cd frontend
node --test test/virtual-list.test.cjs
node --check js/bulletins.js && node --check js/virtual-list.js
npm run build
git add js/bulletins.js js/virtual-list.js test/virtual-list.test.cjs index.html css/app.css
git commit -m "feat(frontend): add scalable bulletin list states and rendering"
```

### Task 5: Analyse activable et états nettoyés

**Files:**
- Modify: `frontend/js/analyse.js`
- Modify: `frontend/js/settings.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Rendre l’analyse découvrable**

Quand `extract_amounts` est désactivé, afficher une carte expliquant l’option et un bouton `Activer l’analyse` qui ouvre le réglage correspondant.

- [ ] **Step 2: Afficher le retraitement**

Après activation : « Analyse en cours », bouton désactivé pendant `reprocessAmounts`, succès ou erreur inline, et garde empêchant deux retraitements concurrents.

- [ ] **Step 3: Nettoyer les données périmées**

Quand une année sans données est sélectionnée, vider explicitement statistiques, graphique, alertes et tableau avant l’état vide.

- [ ] **Step 4: Afficher les variations faibles**

Ne plus transformer une variation `<=10%` en `=` ; afficher sa valeur réelle, par exemple `+5,2 %`, avec une classe visuelle « variation-faible » si nécessaire.

- [ ] **Step 5: Vérifier et committer**

```bash
cd frontend
node --check js/analyse.js && node --check js/settings.js
npm run build
git add js/analyse.js js/settings.js index.html
git commit -m "feat(frontend): make salary analysis discoverable and consistent"
```

### Task 6: Accessibilité, contraste et gate Phase 3

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/css/app.css`
- Modify: `frontend/js/confirm.js`
- Modify: `frontend/js/dropdown.js`
- Modify: `frontend/js/bulletins.js`
- Modify: `frontend/js/analyse.js`

- [ ] **Step 1: Vérifier les contrôles**

Repérer les `label` sans `for`, boutons composés uniquement d’un SVG et messages dynamiques sans `aria-live`, puis corriger chaque occurrence avec un nom accessible.

- [ ] **Step 2: Mesurer les contrastes**

Calculer le ratio WCAG pour quatre accents et deux thèmes. Si le token ambre est sous 4,5:1 pour du texte courant, choisir une valeur plus sombre et vérifier boutons, badges, eyebrows et focus.

- [ ] **Step 3: Tester clavier et modales**

Vérifier Tab, Shift+Tab, Escape, Enter, Home/End et flèches dans dropdowns et modales, ainsi que la restitution du focus.

- [ ] **Step 4: Tester le build et les tailles**

```bash
cd frontend
npm test
npm run build
for file in js/*.js; do node --check "$file"; done
```

Puis vérifier en navigateur visible : 320/360/375/480 px, zoom 200 %, clavier ouvert, mode sombre/ambre, liste 400+ éléments et ouverture PDF cache-first.

- [ ] **Step 5: Déployer et mesurer**

Déployer via FTPS après validation du build, vérifier HTTP 200, API paginée, contenu des scripts, parcours clavier et absence de scroll horizontal. Documenter payload moyen, temps de premier rendu et taux de hit cache PDF.

```bash
git status --short
git diff --check
git log --oneline -10
```

Commiter uniquement les fichiers Phase 3 listés.
