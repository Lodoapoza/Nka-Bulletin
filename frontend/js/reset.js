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
        <h3 id="reset-title">Réinitialiser cet appareil ?</h3>
        <p>Toutes les données locales de cet appareil seront perdues (bulletins, comptes, cache). Cette action est irréversible.</p>
        <div class="reset-actions">
          <button class="btn btn-outline" id="reset-cancel-btn">Annuler</button>
          <button class="btn btn-danger" id="reset-confirm-btn">Réinitialiser</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#reset-cancel-btn').addEventListener('click', close);
    overlay.querySelector('#reset-confirm-btn').addEventListener('click', async () => {
      const btn = overlay.querySelector('#reset-confirm-btn');
      btn.disabled = true;
      btn.textContent = 'Réinitialisation...';
      await resetDevice();
    });
  }

  async function resetDevice() {
    // 1. Purge serveur (best-effort : si hors-ligne, on continue quand même).
    const token = localStorage.getItem('nka_token');
    if (token) {
      try {
        await fetch(`${API_BASE}/device`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) { /* hors-ligne : on continue */ }
    }

    // 2. Purge locale.
    localStorage.clear();
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* pas de SW */ }
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