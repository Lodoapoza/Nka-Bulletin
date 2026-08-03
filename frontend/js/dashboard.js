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

  async function refresh() {
    const syncStatus = document.getElementById('dash-sync-status');
    if (syncStatus) syncStatus.textContent = 'Chargement...';
    try {
      const stats = await Api.getStats();
      document.getElementById('dash-year-label').textContent = new Date().getFullYear();
      document.getElementById('dash-total').textContent = stats.totalThisYear;

      const latestTitleEl = document.getElementById('dash-latest-title');
      const openBtn = document.getElementById('dash-latest-open');
      if (stats.latest) {
        latestTitleEl.textContent = `Bulletin de ${MONTHS_FR[stats.latest.month - 1]} ${stats.latest.year}`;
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
      if (syncStatus) syncStatus.textContent = 'Erreur de chargement';
    }

    try {
      const accounts = await Api.getAccounts();
      const statusEl = document.getElementById('dash-sync-status');
      if (!accounts.length) {
        statusEl.textContent = 'Connectez une messagerie pour démarrer';
      } else {
        const lastSync = accounts.map(a => a.last_sync_at).filter(Boolean).sort().pop();
        statusEl.textContent = lastSync
          ? `Dernière synchro : ${new Date(lastSync).toLocaleString('fr-FR')}`
          : 'Jamais synchronisé';
      }
    } catch (_) {
      if (syncStatus) syncStatus.textContent = 'Erreur de chargement';
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
    document.getElementById('dash-sync-now').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Synchro en cours...';
      try {
        await Api.runSync();
        // Poll jusqu'à ce que la synchro soit terminée
        let status;
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 1500));
          status = await Api.getSyncStatus();
          if (status.status === 'done' || status.status === 'failed') break;
        }
        if (status.status === 'done') {
          Toast.show(status.new_bulletins > 0
            ? `${status.new_bulletins} nouveau(x) bulletin(s) trouvé(s) !`
            : 'Aucun nouveau bulletin pour le moment.');
        } else if (status.status === 'failed') {
          Toast.show(status.error_message || 'Échec de la synchronisation');
        }
        await refresh();
      } catch (e) {
        Toast.show(ERR.msg(e));
      } finally {
        btn.disabled = false;
        btn.textContent = 'Synchroniser';
      }
    });
  }

  return { refresh, bindActions };
})();
