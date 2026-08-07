// ===== Confirmation dans le thème de l'application =====
// Remplace window.confirm() par une modale Material (mêmes styles que le reset).
// API : Confirm.open({ title, message, confirmText, cancelText, danger }) → Promise<boolean>
const Confirm = (() => {
  function open(opts = {}) {
    const {
      title = 'Confirmer ?',
      message = '',
      confirmText = 'Confirmer',
      cancelText = 'Annuler',
      danger = false,
    } = opts;

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'reset-overlay';
      overlay.innerHTML = `
        <div class="reset-modal" role="alertdialog" aria-modal="true">
          <div class="reset-icon">
            ${danger
              ? '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9L2.4 17a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="#B3261E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
              : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5m0-8v.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'}
          </div>
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="reset-actions">
            <button class="btn btn-outline" data-role="cancel">${cancelText}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-role="ok">${confirmText}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const done = (val) => {
        overlay.remove();
        resolve(val);
      };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) done(false);
      });
      overlay.querySelector('[data-role="cancel"]').addEventListener('click', () => done(false));
      overlay.querySelector('[data-role="ok"]').addEventListener('click', () => done(true));
    });
  }

  return { open };
})();