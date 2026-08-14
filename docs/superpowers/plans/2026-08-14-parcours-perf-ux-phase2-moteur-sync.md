# Moteur de synchronisation performant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir au plus un job logique par appareil, traiter les périodes récentes avant l’historique, reprendre un scan interrompu et réduire le polling sans perdre la progression utilisateur.

**Architecture:** Extraire la gestion des jobs dans `syncJobs.js`, la planification des tranches dans `chunkPlanner.js` et conserver SQLite comme source de vérité du curseur. Le worker réclame les jobs de façon atomique ; le frontend utilise un seul poller avec backoff et transmet la progression à la carte guidée.

**Tech Stack:** Node.js CommonJS, Express, better-sqlite3, node-cron, worker Passenger mono-instance, `node:test`, JavaScript vanilla/IIFE.

## Global Constraints

- Dépend de la Phase 1 : helper single-flight, carte guidée, tests `node:test` et conservation de la liste doivent être livrés avant l’intégration frontend Phase 2.
- Une seule requête `pending/running` par appareil ; aucune concurrence de scans.
- Une demande full scan pendant un incrémental pose `full_scan_after_current=1` et enchaîne dans le même job logique.
- Un full scan traite d’abord 24 mois, puis les tranches historiques ; le curseur est persistant.
- Les migrations SQLite sont idempotentes et précédées d’un backup de production.
- Le worker reste mono-instance sous Passenger ; aucun `nohup node worker.js` manuel.
- Interface publique en français, sans « messagerie »/« synchronisation » ; les champs internes peuvent garder les noms techniques nécessaires.
- Ne jamais committer le worktree global ni les secrets.

---

### Task 1: Planificateur de tranches récent-first

**Files:**
- Create: `backend/test/chunkPlanner.test.js`
- Create: `backend/src/chunkPlanner.js`
- Modify: `backend/package.json`

**Interfaces:**
- `planChunks({ oldestDate, newestDate, recentWindowMonths = 24, cursor = null })`
- Retour : `{ phase: 'recent'|'history', chunks: [{ from, to }], nextCursor }`.

- [ ] **Step 1: Vérifier Node et ajouter le runner**

```bash
node --version
cd backend
node --test --version
```

Expected: Node `>=18`. Ajouter dans `backend/package.json` :

```json
"test": "node --test test/*.test.js"
```

- [ ] **Step 2: Écrire les tests rouges**

Les tests doivent prouver que la première tranche appartient aux 24 derniers mois, que les tranches récentes sont décroissantes et qu’un curseur `phase='history', from='2022-01-01'` ne recrée pas les tranches déjà parcourues.

```bash
cd backend && node --test test/chunkPlanner.test.js
```

Expected before implementation: FAIL because `chunkPlanner.js` is absent.

- [ ] **Step 3: Implémenter le planner pur**

Créer un module CommonJS sans accès DB ni heure locale implicite. Chaque tranche est `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`; la phase récente commence à `newestDate - 24 mois + 1 jour`, puis la phase historique continue de la limite ancienne vers `oldestDate` dans l’ordre récent→ancien.

- [ ] **Step 4: Vérifier et committer**

```bash
cd backend
node --test test/chunkPlanner.test.js
node --check src/chunkPlanner.js
git add package.json src/chunkPlanner.js test/chunkPlanner.test.js
git commit -m "test(backend): add resumable recent-first chunk planner"
```

### Task 2: Gestionnaire de jobs et migration SQLite

**Files:**
- Create: `backend/src/syncJobs.js`
- Create: `backend/test/syncJobs.test.js`
- Modify: `backend/src/db.js`

**Interfaces:**
- `requestSync(deviceId, { fullScan }) -> { id, status, reused, fullScan }`.
- `claimNext() -> row | null`.
- `updateProgress(id, progress) -> boolean`.
- `completeJob(id, result) -> boolean`.
- `requeueAfterRestart() -> number`.

- [ ] **Step 1: Ajouter les migrations idempotentes**

Dans `db.js`, utiliser le pattern `hasColumn` existant et ajouter à `sync_requests` :

```sql
phase TEXT DEFAULT 'incremental',
cursor TEXT,
full_scan_after_current INTEGER DEFAULT 0,
recent_window_months INTEGER DEFAULT 24
```

Ajouter l’index `idx_sync_requests_device_status` sur `(device_id, status)`. Une deuxième initialisation de DB doit produire zéro erreur et ne supprimer aucune ligne.

- [ ] **Step 2: Écrire les tests de concurrence**

Utiliser une DB temporaire configurée avant le `require('../src/db')` et vérifier :

