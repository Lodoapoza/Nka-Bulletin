const Settings = (() => {
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  function updateThemeIcon(theme) {
    const el = document.getElementById('theme-icon');
    if (!el) return;
    if (theme === 'dark') {
      el.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';
    } else {
      el.innerHTML = '<path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4 6.4l-1.4-1.4M6.6 6.6L5.2 5.2m12.2 0l-1.4 1.4M6.6 17.4l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      document.getElementById('dark-mode-switch').checked = theme === 'dark';
    } catch (e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#10201C' : '#1B6E5C');
    updateThemeIcon(theme);
  }

  function initTheme() {
    const saved = localStorage.getItem('nka_theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (systemDark ? 'dark' : 'light'));
    const sw = document.getElementById('dark-mode-switch');
    if (sw) {
      sw.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        localStorage.setItem('nka_theme', theme);
        applyTheme(theme);
      });
    }
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
    if (typeof NativeBridge !== 'undefined' && NativeBridge.isNative) {
      try {
        await NativeBridge.registerPush();
        return true;
      } catch (e) {
        Toast.show(ERR.msg(e));
        return false;
      }
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      Toast.show("Les notifications ne sont pas prises en charge sur cet appareil.");
      return false;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await Api.getVapidKey();
      if (!publicKey) { Toast.show('Notifications désactivées'); return false; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await Api.subscribePush(sub);
      return true;
    } catch (e) {
      Toast.show(ERR.msg(e));
      return false;
    }
  }

  function bindActions() {
    try { initTheme(); } catch (e) { console.warn('initTheme:', e); }
    loadServerSettings();

    try {
      document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const theme = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('nka_theme', theme);
        applyTheme(theme);
      });
    } catch (e) { console.warn('theme-toggle:', e); }

    try {
      document.getElementById('save-settings-btn').addEventListener('click', async () => {
        try {
          await Api.saveSettings({
            syncFrequency: document.getElementById('sync-frequency').value,
            syncHour: Number(document.getElementById('sync-hour').value),
            extractAmounts: document.getElementById('amounts-switch').checked,
          });
          if (document.getElementById('amounts-switch').checked) {
            Toast.show('Analyse des bulletins en cours...');
            Api.reprocessAmounts().then(r => {
              if (r.processed > 0) Toast.show(`${r.processed} bulletin(s) analysé(s) avec succès`);
              Dashboard.refresh();
            }).catch(() => {});
          }
          Toast.show('Paramètres enregistrés.');
          Dashboard.refresh();
        } catch (e) { Toast.show(ERR.msg(e)); }
      });
    } catch (e) { console.warn('save-settings:', e); }

    try {
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
    } catch (e) { console.warn('push-switch:', e); }

    try {
      document.getElementById('change-pin-btn').addEventListener('click', () => {
        Pin.promptChangePin();
      });
    } catch (e) { console.warn('change-pin:', e); }
  }

  return { bindActions, applyTheme };
})();
