const Dashboard = (() => {
  const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

  function formatCurrency(n) {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('fr-FR').format(n) + ' XOF';
  }

  const MASK = '•••• ••••';

  let amountsHidden = localStorage.getItem('nka_amounts_hidden') === '1';

  function renderAmounts() {
    const last = document.getElementById('dash-last-net');
    const cumul = document.getElementById('dash-cumul-net');
    const icon = document.getElementById('amounts-eye-icon');
    if (last) last.textContent = amountsHidden ? MASK : last.dataset.value || '—';
    if (cumul) cumul.textContent = amountsHidden ? MASK : cumul.dataset.value || '—';
    if (icon) {
      if (amountsHidden) {
        icon.innerHTML = '<path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 002.8 2.8M6.9 6.9C4.5 8.2 3 12 3 12s3.5 7 10 7c1.5 0 2.8-.4 3.9-1M9.9 5.2A10 10 0 0112 5c6.5 0 10 7 10 7a15 15 0 01-2.2 3.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        icon.innerHTML = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/>';
      }
    }
  }

  function toggleAmountsVisibility() {
    amountsHidden = !amountsHidden;
    localStorage.setItem('nka_amounts_hidden', amountsHidden ? '1' : '0');
    renderAmounts();
  }

  // Garde anti-refresh concurrent : le boot, Router.goTo('dashboard'),
  // nka-account-added et la fin de synchro peuvent demander un refresh en
  // même temps — tous partagent la même exécution au lieu de re-frapper l'API.
  // Remise à null dans `finally` : un appel suivant relance un vrai refresh.
  let refreshPromise = null;

  function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = doRefresh();
    return refreshPromise.finally(() => { refreshPromise = null; });
  }

  async function doRefresh() {
    const syncStatus = document.getElementById('dash-sync-status');
    if (syncStatus) syncStatus.textContent = 'Chargement...';
    try {
      const stats = await Api.getStats();
      document.getElementById('dash-year-label').textContent = new Date().getFullYear();
      document.getElementById('dash-total').textContent = stats.totalThisYear;

      const latestTitleEl = document.getElementById('dash-latest-title');
      const openBtn = document.getElementById('dash-latest-open');
      if (stats.latest) {
        latestTitleEl.textContent = stats.latest.type === 'gratification'
          ? (stats.latest.period_label || `Gratification ${stats.latest.year}`)
          : `Bulletin de ${MONTHS_FR[stats.latest.month - 1]} ${stats.latest.year}`;
        openBtn.style.display = 'inline-flex';
          openBtn.onclick = async () => {
            try {
              const { blob, filename, objectUrl } = await Api.fetchBulletinBlob(stats.latest.id);
              if (NativeBridge && NativeBridge.isNative) {
                await NativeBridge.shareFile(blob, filename);
                URL.revokeObjectURL(objectUrl);
              } else {
                window.open(objectUrl, '_blank');
                setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
              }
            } catch (e) {
              Toast.show(ERR.msg(e));
            }
          };
      } else {
        latestTitleEl.textContent = "Aucun bulletin pour l'instant";
        openBtn.style.display = 'none';
      }

      const amountsCard = document.getElementById('dash-amounts-card');
      if (stats.amountsEnabled) {
        amountsCard.style.display = 'block';
        document.getElementById('dash-cumul-label').textContent = `Cumul ${new Date().getFullYear()}`;
        document.getElementById('dash-last-net').dataset.value = formatCurrency(stats.lastNetAmount);
        document.getElementById('dash-cumul-net').dataset.value = formatCurrency(stats.cumulativeNetThisYear);
        renderAmounts();
      } else {
        amountsCard.style.display = 'none';
      }
    } catch (e) {
      Toast.show(ERR.msg(e));
      // Hors ligne : les données en cache arrivent via le client (X-Cache: hit) ;
      // le statut ne doit pas être alarmiste.
      if (syncStatus) syncStatus.textContent = navigator.onLine ? 'Erreur de chargement' : 'Hors ligne — données en cache';
    }

    try {
      const accounts = await Api.getAccounts();
      const statusEl = document.getElementById('dash-sync-status');
      if (!accounts.length) {
        if (statusEl) statusEl.textContent = 'Connectez une boîte mail pour démarrer';
      } else {
        const lastSync = accounts.map(a => a.last_sync_at).filter(Boolean).sort().pop();
        statusEl.textContent = lastSync
          ? `À jour au ${new Date(lastSync).toLocaleString('fr-FR')}`
          : 'Jamais mis à jour';
      }
      // Carte guidée : snapshot alimenté en arrière-plan (ne bloque pas le refresh).
      updateGuided(accounts);
    } catch (_) {
      if (syncStatus) syncStatus.textContent = 'Erreur de chargement';
    }
  }

  // ===== Carte guidée (parcours.js) =====

  // Construit le snapshot du parcours et rafraîchit la carte guidée.
  async function updateGuided(accounts) {
    const container = document.getElementById('guided-status-card');
    if (!container) return;
    try {
      let syncStatus = null;
      let newBulletins = 0;
      try {
        const s = await Api.getSyncStatus();
        syncStatus = s.status;
        newBulletins = Number(s.new_bulletins) || 0;
      } catch (_) {
        // Hors ligne ou backend indisponible : aucun job connu — syncStatus reste null.
      }
      const cached = await Api.getCachedBulletinIds();
      const state = resolveJourneyState({
        accountCount: accounts.length,
        syncStatus,
        newBulletins,
        online: navigator.onLine !== false,
        hasCachedBulletins: cached.length > 0,
      });
      Guided.render(container, state);
    } catch (_) {
      // La carte ne doit jamais casser le refresh du dashboard.
    }
  }

  // Actions de la carte guidée (ids du contrat : voir Guided.ALLOWED_ACTIONS).
  function handleGuidedAction(actionId) {
    if (actionId === 'connect-account') {
      // Settings.openAccountForm() ouvre Réglages + formulaire + focus email.
      // settings.js est chargé après dashboard.js, mais l'appel est différé au
      // clic : la garde couvre un chargement partiel ou un ordre modifié.
      if (typeof Settings !== 'undefined' && Settings.openAccountForm) {
        Settings.openAccountForm();
      } else {
        Router.goTo('settings');
      }
      return;
    }
    if (actionId === 'start-sync' || actionId === 'retry-sync') {
      // Réutilise le flux du bouton « Mettre à jour » (garde disabled incluse).
      runSyncFlow(document.getElementById('dash-sync-now'));
      return;
    }
    if (actionId === 'view-bulletins') {
      Router.goTo('bulletins');
    }
  }

  // Formatte le statut de synchro avec la progression par tranches renvoyée
  // par /sync/status (progress = { chunk, total, year, found }).
  function syncStatusText(s) {
    const p = s && s.progress;
    if (p && Number.isInteger(p.total) && p.total > 1 && Number.isInteger(p.chunk)) {
      const base = `Scan ${p.year ? p.year + ' · ' : ''}${p.chunk}/${p.total}`;
      return s.new_bulletins > 0 ? `${base} — ${s.new_bulletins} trouvé(s)` : base;
    }
    return s.new_bulletins > 0
      ? `Mise à jour en cours... (${s.new_bulletins} nouveaux)`
      : 'Mise à jour en cours...';
  }

  // Flux de synchro partagé : bouton « Mettre à jour » et carte guidée.
  async function runSyncFlow(btn) {
    if (!btn || btn.disabled) return;
    const statusEl = document.getElementById('dash-sync-status');
    const originalHtml = btn.innerHTML;
    const originalStatus = statusEl ? statusEl.textContent : '';
    let refreshed = false;
    btn.disabled = true;
    btn.classList.add('is-busy');
    // Bouton compact : spinner seul ; la progression s'affiche dans le statut de la carte.
    btn.innerHTML = '<span class="btn-spinner"></span>';
    if (statusEl) statusEl.textContent = 'Mise à jour en cours...';
    try {
      await Api.runSync();
      const status = await Api.pollSyncStatus((s) => {
        if (statusEl) statusEl.textContent = syncStatusText(s);
      });
      if (status.status === 'done') {
        Toast.show(status.new_bulletins > 0
          ? `${status.new_bulletins} nouveau(x) bulletin(s) trouvé(s) !`
          : 'Aucun nouveau bulletin pour le moment.');
      } else if (status.status === 'failed') {
        Toast.show(status.error_message || 'Échec de la mise à jour');
      } else {
        // Garde de 2 h atteinte — la synchro continue en arrière-plan.
        Toast.show('La mise à jour prend plus de temps que prévu. Elle continue en arrière-plan.');
      }
      // Fin de synchro connue : les caches dérivés (ex. années disponibles des
      // bulletins) doivent être invalidés. C'est le signal le plus fiable —
      // émis uniquement par ce flux commun (bouton + boot).
      window.dispatchEvent(new CustomEvent('nka-sync-completed', { detail: { status } }));
      // On rafraîchit le tableau de bord ET la liste des bulletins :
      // les bulletins récents apparaissent dès que la synchro les a trouvés.
      await Promise.all([Dashboard.refresh(), Bulletins.refresh()]);
      refreshed = true;
    } catch (e) {
      Toast.show(ERR.msg(e));
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
      btn.innerHTML = originalHtml;
      // En cas d'erreur, le refresh n'a pas re-rempli le statut : on le restaure.
      if (!refreshed && statusEl) statusEl.textContent = originalStatus;
    }
  }

  function bindActions() {
    const eye = document.getElementById('amounts-eye');
    if (eye) {
      eye.addEventListener('click', toggleAmountsVisibility);
      renderAmounts();
    }
    if (NativeBridge && NativeBridge.isNative) {
      try {
        NativeBridge.onNetworkChange((c) => {
          // N'afficher l'état réseau que lorsqu'on est hors ligne ;
          // sinon, recharger le vrai statut (comptes, dernière synchro).
          if (!c) {
            document.getElementById('dash-sync-status').textContent = 'Hors ligne';
          } else {
            refresh();
          }
        });
      } catch (_) {}
    }
    document.getElementById('dash-sync-now').addEventListener('click', (e) => {
      runSyncFlow(e.currentTarget);
    });
    // Carte guidée : un seul listener pour toutes les actions du parcours.
    Guided.bind(document.getElementById('guided-status-card'), handleGuidedAction);
  }

  // Compte connecté (accounts.js) : la carte guidée doit proposer la première
  // recherche — le snapshot est re-alimenté par Dashboard.refresh().
  window.addEventListener('nka-account-added', () => {
    Dashboard.refresh();
  });

  // Si des données en cache sont servies alors que le statut est en erreur
  // ou hors ligne, adoucir le message : les données ne sont pas perdues.
  window.addEventListener('nka-cache-hit', (e) => {
    const syncStatus = document.getElementById('dash-sync-status');
    if (!syncStatus) return;
    const t = syncStatus.textContent;
    if (t === 'Erreur de chargement' || t === 'Hors ligne') {
      const cachedAt = e.detail && e.detail.cachedAt;
      syncStatus.textContent = cachedAt
        ? `Données en cache du ${new Date(cachedAt).toLocaleString('fr-FR')}`
        : 'Hors ligne — données en cache';
    }
  });

  return { refresh, bindActions, runSyncFlow };
})();
