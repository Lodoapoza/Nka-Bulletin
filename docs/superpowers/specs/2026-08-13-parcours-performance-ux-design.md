# Nka Bulletin — Parcours guidé, performance et confiance utilisateur

**Date :** 2026-08-13
**Statut :** conception validée en conversation, revue écrite requise avant implémentation
**Périmètre :** première évolution structurée du parcours utilisateur, de la synchronisation et de la consultation des bulletins

## 1. Objectif

Rendre Nka Bulletin immédiatement compréhensible et fiable pour un utilisateur non technique :

- savoir quoi faire dès la première ouverture ;
- connecter une boîte mail sans chercher dans Réglages ;
- choisir explicitement quand lancer une recherche longue ;
- voir les bulletins récents rapidement et progressivement ;
- comprendre à tout moment si la recherche est en attente, en cours, terminée ou en erreur ;
- réduire les requêtes et traitements redondants ;
- rendre les erreurs, états vides, actions et contrôles accessibles sur mobile et au clavier.

Le design privilégie une évolution intégrée au dashboard existant, sans assistant séparé ni refonte visuelle totale.

## 2. Contexte observé

L’audit du 13/08/2026 a identifié les points suivants :

- après le PIN, l’utilisateur arrive sur un accueil vide ; la connexion de boîte mail est actuellement cachée dans Réglages (`frontend/js/app.js`, `frontend/index.html`) ;
- après connexion d’un compte, l’interface affiche principalement un toast et ne propose pas directement la recherche (`frontend/js/accounts.js`) ;
- le démarrage peut lancer plusieurs refreshs et synchronisations concurrents (`frontend/js/app.js`, `frontend/js/client.js`, `backend/src/routes/sync.js`) ;
- un re-scan complet traite historiquement les périodes anciennes avant les périodes récentes (`backend/src/syncService.js`) ;
- le polling et le rafraîchissement progressif peuvent relire deux fois la liste et relire les caches PDF (`frontend/js/client.js`, `frontend/js/bulletins.js`) ;
- `GET /api/bulletins` renvoie toutes les lignes et tous les champs sans pagination (`backend/src/routes/bulletins.js`) ;
- les états vides et erreurs sont souvent réduits à un toast ;
- plusieurs champs, modales, dropdowns et contrôles générés manquent d’associations accessibles (`frontend/index.html`, `frontend/js/confirm.js`, `frontend/js/dropdown.js`).

Le dépôt contient encore des modifications non commitées historiques. L’implémentation devra isoler ses fichiers et ne devra jamais effectuer un commit global du worktree.

## 3. Principes produit

1. **Une action évidente par écran.** Un état vide doit toujours expliquer la prochaine étape et proposer son bouton.
2. **Le résultat avant le mécanisme.** Employer « Mes bulletins », « Mettre à jour » et « boîte mail » sur la face publique ; éviter le jargon technique.
3. **Aucune surprise coûteuse.** La connexion ne lance pas automatiquement une recherche longue : elle propose explicitement de la démarrer.
4. **Le statut est persistant.** Changer de vue ou rouvrir l’application ne doit pas faire disparaître l’état d’une recherche active.
5. **Les données existantes restent visibles.** Un refresh ne vide pas la liste avant d’avoir reçu la nouvelle réponse.
6. **Une intention utilisateur = un job.** Les clics répétés, le boot et le scheduler ne doivent pas empiler des recherches identiques.
7. **Mobile d’abord, accessible par défaut.** Les textes, actions et états ne doivent pas dépendre d’une icône, d’une couleur ou d’un toast temporaire.

## 4. Parcours utilisateur et machine d’états

La source de vérité est composée du nombre de comptes connu par l’API et du statut serveur de la requête de synchronisation. Aucun booléen local ne doit décider seul de l’état du parcours.

### 4.1 Aucun compte connecté

Le dashboard affiche une carte prioritaire :

> **Connectons votre boîte mail**
> Vos bulletins seront recherchés dans vos emails.
> **[Connecter ma boîte mail]**

L’action ouvre la section des comptes dans Réglages, fait défiler jusqu’au formulaire existant et place le focus sur le premier champ utile. Les statistiques à zéro sont secondaires dans cet état.

### 4.2 Compte connecté, aucune recherche lancée

Après l’enregistrement réussi d’un compte, l’interface affiche une confirmation persistante dans le contexte Réglages et sur le dashboard :

> **Votre boîte mail est connectée**
> Recherchez maintenant vos bulletins de paie.
> **[Rechercher mes bulletins]**

Le bouton lance une seule requête de synchronisation. La connexion seule ne lance pas de scan long.

### 4.3 Recherche en cours

Une carte de statut persistante affiche :

