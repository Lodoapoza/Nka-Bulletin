const Accounts = (() => {
  const PROVIDER_LABELS = { gmail: 'Gmail', outlook: 'Microsoft Exchange / Outlook', yahoo: 'Yahoo Mail', imap: 'IMAP personnalisé' };
  const PROVIDER_DISPLAY = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo', imap: 'IMAP' };
  const PROVIDER_PRESETS = {
    gmail:   { host: 'imap.gmail.com',        port: 993, appPwdUrl: 'https://myaccount.google.com/apppasswords' },
    outlook: { host: 'outlook.office365.com', port: 993, appPwdUrl: 'https://account.live.com/apppasswords' },
    yahoo:   { host: 'imap.mail.yahoo.com',   port: 993, appPwdUrl: 'https://login.yahoo.com/account/security' },
    imap:    { host: 'imap.gmail.com',        port: 993, appPwdUrl: null },
  };

  let selectedProvider = 'gmail';

  function updateProviderUI(provider) {
    selectedProvider = provider;
    document.querySelectorAll('.provider-card').forEach(c => c.classList.toggle('active', c.dataset.provider === provider));

    const preset = PROVIDER_PRESETS[provider];

    // Pré-remplissage automatique du serveur IMAP selon le fournisseur.
    // Les champs ne sont visibles que pour « IMAP personnalisé », mais on
    // les remplit toujours pour que la soumission envoie les bonnes valeurs.
    document.getElementById('imap-host').value = preset.host;
    document.getElementById('imap-port').value = preset.port;

    const customFields = document.getElementById('custom-imap-fields');
    const appPwdLink = document.getElementById('app-pwd-link');

    if (provider === 'imap') {
      customFields.classList.remove('hidden');
      appPwdLink.style.display = 'none';
    } else {
      customFields.classList.add('hidden');
      appPwdLink.style.display = 'block';
      document.getElementById('app-pwd-url').href = preset.appPwdUrl || '#';
      document.getElementById('app-pwd-provider').textContent = PROVIDER_DISPLAY[provider] || provider;
    }
  }

  async function refresh() {
    const listEl = document.getElementById('accounts-list');

    // État de chargement (ne pas effacer des comptes déjà rendus)
    if (!listEl.querySelector('[data-remove]')) {
      listEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>Chargement des comptes...</div></div>';
    }

    try {
      const accounts = await Api.getAccounts();
      if (!accounts.length) {
        listEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        const glyph = document.createElement('div');
        glyph.className = 'glyph';
        glyph.textContent = '📬';
        empty.appendChild(glyph);
        const msg = document.createElement('div');
        msg.textContent = 'Aucune messagerie connectée.';
        empty.appendChild(msg);
        listEl.appendChild(empty);
        return;
      }
      listEl.innerHTML = '';
      accounts.forEach(a => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '12px';
        row.style.padding = '12px 0';
        row.style.borderBottom = '1px solid var(--md-outline)';

        const infoDiv = document.createElement('div');
        infoDiv.style.flex = '1';

        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = '700';
        nameDiv.textContent = a.label || a.email;
        infoDiv.appendChild(nameDiv);

        const providerHint = document.createElement('div');
        providerHint.className = 'hint';
        providerHint.textContent = `${PROVIDER_LABELS[a.provider] || a.provider} · ${a.email}`;
        infoDiv.appendChild(providerHint);

        const syncHint = document.createElement('div');
        syncHint.className = 'hint';
        syncHint.textContent = a.last_sync_at ? 'Dernière synchro : ' + new Date(a.last_sync_at).toLocaleString('fr-FR') : 'Pas encore synchronisé';
        infoDiv.appendChild(syncHint);

        row.appendChild(infoDiv);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-danger';
        removeBtn.dataset.remove = a.id;
        removeBtn.textContent = 'Retirer';
        row.appendChild(removeBtn);

        listEl.appendChild(row);
      });

      listEl.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = await Confirm.open({
            title: 'Retirer ce compte ?',
            message: 'Les bulletins déjà téléchargés resteront archivés.',
            confirmText: 'Retirer',
            danger: true,
          });
          if (!ok) return;
          try {
            await Api.deleteAccount(btn.dataset.remove);
            Toast.show('Compte retiré.');
            refresh();
          } catch (e) { Toast.show(ERR.msg(e)); }
        });
      });
    } catch (e) {
      // Hors ligne : message doux, ne pas effacer les comptes déjà rendus.
      if (!navigator.onLine) {
        if (!listEl.querySelector('[data-remove]')) {
          listEl.innerHTML = '';
          const hint = document.createElement('div');
          hint.className = 'hint';
          hint.textContent = 'Hors ligne — comptes en cache';
          listEl.appendChild(hint);
        }
        return;
      }
      listEl.innerHTML = '';
      const errHint = document.createElement('div');
      errHint.className = 'hint';
      errHint.textContent = 'Erreur : ' + e.message;
      listEl.appendChild(errHint);
    }
  }

  // Données en cache servies (nka-cache-hit) : si la liste est vide ou en
  // erreur, re-render — le client sert déjà les données du cache via
  // Api.getAccounts(), le refresh suffit.
  window.addEventListener('nka-cache-hit', () => {
    const listEl = document.getElementById('accounts-list');
    if (!listEl) return;
    const hasAccounts = !!listEl.querySelector('[data-remove]');
    const inError = listEl.textContent.includes('Erreur');
    if (!hasAccounts || inError) refresh();
  });

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
        if (NativeBridge && NativeBridge.isNative) {
          NativeBridge.openExternal(preset.appPwdUrl).catch(() => {});
        } else {
          window.open(preset.appPwdUrl, '_blank');
        }
      }
    });

    submitBtn.addEventListener('click', async () => {
      const provider = selectedProvider;
      const email = document.getElementById('account-email').value.trim();
      const password = document.getElementById('account-password').value;
      const preset = PROVIDER_PRESETS[provider];
      const host = provider === 'imap' ? document.getElementById('imap-host').value.trim() : preset.host;
      const port = provider === 'imap' ? document.getElementById('imap-port').value : preset.port;

      if (!email || !email.includes('@')) { Toast.show('Adresse email invalide.'); return; }
      if (!password) { Toast.show('Mot de passe requis.'); return; }
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
