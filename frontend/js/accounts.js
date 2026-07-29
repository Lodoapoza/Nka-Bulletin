const Accounts = (() => {
  const PROVIDER_LABELS = { gmail: 'Gmail', outlook: 'Microsoft Exchange / Outlook', yahoo: 'Yahoo Mail', imap: 'IMAP personnalisé' };

  async function refresh() {
    const listEl = document.getElementById('accounts-list');
    try {
      const accounts = await Api.getAccounts();
      if (!accounts.length) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="glyph">📬</div>
            <div>Aucune messagerie connectée.</div>
          </div>`;
        return;
      }
      listEl.innerHTML = accounts.map(a => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--md-outline);">
          <div style="flex:1;">
            <div style="font-weight:700;">${a.label || a.email}</div>
            <div class="hint">${PROVIDER_LABELS[a.provider] || a.provider} · ${a.email}</div>
            <div class="hint">${a.last_sync_at ? 'Dernière synchro : ' + new Date(a.last_sync_at).toLocaleString('fr-FR') : 'Pas encore synchronisé'}</div>
          </div>
          <button class="btn btn-danger" data-remove="${a.id}">Retirer</button>
        </div>
      `).join('');

      listEl.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Retirer ce compte ? Les bulletins déjà téléchargés resteront archivés.')) return;
          try {
            await Api.deleteAccount(btn.dataset.remove);
            Toast.show('Compte retiré.');
            refresh();
          } catch (e) { Toast.show(ERR.msg(e)); }
        });
      });
    } catch (e) {
      listEl.innerHTML = `<div class="hint">Erreur : ${e.message}</div>`;
    }
  }

  function bindForm() {
    const formCard = document.getElementById('add-account-form');
    const addBtn = document.getElementById('add-account-btn');
    const cancelBtn = document.getElementById('cancel-account-btn');
    const providerSelect = document.getElementById('provider-select');
    const customFields = document.getElementById('custom-imap-fields');
    const submitBtn = document.getElementById('submit-account-btn');

    addBtn.addEventListener('click', () => formCard.classList.remove('hidden'));
    cancelBtn.addEventListener('click', () => {
      formCard.classList.add('hidden');
      document.getElementById('account-email').value = '';
      document.getElementById('account-password').value = '';
    });
    providerSelect.addEventListener('change', () => {
      customFields.classList.toggle('hidden', providerSelect.value !== 'imap');
    });

    submitBtn.addEventListener('click', async () => {
      const provider = providerSelect.value;
      const email = document.getElementById('account-email').value.trim();
      const password = document.getElementById('account-password').value;
      const host = document.getElementById('imap-host').value.trim();
      const port = document.getElementById('imap-port').value;

      if (!email || !password) { Toast.show('Adresse email et mot de passe requis.'); return; }
      if (provider === 'imap' && !host) { Toast.show('Serveur IMAP requis pour un compte personnalisé.'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Connexion en cours...';
      try {
        await Api.addAccount({ provider, email, password, host, port, secure: true });
        Toast.show('Compte connecté avec succès !');
        formCard.classList.add('hidden');
        document.getElementById('account-email').value = '';
        document.getElementById('account-password').value = '';
        refresh();
      } catch (e) {
        Toast.show(ERR.msg(e));
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Connecter';
      }
    });
  }

  return { refresh, bindForm };
})();