> **Recherche des bulletins en cours**
> Les nouveaux bulletins apparaîtront progressivement.
> **[Voir les bulletins]**

Le bouton d’action principal reste compact (spinner seul ou icône courte). La progression et le nombre de nouveaux bulletins sont affichés dans la carte, pas dans le libellé du bouton.

### 4.4 Recherche terminée

La carte affiche le nombre de nouveaux bulletins, la date de mise à jour et l’action « Voir mes bulletins ». Le dashboard revient ensuite à son état normal « À jour au … ».

### 4.5 Aucun résultat

L’état explique que la recherche est terminée sans résultat et propose « Rechercher à nouveau ». Il ne doit pas être confondu avec l’absence de compte ou une erreur réseau.

### 4.6 Erreur ou hors ligne

L’erreur est affichée dans la carte avec une action « Réessayer ». Les bulletins déjà présents restent visibles. En mode hors ligne, l’application indique que les données affichées proviennent du stockage local et ne présente pas une liste vide comme si les données avaient disparu.

## 5. Architecture UX à implémenter

L’application reste en JavaScript vanilla/IIFE et conserve les routes existantes.

### 5.1 Carte d’état guidé

Introduire un rendu centralisé de la carte d’état du parcours, utilisé par le dashboard et alimenté par :

- comptes disponibles ;
- statut de la requête active ;
- dernier résultat connu ;
- état réseau/cache.

Le rendu doit conserver les IDs et handlers actuels lorsque cela évite une migration inutile. Les textes visibles sont en français simple.

### 5.2 Connexion d’une boîte mail

Réutiliser le formulaire existant, mais :

- ouvrir directement le formulaire depuis le dashboard ;
- conserver les champs avancés IMAP derrière une option explicite ;
- expliquer le « mot de passe d’application » pour les fournisseurs concernés ;
- afficher les erreurs principales dans le formulaire, en plus d’un éventuel toast ;
- fournir afficher/masquer le mot de passe et les attributs d’autocomplétion adaptés ;
- après succès, afficher la proposition « Rechercher mes bulletins ».

La spec ne modifie pas le modèle d’authentification. En prérequis de la phase 1, le flux réellement utilisé en production sera vérifié ; l’onboarding ouvrira le formulaire de compte déjà utilisé et n’exposera ni ne supprimera `login-email` tant que cette vérification n’est pas terminée.

## 6. Architecture performance

### 6.1 Boot single-flight

- mémoriser la promesse d’enregistrement de l’appareil pendant le boot ;
- orchestrer les chargements initiaux dans un seul flux ;
- supprimer les refreshs identiques déclenchés par le boot et la navigation ;
- ne charger les données de Réglages qu’au moment utile, sauf données nécessaires au statut global.

### 6.2 Une seule recherche active

Le serveur doit garantir, par appareil, une seule requête logique `pending/running` :

- un clic répété renvoie la requête existante ;
- le scheduler ne crée pas de doublon ;
- un re-scan complet ne peut pas être écrasé par une synchronisation incrémentale ;
- les transitions de statut sont transactionnelles et idempotentes.

Politique d’escalade : si une recherche incrémentale est déjà en cours et qu’un re-scan complet est demandé, le job actif reçoit un indicateur `full_scan_after_current`. Il termine sa tranche courante, puis enchaîne la phase récente du re-scan dans le même job logique. Si le job est encore en attente, il est directement converti en re-scan complet. Si un re-scan complet est déjà actif, la nouvelle demande renvoie simplement ce job. Aucune deuxième recherche concurrente n’est créée.

### 6.3 Scan récent puis historique

Un re-scan complet conserve la couverture historique d’environ 35 ans, mais traite d’abord une fenêtre récente configurable. La valeur initiale proposée est **24 mois**, puis les tranches anciennes sont traitées en arrière-plan.

Chaque tranche doit être reprenable via un curseur ou un état de job persistant :

- période en cours ;
- dernière tranche terminée ;
- phase récente ou historique ;
- nombre de bulletins importés.

La déduplication existante reste obligatoire afin qu’une reprise ne crée pas de doublon.

### 6.4 Polling et progression

Le client conserve un seul poller actif et applique un backoff progressif : démarrage rapide, puis intervalles de 5 s, 15 s et 30 s. Le poller s’arrête immédiatement à la fin du job.

La carte de statut reçoit les compteurs et la période en cours. Le bouton ne porte pas le texte long de progression.

### 6.5 Liste des bulletins

Phase initiale :

- ne plus effectuer deux requêtes identiques pour une seule actualisation ;
- ne pas relire tous les Blobs PDF IndexedDB à chaque tick ;
- rafraîchir par lots espacés pendant un scan ;
- ignorer les réponses réseau obsolètes ;
- conserver la liste précédente pendant le chargement.