```text
2 demandes pending pour un device -> 1 ligne, reused=true
full_scan sur pending -> même ligne convertie
full_scan sur running incremental -> full_scan_after_current=1, aucune nouvelle ligne
2 claims concurrents -> 1 seul gagnant
completeJob deux fois -> la seconde ne modifie rien
requeueAfterRestart -> running devient pending sans perdre cursor/progress
```

- [ ] **Step 3: Implémenter `requestSync` transactionnel**

Dans une transaction : rechercher une ligne active du device ; réutiliser un full scan ; convertir un pending incremental en full scan ; poser `full_scan_after_current=1` sur un running incremental ; créer une ligne seulement si aucune ligne active n’existe.

- [ ] **Step 4: Implémenter claim, progression et reprise**

`claimNext` fait un `UPDATE ... WHERE id=? AND status='pending'` conditionnel ; `updateProgress` sérialise l’objet progression ; `requeueAfterRestart` repasse les jobs running en pending en conservant toutes les colonnes de curseur et de compteur.

- [ ] **Step 5: Vérifier et committer**

```bash
cd backend
node --test test/syncJobs.test.js
node --check src/syncJobs.js && node --check src/db.js
git add src/db.js src/syncJobs.js test/syncJobs.test.js
git commit -m "feat(backend): make sync jobs single-flight and resumable"
```

### Task 3: Routes, scheduler et worker

**Files:**
- Create: `backend/test/syncRoutes.test.js`
- Modify: `backend/src/routes/sync.js`
- Modify: `backend/src/scheduler.js`
- Modify: `backend/worker.js`

**Interfaces:**
- `POST /api/sync/run` renvoie `requestId`, `reused`, `full_scan`.
- `GET /api/sync/status` renvoie `phase`, `cursor`, `progress`, `new_bulletins`, `error_message`.

- [ ] **Step 1: Brancher `/sync/run` sur `requestSync`**

Supprimer l’annulation du pending et l’`INSERT` direct. Valider `full_scan` comme booléen, appeler `requestSync(req.deviceId, { fullScan })`, puis renvoyer :

```json
{"ok":true,"queued":true,"requestId":123,"reused":true,"full_scan":false}
```

- [ ] **Step 2: Enrichir `/sync/status` sans casser les clients**

Retourner `{ status: 'none' }` sans job ; sinon conserver les champs actuels et ajouter les champs de progression. Décoder le JSON de progression côté route avec un fallback sûr si la colonne est vide.

- [ ] **Step 3: Dédupliquer le scheduler**

Dans `scheduler.js`, remplacer `db.prepare("INSERT INTO sync_requests...")` par `requestSync(device.id, { fullScan: false })`. Le log doit indiquer si la demande a été réutilisée.

- [ ] **Step 4: Faire utiliser `syncJobs` au worker**

Avant la boucle, appeler `requeueAfterRestart()`. Dans `processOne`, appeler `claimNext()`, charger la ligne complète, transmettre son `phase/cursor/full_scan` au service, puis utiliser `updateProgress` et `completeJob` avec garde `status='running'`.

- [ ] **Step 5: Tester les routes**

Le test Express/DB temporaire doit faire deux POST `/sync/run` et vérifier le même `requestId`, puis envoyer un full scan pendant un incremental et vérifier le flag sans seconde ligne.

```bash
cd backend
node --test test/syncJobs.test.js test/syncRoutes.test.js
node --check src/routes/sync.js && node --check src/scheduler.js && node --check ../worker.js
git add src/routes/sync.js src/scheduler.js worker.js test/syncRoutes.test.js
git commit -m "feat(backend): deduplicate sync requests across routes and scheduler"
```

### Task 4: SyncService avec progression et reprise

**Files:**
- Create: `backend/test/syncServiceProgress.test.js`
- Modify: `backend/src/syncService.js`
- Modify: `backend/worker.js`
- Modify: `backend/src/imapService.js` uniquement si l’injection l’exige

- [ ] **Step 1: Injecter le fetch IMAP**

Extraire la dépendance `fetchPayslipsSince` dans la fonction de traitement d’une tranche afin que le test la remplace par un stub qui enregistre les périodes demandées.

- [ ] **Step 2: Tester l’ordre et le curseur**

Le test doit vérifier : récent avant historique ; reprise à partir du curseur sans rappeler les tranches terminées ; appel à `updateProgress` après chaque tranche ; curseur inchangé si la tranche échoue.

- [ ] **Step 3: Implémenter la boucle de job**

Pour chaque tranche, charger le curseur, récupérer les pièces jointes, importer/dédupliquer, cumuler `new_bulletins`, écrire le curseur suivant puis changer de phase lorsque la fenêtre récente est terminée. Si `full_scan_after_current=1`, basculer vers la phase récente après la tranche courante.

