const Settings = (() => {
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  const ACCENT_COLORS = {
    emerald: { light: '#1B6E5C', dark: '#10201C' },
    sapphire: { light: '#1E5AA8', dark: '#10201C' },
    amber: { light: '#B47800', dark: '#10201C' },
    ruby: { light: '#A5343A', dark: '#10201C' },
  };

  function updateThemeIcon(theme) {
    const el = document.getElementById('theme-icon');
    if (!el) return;
    if (theme === 'dark') {
      el.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';
    } else {
      el.innerHTML = '<path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4 6.4l-1.4-1.4M6.6 6.6L5.2 5.2m12.2 0l-1.4 1.4M6.6 17.4l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    }
  }

  function syncAccentSwatches(accent) {
    document.querySelectorAll('.accent-swatch').forEach(el => {
      el.classList.toggle('active', el.dataset.accent === accent);
    });
  }

  function applyTheme(theme, accent) {
    accent = accent || localStorage.getItem('nka_accent') || 'emerald';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-accent', accent);
    try {
      document.getElementById('dark-mode-switch').checked = theme === 'dark';
    } catch (e) {}
    syncAccentSwatches(accent);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors = ACCENT_COLORS[accent] || ACCENT_COLORS.emerald;
      meta.setAttribute('content', theme === 'dark' ? colors.dark : colors.light);
    }
    updateThemeIcon(theme);
  }

  function initTheme() {
    const saved = localStorage.getItem('nka_theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (systemDark ? 'dark' : 'light');
    const accent = localStorage.getItem('nka_accent') || 'emerald';
    applyTheme(theme, accent);
    const sw = document.getElementById('dark-mode-switch');
    if (sw) {
      sw.addEventListener('change', (e) => {
        const t = e.target.checked ? 'dark' : 'light';
        localStorage.setItem('nka_theme', t);
        applyTheme(t);
      });
    }
    document.querySelectorAll('.accent-swatch').forEach(el => {
      el.addEventListener('click', () => {
        const a = el.dataset.accent;
        localStorage.setItem('nka_accent', a);
        applyTheme(document.documentElement.getAttribute('data-theme') || 'light', a);
      });
    });
  }

  async function loadServerSettings() {
    try {
      const s = await Api.getSettings();
      document.getElementById('amounts-switch').checked = !!s.extract_amounts;
      document.getElementById('sync-frequency').value = s.sync_frequency || 'daily';
      document.getElementById('sync-hour').value = s.sync_hour ?? 8;
      document.getElementById('owner-matricule').value = s.owner_matricule || '';
      const push = document.getElementById('push-switch');
      if (push) push.checked = !!s.push_enabled;
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

  // ===== Hors ligne : préparation du cache complet =====
  function ensureOfflineCard() {
    const view = document.getElementById('view-settings');
    if (!view || document.getElementById('offline-card')) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'offline-card';
    card.innerHTML =
      '<div class="eyebrow" style="margin-bottom:12px;">Hors ligne</div>' +
      '<button class="btn btn-primary btn-full" id="prepare-offline-btn">Préparer hors ligne</button>' +
      '<div class="hint" id="offline-status" style="margin-top:10px;">Télécharge tous les bulletins pour les consulter sans connexion.</div>';
    const pushSwitch = document.getElementById('push-switch');
    const anchor = pushSwitch ? pushSwitch.closest('.card') : null;
    if (anchor && anchor.parentNode === view) view.insertBefore(card, anchor);
    else view.appendChild(card);
  }

  async function prepareOffline(btn, statusEl) {
    if (navigator.onLine === false) {
      statusEl.textContent = 'Hors ligne — impossible de préparer';
      return;
    }
    btn.disabled = true;
    try {
      const list = (await Api.getBulletins()) || [];
      const cached = new Set((await Api.getCachedBulletinIds()) || []);
      const toFetch = list.filter(b => !cached.has(String(b.id)));
      if (list.length === 0) {
        statusEl.textContent = 'Aucun bulletin à télécharger';
        return;
      }
      if (toFetch.length === 0) {
        statusEl.textContent = `Prêt : ${list.length} ${list.length > 1 ? 'bulletins disponibles' : 'bulletin disponible'} hors ligne`;
        Toast.show('Bulletins disponibles hors ligne');
        return;
      }
      const already = list.length - toFetch.length;
      let done = 0;
      statusEl.textContent =
        (already > 0 ? `${already} déjà en cache — ` : '') +
        `téléchargement de ${toFetch.length} ${toFetch.length > 1 ? 'bulletins' : 'bulletin'}…`;
      for (const b of toFetch) {
        const r = await Api.fetchBulletinBlob(b.id);
        if (r && r.objectUrl) URL.revokeObjectURL(r.objectUrl);
        done++;
        statusEl.textContent = `${already + done}/${list.length} bulletins téléchargés…`;
      }
      statusEl.textContent = `Prêt : ${list.length} ${list.length > 1 ? 'bulletins disponibles' : 'bulletin disponible'} hors ligne`;
      Toast.show('Bulletins disponibles hors ligne');
    } catch (e) {
      console.warn('[settings] prepareOffline:', e);
      statusEl.textContent = 'Échec du téléchargement (réseau ?) — réessayez.';
      Toast.show(ERR.msg(e));
    } finally {
      btn.disabled = false;
    }
  }

  function bindActions() {
    try { initTheme(); } catch (e) { console.warn('initTheme:', e); }
    loadServerSettings();

    try {
      document.getElementById('about-btn').addEventListener('click', () => Router.goTo('about'));
      document.getElementById('about-back-btn').addEventListener('click', () => Router.goTo('settings'));
      document.getElementById('about-website-btn').addEventListener('click', () => {
        NativeBridge && NativeBridge.openExternal('https://www.glocal-innov.com')
          .catch(e => Toast.show(ERR.msg(e)));
      });
      const verEl = document.getElementById('about-version');
      if (verEl) verEl.textContent = 'Version ' + (APP_VERSION || '2.1.0');
    } catch (e) { console.warn('about:', e); }

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
          const syncHour = Number(document.getElementById('sync-hour').value);
          if (!Number.isInteger(syncHour) || syncHour < 0 || syncHour > 23) {
            Toast.show('L\'heure de synchronisation doit être un nombre entier entre 0 et 23.');
            return;
          }
          await Api.saveSettings({
            syncFrequency: document.getElementById('sync-frequency').value,
            syncHour,
            extractAmounts: document.getElementById('amounts-switch').checked,
            ownerMatricule: document.getElementById('owner-matricule').value.trim(),
          });
          if (document.getElementById('amounts-switch').checked) {
            Toast.show('Analyse des bulletins en cours...');
            Api.reprocessAmounts().then(r => {
              if (r.processed > 0) Toast.show(`${r.processed} bulletin(s) analysé(s) avec succès`);
              Dashboard.refresh();
            }).catch(e => console.warn('[settings]', e.message || e));
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
          await Api.unsubscribePush().catch(e => console.warn('[settings]', e.message || e));
          Toast.show('Notifications désactivées.');
        }
      });
    } catch (e) { console.warn('push-switch:', e); }

    try {
      ensureOfflineCard();
      const offBtn = document.getElementById('prepare-offline-btn');
      if (offBtn) {
        offBtn.addEventListener('click', () => {
          prepareOffline(offBtn, document.getElementById('offline-status'));
        });
      }
    } catch (e) { console.warn('prepare-offline:', e); }

    try {
      document.getElementById('change-pin-btn').addEventListener('click', () => {
        Pin.promptChangePin();
      });
    } catch (e) { console.warn('change-pin:', e); }

    try {
      document.getElementById('rescan-all-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!confirm('Cela va re-scanner TOUS vos emails depuis le début. Les bulletins déjà importés ne seront pas dupliqués. Continuer ?')) return;
        btn.disabled = true;
        btn.textContent = 'Réinitialisation...';
        try {
          await Api.resetSync();
          Toast.show('Synchronisation réinitialisée. Lancez une synchro pour tout re-scanner.');
          Dashboard.refresh();
        } catch (e) {
          Toast.show(ERR.msg(e));
        } finally {
          btn.disabled = false;
          btn.textContent = '⟳ Tout re-scanner depuis le début';
        }
      });
    } catch (e) { console.warn('rescan-btn:', e); }
  }

  return { bindActions, applyTheme };
})();