Phase suivante :

- projection explicite des champs nécessaires ;
- pagination par curseur, triée du plus récent au plus ancien ;
- métadonnées d’années dans la même réponse ou endpoint léger ;
- rendu incrémental ou virtualisé pour les historiques volumineux.

## 7. Analyse, états et accessibilité

### 7.1 Bulletins

La vue doit différencier « aucun compte », « recherche en cours », « aucun bulletin », « aucun résultat pour ces filtres », « erreur réseau » et « données hors ligne ». Chaque état possède une action adaptée.

Les actions de ligne utilisent un libellé accessible et cohérent : « Ouvrir le PDF » et « Disponible hors connexion ». Une sélection devenue invisible après filtrage est retirée ou signalée clairement.

### 7.2 Analyse

La fonctionnalité reste visible lorsqu’elle est désactivée, avec un bouton « Activer l’analyse ». Le retraitement indique son état. Les statistiques, graphiques et alertes précédentes sont effacés lorsqu’une nouvelle période ne contient pas de données. Les petites variations restent affichées avec leur valeur réelle.

### 7.3 Accessibilité

- associer chaque `label` à son champ ;
- annoncer les statuts via `aria-live="polite"` ;
- annoncer les erreurs importantes via un rôle adapté ;
- donner un nom accessible à chaque case, bouton et icône ;
- gérer le focus initial, le piège et le retour du focus dans les modales ;
- rendre les dropdowns utilisables au clavier ou revenir à un `select` natif ;
- vérifier les contrastes de tous les thèmes, notamment ambre.

### 7.4 Responsive

Tester au minimum 320, 360, 375 et 480 px, avec : longues adresses email, noms de fournisseurs, titres de bulletins longs, clavier ouvert, dropdown en bas d’écran et zoom texte augmenté. Aucun scroll horizontal ni bouton tronqué n’est acceptable.

## 8. Découpage d’implémentation

### Phase 1 — Parcours et quick wins

- carte d’accueil sans compte et action directe vers le formulaire ;
- proposition explicite de recherche après connexion ;
- carte de statut persistante et états vides/erreurs ;
- boot single-flight et garde anti-double action ;
- conservation de la liste pendant les refreshs ;
- erreurs inline prioritaires et premiers labels/accessibility fixes.

### Phase 2 — Moteur de synchronisation

- unicité des jobs actifs côté serveur et scheduler ;
- curseur de reprise ;
- récent d’abord puis historique ;
- polling avec backoff et progression réelle ;
- mesure des temps IMAP, PDF/OCR et import.

### Phase 3 — Liste, offline et finition

- API bulletins projetée et paginée ;
- cache métadonnées séparé des Blobs ;
- ouverture prioritaire depuis le cache local ;
- rendu incrémental/virtualisé ;
- analyse asynchrone et accessible ;
- audit responsive, clavier, contrastes et modales.

## 9. Vérification et critères de succès

### Tests fonctionnels

- premier démarrage sans compte ;
- ouverture directe du formulaire depuis le dashboard ;
- compte valide, compte invalide et erreur réseau ;
- connexion réussie puis proposition de recherche ;
- double clic, réouverture de l’application et scheduler pendant un job ;
- re-scan complet avec apparition des périodes récentes avant l’historique ;
- changement de vue pendant une recherche ;
- aucun résultat, filtre sans résultat, mode hors ligne et reprise réseau ;
- activation de l’analyse et changement vers une année vide.

### Mesures avant/après

- première ouverture : une seule requête d’enregistrement et pas de refresh identique concurrent ;
- synchronisation : au plus un job actif par appareil ;
- diminution d’au moins 70 % des appels de statut sur un scan long ;
- premier bulletin récent visible avant le traitement de l’historique ancien ;
- une requête de données par refresh de liste en phase 1 ;
- aucun écran d’erreur important réduit à un toast ;
- aucun débordement horizontal entre 320 et 480 px ;
- parcours principal navigable au clavier.

### Validation production

Chaque phase devra être :

1. testée localement avec les commandes adaptées au projet ;
2. construite via le build frontend existant ;
3. déployée via FTPS avec vérification HTTP et contenu en ligne ;
4. vérifiée sur mobile/PWA avant annonce de fin.

Les changements seront committés par phase et uniquement sur les fichiers concernés. Le reliquat non commité du worktree ne doit pas être inclus par inadvertance.

## 10. Hors périmètre immédiat

- changement de modèle de licence ou de limite d’appareils ;
- nouvelle méthode d’authentification ;
- refonte complète de la charte Material ;
- modification du keystore ou du pipeline APK ;
- suppression de l’API `login-email` dormante avant clarification du flux canonique ;
- promesse d’une durée fixe de scan à l’utilisateur.
