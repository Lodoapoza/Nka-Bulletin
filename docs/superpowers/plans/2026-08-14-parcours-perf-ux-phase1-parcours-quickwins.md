# Parcours guidé et quick wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à un nouvel utilisateur une prochaine action évidente et réduire les doublons de démarrage, les refreshs destructifs et les premiers défauts d’accessibilité.

**Architecture:** Ajouter une machine d’états pure `Parcours` et un renderer `Guided` au frontend vanilla existant. Mutualiser l’enregistrement de l’appareil avec un helper single-flight, conserver les handlers actuels et faire évoluer progressivement les états du dashboard, du formulaire de boîte mail et de la liste des bulletins.

**Tech Stack:** JavaScript vanilla/IIFE, IndexedDB existant, Node `node:test` natif, HTML/CSS Material existants, `build.mjs` (Terser/CleanCSS).

## Global Constraints

- Interface publique en français ; employer « Mes bulletins », « Mettre à jour » et « boîte mail », sans jargon « synchronisation »/« messagerie ».
- Minification seule, jamais d’obfuscation.
- Design Material et variables `--md-*` existantes à respecter.
- Aucun scan long automatique après l’ajout d’une boîte mail : proposer « Rechercher mes bulletins ».
- Le flux d’onboarding ouvre le formulaire IMAP existant ; ne pas exposer ni supprimer `Api.loginEmail` pendant cette phase.
- Ne jamais committer le worktree global ; ajouter uniquement les fichiers listés dans chaque tâche.
- Le worktree contient déjà des modifications historiques non commitées ; les conserver intactes hors périmètre.
- Node `>=18` est requis pour `node:test`.
- Toute livraison frontend passe par `npm run build`, le déploiement FTPS existant et une vérification HTTP.

---

### Task 1: Socle de tests et helper single-flight

**Files:**
- Create: `frontend/test/singleflight.test.cjs`
- Create: `frontend/js/singleflight.js`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: une fonction asynchrone `fn(...args)`.
- Produces: `window.singleFlight(fn)` dans le navigateur et `module.exports = { singleFlight }` dans Node.

- [ ] **Step 1: Vérifier l’environnement**

```bash
node --version
git status --short
```

Expected: Node `v18` ou plus récent ; le worktree existant reste inchangé et non stagé.

- [ ] **Step 2: Ajouter le test frontend**

Dans `frontend/package.json`, conserver les scripts actuels et ajouter :

```json
"test": "node --test test/*.test.cjs"
```

Créer `frontend/test/singleflight.test.cjs` :

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { singleFlight } = require('../js/singleflight.js');

test('les appels concurrents partagent une exécution', async () => {
  let executions = 0;
  const run = singleFlight(async (value) => {
    executions += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return value * 2;
  });
  const [a, b] = await Promise.all([run(21), run(99)]);
  assert.equal(a, 42);
  assert.equal(b, 42);
  assert.equal(executions, 1);
});

