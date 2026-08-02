const Dashboard = (() => {
  const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

  function formatCurrency(n) {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('fr-FR').format(n) + ' XOF';
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
        document.getElementById('dash-last-net').textContent = formatCurrency(stats.lastNetAmount);
        document.getElementById('dash-cumul-net').textContent = formatCurrency(stats.cumulativeNetThisYear);
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
    if (NativeBridge && NativeBridge.isNative) {
      try {
        NativeBridge.onNetworkChange((c) => {
          document.getElementById('dash-sync-status').textContent = c ? 'Connecté' : 'Hors ligne';
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
