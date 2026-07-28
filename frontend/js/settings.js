const Settings = (() => {
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('dark-mode-switch').checked = theme === 'dark';
    document.querySelector('meta[name="theme-color"]').setAttribute(
      'content', theme === 'dark' ? '#10201C' : '#1B6E5C'
    );
  }

  function initTheme() {
    const saved = localStorage.getItem('nka_theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (systemDark ? 'dark' : 'light'));

    document.getElementById('dark-mode-switch').addEventListener('change', (e) => {
      const theme = e.target.checked ? 'dark' : 'light';
      localStorage.setItem('nka_theme', theme);
      applyTheme(theme);
    });
  }

  async function loadServerSettings() {
    try {
      const s = await Api.getSettings();
      document.getElementById('amounts-switch').checked = !!s.extract_amounts;
      document.getElementById('sync-frequency').value = s.sync_frequency || 'daily';
      document.getElementById('sync-hour').value = s.sync_hour ?? 8;
    } catch (e) { /* backend peut-être hors ligne au premier chargement */ }
  }

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      Toast.show("Les notifications ne sont pas prises en charge sur cet appareil.");
      return false;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await Api.getVapidKey();
      if (!publicKey) { Toast.show('Notifications indisponibles : clé VAPID non configurée côté serveur.'); return false; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await Api.subscribePush(sub);
      return true;
    } catch (e) {
      Toast.show(`Échec de l'activation des notifications : ${e.message}`);
      return false;
    }
  }

  function bindActions() {
    initTheme();
    loadServerSettings();

    document.getElementById('save-settings-btn').addEventListener('click', async () => {
      try {
        await Api.saveSettings({
          syncFrequency: document.getElementById('sync-frequency').value,
          syncHour: Number(document.getElementById('sync-hour').value),
          extractAmounts: document.getElementById('amounts-switch').checked,
        });
        Toast.show('Paramètres enregistrés.');
        Dashboard.refresh();
      } catch (e) { Toast.show(`Erreur : ${e.message}`); }
    });

    document.getElementById('push-switch').addEventListener('change', async (e) => {
      if (e.target.checked) {
        const ok = await enablePush();
        if (!ok) e.target.checked = false;
        else Toast.show('Notifications activées.');
      } else {
        await Api.unsubscribePush().catch(() => {});
        Toast.show('Notifications désactivées.');
      }
    });

    document.getElementById('change-pin-btn').addEventListener('click', () => {
      Pin.promptChangePin();
    });
  }

  return { bindActions, applyTheme };
})();