test('une nouvelle exécution est possible après résolution', async () => {
  let executions = 0;
  const run = singleFlight(async () => ++executions);
  assert.equal(await run(), 1);
  assert.equal(await run(), 2);
});
```

- [ ] **Step 3: Vérifier l’échec puis implémenter**

Run: `cd frontend && node --test test/singleflight.test.cjs`

Expected before implementation: FAIL because `singleflight.js` is absent.

Créer `frontend/js/singleflight.js` avec un export UMD et cette sémantique : la première invocation devient la promesse active, les appels suivants retournent cette même promesse, puis l’état actif est remis à `null` dans `finally`.

- [ ] **Step 4: Vérifier et committer**

```bash
cd frontend && node --test test/singleflight.test.cjs
git add package.json js/singleflight.js test/singleflight.test.cjs
git commit -m "test(frontend): add single-flight helper foundation"
```

Expected: 2 tests PASS.

### Task 2: Machine d’états du parcours

**Files:**
- Create: `frontend/test/parcours.test.cjs`
- Create: `frontend/js/parcours.js`

**Interfaces:**
- `resolveJourneyState({ accountCount, syncStatus, newBulletins, online, hasCachedBulletins })`
- Retour : `{ kind, title, body, action: { id, label } | null }`.

- [ ] **Step 1: Écrire les cas rouges**

Tester les états `no-account`, `ready-to-scan`, `running`, `done-with-results`, `done-empty`, `failed` et `offline-cache`. Chaque cas doit avoir une action et des textes non vides ; aucun texte ne doit contenir « messagerie » ou « synchronisation ».

```bash
cd frontend && node --test test/parcours.test.cjs
```

Expected before implementation: FAIL because `parcours.js` is absent.

- [ ] **Step 2: Implémenter `resolveJourneyState`**

Créer un module UMD. Priorité de résolution : hors ligne avec cache, aucun compte, job `pending/running`, échec, terminé avec nouveaux bulletins, terminé sans résultat, puis compte prêt à rechercher.

Les libellés exacts sont :

```text
no-account       → Connectons votre boîte mail / Connecter ma boîte mail
ready-to-scan    → Votre boîte mail est connectée / Rechercher mes bulletins
running          → Recherche des bulletins en cours / Voir mes bulletins
done-with-results→ N nouveau(x) bulletin(s) trouvé(s) / Voir mes bulletins
done-empty       → Aucun nouveau bulletin / Rechercher à nouveau
failed           → La recherche n’a pas abouti / Réessayer
offline-cache    → Données disponibles hors connexion / Voir mes bulletins
```

- [ ] **Step 3: Vérifier et committer**

```bash
cd frontend && node --test test/parcours.test.cjs
git add js/parcours.js test/parcours.test.cjs
git commit -m "feat(frontend): define guided bulletin journey states"
```

Expected: tous les cas PASS.

### Task 3: Carte guidée du dashboard

**Files:**
- Create: `frontend/js/guided.js`
- Modify: `frontend/index.html`
- Modify: `frontend/js/dashboard.js`
- Modify: `frontend/css/app.css`
- Modify: `frontend/sworker.js`

**Interfaces:**
- `Guided.render(container, state)` met à jour le DOM avec `textContent`.
- `Guided.bind(container, onAction)` installe un seul listener de clic.

- [ ] **Step 1: Ajouter le conteneur accessible**

Ajouter avant les statistiques du dashboard :

```html
<section id="guided-status-card" class="card guided-card hidden" aria-live="polite" aria-busy="false">
  <div class="eyebrow" id="guided-status-title"></div>
  <p class="hint" id="guided-status-body"></p>
  <button class="btn btn-primary" id="guided-status-action" type="button"></button>
</section>
```

Conserver `dash-sync-status` et `dash-sync-now` pour la compatibilité des handlers existants.

- [ ] **Step 2: Implémenter le renderer**

`guided.js` doit afficher/masquer la carte, renseigner titre/corps/action et publier uniquement les événements d’action `connect-account`, `start-sync`, `view-bulletins`, `retry-sync`. Aucun HTML provenant du serveur ne doit être injecté.

- [ ] **Step 3: Brancher les actions**

Dans `dashboard.js`, `connect-account` appelle `Settings.openAccountForm()`, `start-sync`/`retry-sync` réutilisent le handler existant avec le garde `disabled`, et `view-bulletins` appelle `Router.goTo('bulletins')`.

- [ ] **Step 4: Ajouter le style responsive**

```css
.guided-card { display: grid; gap: 8px; }
.guided-card.hidden { display: none; }
.guided-card .btn { justify-self: start; }
@media (max-width: 360px) {
  .guided-card .btn { width: 100%; }
}
```

Utiliser les tokens Material existants pour couleurs et focus.

- [ ] **Step 5: Charger et vérifier**

Ajouter `parcours.js` puis `guided.js` avant `dashboard.js` dans `index.html` et dans `APP_SHELL` de `sworker.js`.

```bash
cd frontend
node --check js/parcours.js && node --check js/guided.js && node --check js/dashboard.js
npm run build
grep -q "guided-status-card" dist/index.html
git add index.html js/guided.js js/dashboard.js css/app.css sworker.js
git commit -m "feat(frontend): add guided dashboard onboarding card"
```

### Task 4: Formulaire et proposition de première recherche

**Files:**
- Modify: `frontend/js/accounts.js`
- Modify: `frontend/js/settings.js`
- Modify: `frontend/index.html`

**Interfaces:**
- `Accounts.openForm()` ouvre le formulaire et focalise `#account-email`.
- `Settings.openAccountForm()` ouvre la vue Réglages puis délègue à `Accounts.openForm()`.
- Succès : événement `nka-account-added` avec `{ account }` dans `event.detail`.

- [ ] **Step 1: Extraire `openForm`**

Réutiliser la logique actuelle de `#add-account-btn`, exposer `openForm` dans le retour de `Accounts`, puis faire appeler le même helper par le bouton existant et le CTA dashboard.

- [ ] **Step 2: Ajouter le focus et les labels**

Ajouter `for`/`id` sur email, mot de passe, hôte et port ; ajouter `autocomplete="email"` et `autocomplete="current-password"`. `Settings.openAccountForm()` fait défiler `#add-account-form` et appelle `focus()` après affichage.

- [ ] **Step 3: Ajouter les erreurs inline**

