/**
 * Guided — renderer de la carte guidée du parcours utilisateur (dashboard).
 *
 * Affiche l'état du parcours déterminé par `resolveJourneyState` (parcours.js)
 * dans le conteneur `#guided-status-card` : titre, corps et bouton d'action.
 * Tout le contenu est injecté via `textContent` — aucun HTML serveur.
 *
 * Interfaces :
 *  - `Guided.render(container, state)` : met à jour le DOM (masque la carte
 *    si `state` est absent/incomplet, gère `aria-busy` pendant `running`).
 *  - `Guided.bind(container, onAction)` : installe UN seul listener de clic
 *    (délégation) qui publie uniquement les ids d'action du contrat :
 *    `connect-account`, `start-sync`, `view-bulletins`, `retry-sync`.
 */
const Guided = (() => {
  // Contrat d'interface avec parcours.js / dashboard.js — rien d'autre n'est publié.
  const ALLOWED_ACTIONS = new Set(['connect-account', 'start-sync', 'view-bulletins', 'retry-sync']);

  function render(container, state) {
    if (!container) return;
    const titleEl = document.getElementById('guided-status-title');
    const bodyEl = document.getElementById('guided-status-body');
    const actionBtn = document.getElementById('guided-status-action');
    if (!state || !state.title || !state.body || !state.action) {
      container.classList.add('hidden');
      return;
    }
    titleEl.textContent = state.title;
    bodyEl.textContent = state.body;
    actionBtn.textContent = state.action.label;
    actionBtn.dataset.action = state.action.id;
    actionBtn.hidden = false;
    container.classList.remove('hidden');
    // Annonce aria-live pendant la recherche, puis retour au calme.
    container.setAttribute('aria-busy', state.kind === 'running' ? 'true' : 'false');
  }

  function bind(container, onAction) {
    if (!container || typeof onAction !== 'function') return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || !ALLOWED_ACTIONS.has(btn.dataset.action)) return;
      onAction(btn.dataset.action);
    });
  }

  return { render, bind };
})();