- [ ] **Step 4: Instrumenter les timings**

Mesurer avec `performance.now()` les durées IMAP, analyse PDF et import DB ; écrire un JSON sans données sensibles dans `sync_logs`.

- [ ] **Step 5: Vérifier et committer**

```bash
cd backend
node --test test/chunkPlanner.test.js test/syncJobs.test.js test/syncServiceProgress.test.js
node --check src/chunkPlanner.js && node --check src/syncJobs.js && node --check src/syncService.js && node --check worker.js
git add src/chunkPlanner.js src/syncService.js worker.js src/imapService.js test/syncServiceProgress.test.js
git commit -m "feat(backend): scan recent periods first with resumable progress"
```

### Task 5: Poller frontend avec backoff

**Files:**
- Create: `frontend/js/poll-schedule.js`
- Create: `frontend/test/poll-schedule.test.cjs`
- Modify: `frontend/js/client.js`
- Modify: `frontend/js/app.js`
- Modify: `frontend/js/dashboard.js`
- Modify: `frontend/js/settings.js`
- Modify: `frontend/js/bulletins.js`
- Modify: `frontend/sworker.js`

**Interfaces:**
- `nextPollDelay({ elapsedMs, attempt }) -> 5000 | 15000 | 30000`.
- `Api.pollSyncStatus(onProgress)` reste public et possède une seule promesse active par job.

- [ ] **Step 1: Tester les paliers purs**

```js
assert.equal(nextPollDelay({ elapsedMs: 0, attempt: 0 }), 5000);
assert.equal(nextPollDelay({ elapsedMs: 20000, attempt: 2 }), 15000);
assert.equal(nextPollDelay({ elapsedMs: 60000, attempt: 5 }), 30000);
```

- [ ] **Step 2: Implémenter le module UMD**

`poll-schedule.js` ne contient aucun timer ni accès DOM ; il calcule seulement le prochain délai pour rester testable avec `node:test`.

- [ ] **Step 3: Remplacer la boucle actuelle**

Dans `client.js`, supprimer les constantes 1,5 s/2 min et appeler `nextPollDelay`. Conserver les erreurs transitoires, mais utiliser un single-flight de poller.

- [ ] **Step 4: Supprimer le deuxième poller de boot**

Dans `app.js`, supprimer la boucle locale `for (let i = 0; i < 40; i++)`; le boot et les boutons utilisent le même `Api.pollSyncStatus`.

- [ ] **Step 5: Afficher phase et période**

Dans la carte guidée, afficher `phase`, période en cours et `new_bulletins`. Le bouton reste un spinner compact. La vue Bulletins reçoit un tick au plus toutes les 30 secondes ou à la fin d’une tranche.

- [ ] **Step 6: Vérifier et committer**

```bash
cd frontend
node --test test/poll-schedule.test.cjs test/singleflight.test.cjs test/parcours.test.cjs
node --check js/client.js && node --check js/app.js && node --check js/dashboard.js && node --check js/settings.js && node --check js/bulletins.js && node --check js/poll-schedule.js
npm run build
git add js/poll-schedule.js test/poll-schedule.test.cjs js/client.js js/app.js js/dashboard.js js/settings.js js/bulletins.js sworker.js
git commit -m "perf(frontend): use one backoff poller with sync progress"
```

### Task 6: Gate production Phase 2 et rollback

**Files:**
- Test: `backend/test/*.test.js`, `frontend/test/*.test.cjs`
- Modify: aucun fichier hors tâches précédentes

- [ ] **Step 1: Capturer les baselines**

Sur un scan réel, relever le nombre de lignes `sync_requests`, les appels `/sync/status`, le temps jusqu’au premier bulletin récent et les temps IMAP/PDF/import par tranche.

- [ ] **Step 2: Sauvegarder la DB de production**

Utiliser la procédure de backup décrite dans `docs/DEPLOYMENT-o2switch.md`, vérifier taille et horodatage, puis seulement déployer la migration.

- [ ] **Step 3: Tester localement**

```bash
cd backend && npm test
cd ../frontend && npm test && npm run build
```

- [ ] **Step 4: Déployer et vérifier**

Déployer backend/frontend via FTPS, vérifier `/api/health`, `worker.alive`, un seul worker, puis tester double clic, scheduler, re-scan et redémarrage worker.

- [ ] **Step 5: Critères de sortie**

Accepter la phase seulement si : au plus un job actif par appareil, curseur conservé après redémarrage, récent visible avant historique, au moins 70 % de réduction des appels status et rollback documenté si la migration échoue.
