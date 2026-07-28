const Dashboard = (() => {
  const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

  function formatCurrency(n) {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('fr-FR').format(n) + ' XOF';
  }

  async function refresh() {
    try {
      const stats = await Api.getStats();
      document.getElementById('dash-year-label').textContent = new Date().getFullYear();
      document.getElementById('dash-total').textContent = stats.totalThisYear;

      const latestTitleEl = document.getElementById('dash-latest-title');
      const openBtn = document.getElementById('dash-latest-open');
      if (stats.latest) {
        latestTitleEl.textContent = `Bulletin de ${MONTHS_FR[stats.latest.month - 1]} ${stats.latest.year}`;
        openBtn.style.display = 'inline-flex';
        openBtn.onclick = () => window.open(Api.downloadBulletin(stats.latest.id), '_blank');
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
      Toast.show(`Impossible de charger le tableau de bord : ${e.message}`);
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
    } catch (_) {}
  }

  function bindActions() {
    if (NativeBridge.isNative) {
      let connected = true;
      NativeBridge.onNetworkChange((c) => {
        connected = c;
        document.getElementById('dash-sync-status').textContent = c ? 'Connecté' : 'Hors ligne';
      });
    }
    document.getElementById('dash-sync-now').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Synchronisation...';
      try {
        const result = await Api.runSync();
        Toast.show(result.newBulletins > 0
          ? `${result.newBulletins} nouveau(x) bulletin(s) trouvé(s) !`
          : 'Aucun nouveau bulletin pour le moment.');
        await refresh();
      } catch (e) {
        Toast.show(`Échec de la synchronisation : ${e.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Synchroniser';
      }
    });
  }

  return { refresh, bindActions };
})();
