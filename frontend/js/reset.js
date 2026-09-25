// ===== Reset complet de l'appareil =====
// Purge serveur (DELETE /api/device) + purge locale (localStorage, IndexedDB, caches SW).
const ResetDevice = (() => {
  const API_BASE = window.NKA_API_BASE || '/api';

  function openConfirm() {
    // Modal de confirmation (overlay injecté dynamiquement).
    const overlay = document.createElement('div');
    overlay.className = 'reset-overlay';
    overlay.innerHTML = `
      <div class="reset-modal" role="alertdialog" aria-modal="true" aria-labelledby="reset-title">
        <div class="reset-icon">⚠️</div>
        <h3 id="reset-title">Réinitialiser ?</h3>
        <p>Choisissez ce que vous voulez effacer :</p>
        <div class="reset-actions">
          <button class="btn btn-outline" id="reset-cancel-btn">Annuler</button>
          <button class="btn btn-outline" id="reset-soft-btn">Appareil seul<br><small>Garde les bulletins sur le serveur</small></button>
          <button class="btn btn-danger" id="reset-full-btn">Tout effacer<br><small>Supprime aussi bulletins et PDFs du serveur</small></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#reset-cancel-btn').addEventListener('click', close);
    overlay.querySelector('#reset-soft-btn').addEventListener('click', async () => {
      const btn = overlay.querySelector('#reset-soft-btn');
      btn.disabled = true;
      btn.textContent = 'Réinitialisation...';
      await resetDevice(false);
    });
    overlay.querySelector('#reset-full-btn').addEventListener('click', async () => {
      const btn = overlay.querySelector('#reset-full-btn');
      btn.disabled = true;
      btn.textContent = 'Suppression...';
      await resetDevice(true);
    });
  }

  async function resetDevice(full = false) {
    // 1. Purge serveur : ne jamais annoncer une purge complète si le serveur
    // n'a pas confirmé la suppression. Sinon les données réapparaissent au login.
    const token = localStorage.getItem('nka_token');
    if (token) {
      try {
        const response = await fetch(`${API_BASE}/device${full ? '?full=1' : ''}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          let message = `Erreur ${response.status}`;
          try { message = (await response.json()).error || message; } catch (_) {}
          throw new Error(message);
        }
      } catch (e) {
        Toast.show(`Purge non confirmée : ${e.message || 'serveur inaccessible'}`);
        return;
      }
    }

    // 2. Purge locale.
    localStorage.clear();
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* pas de SW */ }
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (e) { /* pas de service worker */ }
    try {
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('nka-offline-cache');
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    } catch (e) { /* pas d'IndexedDB */ }

    // 3. Reload : l'app repart comme une installation neuve.
    location.reload();
  }

  return { openConfirm, resetDevice };
})();