Créer `#account-form-error` avec `role="alert"`. Les validations « adresse invalide », « mot de passe requis » et « serveur requis » renseignent cet élément avant le toast éventuel ; une soumission valide l’efface.

- [ ] **Step 4: Publier le succès sans lancer de scan**

Après `Api.addAccount` : fermer le formulaire, rafraîchir les comptes, puis exécuter :

```js
window.dispatchEvent(new CustomEvent('nka-account-added', { detail: { account: result } }));
```

Ne pas appeler `Api.runSync()` dans `accounts.js`.

- [ ] **Step 5: Vérifier**

```bash
cd frontend && node --check js/accounts.js && node --check js/settings.js && npm run build
```

Manual: le CTA ouvre Réglages et focalise l’email ; une connexion réussie affiche la proposition « Rechercher mes bulletins » ; DevTools ne montre aucun `POST /sync/run` avant le clic.

```bash
git add js/accounts.js js/settings.js index.html
git commit -m "feat(frontend): guide mailbox connection and explicit first scan"
```

### Task 5: Boot single-flight et keep-list bulletins

**Files:**
- Modify: `frontend/js/client.js`
- Modify: `frontend/js/app.js`
- Modify: `frontend/js/dashboard.js`
- Modify: `frontend/js/bulletins.js`

- [ ] **Step 1: Mémoïser `ensureDevice`**

Ajouter `ensureDevicePromise = null` dans la closure `Api`. Si `token` existe, retourner immédiatement ; sinon partager toute la requête d’enregistrement et remettre la promesse à `null` dans `finally`.

- [ ] **Step 2: Supprimer le poller local du boot**

Dans `app.js`, supprimer la boucle `for (let i = 0; i < 40; i++)` et appeler le poller commun uniquement si un compte existe et qu’aucun job `pending/running` n’est déjà actif.

- [ ] **Step 3: Conserver les lignes pendant le refresh**

Dans `bulletins.js`, mettre `aria-busy="true"` sur `#bulletins-list` et n’insérer le loading que si aucune ligne n’est rendue. En erreur réseau, conserver `cache` et afficher l’erreur sous la liste plutôt que remplacer une liste valide par un écran vide. Conserver aussi `availableYearsCache` en mémoire : le premier chargement sans filtre l’alimente depuis les résultats et le cache local ; les changements de filtre le réutilisent sans second `GET /bulletins?q=...`. Invalider ce cache après un nouveau compte ou une synchronisation terminée ; la Phase 3 le remplacera par `years` fourni par l’API.

- [ ] **Step 4: Mesurer**

```bash
cd frontend
npm test
npm run build
node --check js/client.js && node --check js/app.js && node --check js/dashboard.js && node --check js/bulletins.js
```

Manual avec stockage local vide : exactement un `POST /auth/register-device` sur 10 secondes ; aucune boucle de poller locale concurrente ; les anciens bulletins restent visibles pendant le refresh.

```bash
git add js/client.js js/app.js js/dashboard.js js/bulletins.js
git commit -m "perf(frontend): coalesce boot requests and preserve bulletin list"
```

### Task 6: Accessibilité de base et gate Phase 1

**Files:**
- Modify: `frontend/js/confirm.js`
- Modify: `frontend/js/dropdown.js`
- Modify: `frontend/index.html`
- Modify: `frontend/css/app.css`

- [ ] **Step 1: Labels et annonces**

Associer tous les `label` restants à un `id`, donner `aria-label="Rechercher un bulletin"` au champ de recherche, `aria-live="polite"` aux statuts et `role="alert"` aux erreurs bloquantes.

- [ ] **Step 2: Focus modal**

Dans `confirm.js`, mémoriser le focus avant ouverture, focaliser le premier bouton, enfermer Tab/Shift+Tab entre les contrôles, fermer sur Escape et restituer le focus après fermeture.

- [ ] **Step 3: Dropdown clavier**

Ajouter `role="listbox"`/`role="option"`, `aria-selected` et gérer `ArrowUp`, `ArrowDown`, `Home`, `End`, `Enter`, `Escape` sans casser le clic actuel.

- [ ] **Step 4: Vérifier les gates**

```bash
cd frontend
npm test
npm run build
for file in js/*.js; do node --check "$file"; done
git diff --check
```

Manual: premier boot sans compte, connexion, proposition de scan, erreur réseau, Tab dans modal/dropdown et largeurs 320/360/375/480 px.

- [ ] **Step 5: Commit de gate**

Commiter uniquement les fichiers Phase 1 encore non committés ; ne jamais ajouter `.slim/`, `frontend/dist/`, `backend/tmp/` ou les modifications backend historiques à ce commit.
