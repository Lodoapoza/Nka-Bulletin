/**
 * resolveJourneyState(snapshot) — machine d'états du parcours guidé.
 *
 * À partir d'un instantané de l'application, détermine l'état du parcours
 * utilisateur : `{ kind, title, body, action: { id, label } | null }`.
 *
 * Priorité de résolution :
 *   1. hors ligne avec cache  → offline-cache
 *   2. aucun compte           → no-account
 *   3. job pending/running    → running
 *   4. échec                  → failed
 *   5. terminé, nouveaux bulletins → done-with-results
 *   6. terminé, sans résultat → done-empty
 *   7. sinon                  → ready-to-scan
 *
 * Export UMD :
 *  - Node (CommonJS)  : `const { resolveJourneyState } = require('./parcours.js')`
 *  - Navigateur        : `window.resolveJourneyState(snapshot)`
 *
 * @param {object} snapshot
 * @param {number} [snapshot.accountCount] nombre de comptes connectés
 * @param {string|null} [snapshot.syncStatus] 'pending' | 'running' | 'done' | 'failed' | null
 * @param {number} [snapshot.newBulletins] nombre de nouveaux bulletins de la dernière recherche
 * @param {boolean} [snapshot.online] connectivité réseau
 * @param {boolean} [snapshot.hasCachedBulletins] des bulletins sont disponibles en cache
 * @returns {{kind: string, title: string, body: string, action: {id: string, label: string} | null}}
 */
(function (root) {
  'use strict';

  function resolveJourneyState(snapshot = {}) {
    const {
      accountCount = 0,
      syncStatus = null,
      newBulletins = 0,
      online = true,
      hasCachedBulletins = false,
    } = snapshot;

    if (!online && hasCachedBulletins) {
      return {
        kind: 'offline-cache',
        title: 'Données disponibles hors connexion',
        body: 'Vos bulletins déjà téléchargés restent consultables sans connexion.',
        action: { id: 'view-bulletins', label: 'Voir mes bulletins' },
      };
    }

    if (accountCount === 0) {
      return {
        kind: 'no-account',
        title: 'Connectons votre boîte mail',
        body: 'Ajoutez votre adresse e-mail pour recevoir vos bulletins ici.',
        action: { id: 'connect-account', label: 'Connecter ma boîte mail' },
      };
    }

if (syncStatus === 'pending' || syncStatus === 'running') {
  // On the homepage, don't show the "en cours" message
  if (window.location.pathname === '/') {
    return {
      kind: 'ready-to-scan',
      title: 'Votre boîte mail est connectée',
      body: 'Votre compte est prêt. Lancez une recherche de nouveaux bulletins.',
      action: { id: 'start-sync', label: 'Rechercher mes bulletins' },
    };
  }
  return {
    kind: 'running',
    title: 'Recherche des bulletins en cours',
    body: 'Vos bulletins sont en cours de récupération, patientez quelques instants.',
    action: { id: 'view-bulletins', label: 'Voir mes bulletins' },
  };
}

    if (syncStatus === 'failed') {
      return {
        kind: 'failed',
        title: 'La recherche n’a pas abouti',
        body: 'Une erreur est survenue pendant la recherche. Vous pouvez réessayer.',
        action: { id: 'retry-sync', label: 'Réessayer' },
      };
    }

    if (syncStatus === 'done' && newBulletins > 0) {
      return {
        kind: 'done-with-results',
        title: `${newBulletins} nouveau(x) bulletin(s) trouvé(s)`,
        body: 'Vos bulletins ont été récupérés et sont disponibles dans Mes bulletins.',
        action: { id: 'view-bulletins', label: 'Voir mes bulletins' },
      };
    }

    if (syncStatus === 'done') {
      return {
        kind: 'done-empty',
        title: 'Aucun nouveau bulletin',
        body: 'Aucun nouveau bulletin n’a été trouvé sur votre compte.',
        action: { id: 'start-sync', label: 'Rechercher à nouveau' },
      };
    }

    return {
      kind: 'ready-to-scan',
      title: 'Votre boîte mail est connectée',
      body: 'Votre compte est prêt. Lancez une recherche de nouveaux bulletins.',
      action: { id: 'start-sync', label: 'Rechercher mes bulletins' },
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { resolveJourneyState };
  } else {
    root.resolveJourneyState = resolveJourneyState;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);
