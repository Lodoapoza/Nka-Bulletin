// ===== Reset complet de l'appareil =====
// Purge serveur (DELETE /api/device) + purge locale (localStorage, IndexedDB, caches SW).
const ResetDevice = (() => {
  const API_BASE = window.NKA_API_BASE || '/api';

  function openConfirm() {
    // Modal de confirmation (overlay injecté dynamiquement).
    const overlay = document.createElement('div');
    overlay.className = 'reset-overlay';
    overlay.innerHTML = `
      <div class="reset-modal" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-description">
        <div class="reset-icon" aria-hidden="true">!</div>
        <h3 id="reset-title">Réinitialiser l’application</h3>
        <p id="reset-description">Choisissez une action. La suppression des données du serveur est irréversible.</p>
        <div class="reset-actions">
          <button class="btn btn-outline" id="reset-cancel-btn">Annuler</button>
          <button class="btn btn-outline" id="reset-soft-btn">Réinitialiser cet appareil<br><small>Conserve vos bulletins en ligne</small></button>
          <button class="btn btn-danger" id="reset-full-btn">Supprimer toutes les données<br><small>Compte et appareils associés</small></button>
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
      if (!(await resetDevice(false))) {
        btn.disabled = false;
        btn.innerHTML = 'Réinitialiser cet appareil<br><small>Conserve vos bulletins en ligne</small>';
      }
    });
    overlay.querySelector('#reset-full-btn').addEventListener('click', async () => {
      const btn = overlay.querySelector('#reset-full-btn');
      btn.disabled = true;
      btn.textContent = 'Suppression...';
      if (!(await resetDevice(true))) {
        btn.disabled = false;
        btn.innerHTML = 'Supprimer toutes les données<br><small>Compte et appareils associés</small>';
      }
    });
  }

  async function resetDevice(full = false) {
    const token = localStorage.getItem('nka_token');
    if (full && !token) {
      Toast.show('Reconnectez-vous avant de supprimer les donnes du serveur.');
      return false;
    }
    // Nettoyer ;appareil ;abord et conserver la session tant que ce ;est pas confirmNdl.
    const localErrors = [];
    try {
      if (typeof Api !== 'undefined' && Api.closeOfflineCache) await Api.closeOfflineCache();
      const keys = await caches.keys();
      const results = await Promise.all(keys.map((k) => caches.delete(k)));
      if (results.some((deleted) => !deleted)) localErrors.push('cache');
    } catch (e) { localErrors.push('cache'); }
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
      const results = await Promise.all(registrations.map((registration) => registration.unregister()));
      if (results.some((removed) => !removed)) localErrors.push('service-worker');
    } catch (e) { localErrors.push('service-worker'); }
    try {
      const deleted = await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('nka-offline-cache');
        let settled = false;
        const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
        req.onsuccess = () => finish(true);
        req.onerror = () => finish(false);
        req.onblocked = () => setTimeout(() => finish(false), 1500);
      });
      if (!deleted) localErrors.push('indexeddb');
    } catch (e) { localErrors.push('indexeddb'); }
    if (localErrors.length) {
      Toast.show('La rinitialisation est bloque. Fermez les autres onglets de Nka Bulletin puis ressayez.');
      return false;
    }
    if (token) {
      try {
        const response = await fetch(`${API_BASE}/device${full ? '?full=1' : ''}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-store' },
        });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
      } catch (e) {
        Toast.show('Impossible de terminer la rinitialisation en ligne. Ressayez.');
        return false;
      }
    }
    localStorage.clear();
    location.reload();
    return true;
  }

  return { openConfirm, resetDevice };
})();
