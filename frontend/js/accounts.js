const Accounts = (() => {
  const PROVIDER_LABELS = { gmail: 'Gmail', outlook: 'Microsoft Exchange / Outlook', yahoo: 'Yahoo Mail', imap: 'IMAP personnalisé' };
  const PROVIDER_PRESETS = {
    gmail:   { host: 'imap.gmail.com',        port: 993, appPwdUrl: 'https://myaccount.google.com/apppasswords' },
    outlook: { host: 'outlook.office365.com', port: 993, appPwdUrl: 'https://account.live.com/apppasswords' },
    yahoo:   { host: 'imap.mail.yahoo.com',   port: 993, appPwdUrl: 'https://login.yahoo.com/account/security' },
    imap:    { host: '',                       port: 993, appPwdUrl: null },
  };

  let selectedProvider = 'gmail';

  function updateProviderUI(provider) {
    selectedProvider = provider;
    document.querySelectorAll('.provider-card').forEach(c => c.classList.toggle('active', c.dataset.provider === provider));

    const preset = PROVIDER_PRESETS[provider];
    document.getElementById('imap-host-display').textContent = preset.host || '—';
    document.getElementById('imap-port-display').textContent = preset.port;

    const customFields = document.getElementById('custom-imap-fields');
    const imapPreset = document.getElementById('imap-preset');
    const appPwdLink = document.getElementById('app-pwd-link');

    if (provider === 'imap') {
      customFields.classList.remove('hidden');
      imapPreset.style.display = 'none';
      appPwdLink.style.display = 'none';
    } else {
      customFields.classList.add('hidden');
      imapPreset.style.display = 'block';
      appPwdLink.style.display = 'block';
      const link = document.getElementById('app-pwd-url');
      link.href = preset.appPwdUrl || '#';
    }
  }

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
    const submitBtn = document.getElementById('submit-account-btn');

    addBtn.addEventListener('click', () => {
      formCard.classList.remove('hidden');
      updateProviderUI('gmail');
    });
    cancelBtn.addEventListener('click', () => {
      formCard.classList.add('hidden');
      document.getElementById('account-email').value = '';
      document.getElementById('account-password').value = '';
    });

    document.querySelectorAll('.provider-card').forEach(card => {
      card.addEventListener('click', () => updateProviderUI(card.dataset.provider));
    });

    document.getElementById('app-pwd-url').addEventListener('click', (e) => {
      e.preventDefault();
      const preset = PROVIDER_PRESETS[selectedProvider];
      if (preset && preset.appPwdUrl) {
        window.open(preset.appPwdUrl, '_blank');
      }
    });

    submitBtn.addEventListener('click', async () => {
      const provider = selectedProvider;
      const email = document.getElementById('account-email').value.trim();
      const password = document.getElementById('account-password').value;
      const preset = PROVIDER_PRESETS[provider];
      const host = provider === 'imap' ? document.getElementById('imap-host').value.trim() : preset.host;
      const port = provider === 'imap' ? document.getElementById('imap-port').value : preset.port;

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
