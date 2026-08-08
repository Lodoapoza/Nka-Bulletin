const VERSION = APP_VERSION || '2.0.0';

const Toast = (() => {
  let queue = [];
  let timer;
  let showing = false;

  function show(message, duration = 3200) {
    const el = document.getElementById('toast');
    if (!el) return;
    if (showing) { queue.push({ message, duration }); return; }
    showing = true;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.classList.remove('show');
      showing = false;
      if (queue.length) { const n = queue.shift(); setTimeout(() => show(n.message, n.duration), 100); }
    }, duration);
  }
  return { show };
})();

const ERR = (() => {
  const map = {
    '503': 'Serveur indisponible',
    '502': 'Serveur indisponible',
    '401': 'Session expirée',
    '429': 'Trop de requêtes',
    '500': 'Erreur serveur',
  };
  function msg(e) {
    if (!e) return '';
    const m = (e.message || e || '').toString();
    const code = m.match(/\((\d+)\)$/)?.[1];
    if (code && map[code]) return map[code];
    if (/Failed to fetch|NetworkError|network|navigator\.onLine/.test(m)) return 'Pas de connexion';
    if (/injoignable|Backend/.test(m)) return 'Serveur indisponible';
    if (/timeout/.test(m)) return 'Serveur trop lent';
    if (/expiré|invalide|Token/.test(m)) return 'Session expirée';
    if (/Notifications|push/i.test(m)) return 'Notifications désactivées';
    return m.length > 60 ? m.slice(0, 57) + '...' : m;
  }
  return { msg };
})();

const Router = (() => {
  const views = ['dashboard', 'bulletins', 'analyse', 'settings'];
  const TITLES = { dashboard: 'Accueil', bulletins: 'Mes bulletins', analyse: 'Analyse', settings: 'Réglages', about: 'À propos' };

  function goTo(viewName) {
    views.forEach(v => {
      document.getElementById(`view-${v}`).classList.toggle('hidden', v !== viewName);
    });
    const aboutView = document.getElementById('view-about');
    if (aboutView) aboutView.classList.toggle('hidden', viewName !== 'about');
    document.querySelectorAll('.nav-item').forEach(btn => {
      const active = viewName === 'about' ? btn.dataset.view === 'settings' : btn.dataset.view === viewName;
      btn.classList.toggle('active', active);
    });
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = TITLES[viewName];

    if (viewName === 'dashboard') Dashboard.refresh();
    if (viewName === 'bulletins') Bulletins.refresh();
    if (viewName === 'analyse') Analyse.refresh();
    if (viewName === 'settings') Accounts.refresh();
  }

  function bind() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.view));
    });
  }

  return { bind, goTo };
})();

/* ===== Liaison multi-appareils =====
   Écran plein écran affiché au boot quand l'appareil n'est pas encore
   relié à un compte (user_matricule absent). Le code de liaison se crée
   dans Réglages, sur un appareil déjà connecté. */
const LinkScreen = (() => {
  const screen = document.getElementById('link-screen');
  const matInput = document.getElementById('link-matricule-input');
  const codeInput = document.getElementById('link-code-input');
  const errorEl = document.getElementById('link-error');
  const submitBtn = document.getElementById('link-submit-btn');

  function show() {
    if (!screen) return;
    if (matInput) matInput.value = '';
    if (codeInput) codeInput.value = '';
    if (errorEl) errorEl.textContent = '';
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Lier cet appareil'; }
    screen.classList.remove('hidden');
    if (matInput) setTimeout(() => matInput.focus(), 60);
  }

  async function submit() {
    if (!matInput || !codeInput || !errorEl || !submitBtn) return;
    errorEl.textContent = '';
    const matricule = matInput.value.trim().toUpperCase();
    const code = codeInput.value.trim().toUpperCase();
    if (!matricule) { errorEl.textContent = 'Saisissez votre matricule.'; return; }
    if (code.length !== 6) { errorEl.textContent = 'Le code de liaison comporte 6 caractères.'; return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Liaison en cours…';
    try {
      const res = await Api.linkDevice(matricule, code);
      if (!res || !res.token) throw new Error('Réponse inattendue du serveur');
      // Stockage comme register-device, puis redémarrage propre de l'app.
      if (res.deviceId) localStorage.setItem('nka_device_id', res.deviceId);
      localStorage.setItem('nka_token', res.token);
      location.reload();
    } catch (e) {
      const m = String((e && e.message) || e || '');
      errorEl.textContent = /401|incorrect|invalide/i.test(m)
        ? 'Code de liaison incorrect. Vérifiez le matricule et le code, puis réessayez.'
        : (ERR.msg(e) || 'Impossible de lier cet appareil. Réessayez plus tard.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Lier cet appareil';
    }
  }

  function bind() {
    if (!screen || !submitBtn) return;
    submitBtn.addEventListener('click', submit);
    if (codeInput) {
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().slice(0, 6);
      });
    }
    [matInput, codeInput].forEach(inp => {
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
  }

  return { bind, show };
})();

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sworker.js'); }
    catch (e) { console.warn('Service worker non enregistré :', e); }
  }
}

async function bootApp() {
  const safe = (label, fn) => { try { fn(); } catch (e) { console.warn('boot:' + label, e); } };

  safe('Router',    () => Router.bind());
  safe('Dashboard', () => Dashboard.bindActions());
  safe('Accounts',  () => Accounts.bindForm());
  safe('Bulletins', () => Bulletins.bindActions());
  safe('Analyse',   () => Analyse.bindActions());
  safe('Settings',  () => Settings.bindActions());
  safe('Keyboard',  () => NativeBridge && NativeBridge.ensureKeyboard && NativeBridge.ensureKeyboard());
  safe('LinkScreen', () => LinkScreen.bind());

  const backendOk = await Api.ensureDevice().then(() => true).catch((e) => {
    Toast.show(ERR.msg(e));
    return false;
  });

  safe('Dashboard.refresh', () => Dashboard.refresh());
  safe('Bulletins.refresh', () => Bulletins.refresh());
  safe('Accounts.refresh',  () => Accounts.refresh());

  // État serveur : options + liaison multi-appareils.
  // En cas d'échec (hors ligne), on garde l'accès au mode cache.
  let settings = null;
  if (backendOk) {
    settings = await Api.getSettings().catch(() => null);
  }
  applyAnalyseNav(!!(settings && settings.extract_amounts));

  // Appareil non lié : l'écran de liaison remplace l'accueil.
  if (backendOk && settings && !settings.user_matricule) {
    LinkScreen.show();
  } else {
    Router.goTo('dashboard');
  }
  showVersion();
  initConnectionBadge();

  if (backendOk) {
    Api.runSync().then(() => {
      // Poll le statut de la synchro automatique au démarrage
      const poll = async () => {
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 1500));
          const status = await Api.getSyncStatus();
          if (status.status === 'done') {
            if (status.new_bulletins > 0) {
              Toast.show(`${status.new_bulletins} nouveau(x) bulletin(s) trouvé(s) !`);
              Dashboard.refresh();
              Bulletins.refresh();
            }
            return;
          }
          if (status.status === 'failed') return;
        }
      };
      poll();
    }).catch(e => console.warn('[app]', e.message || e));
  } else {
    retryBackend();
  }
}

function showVersion() {
  const el = document.getElementById('app-version');
  if (el) el.textContent = 'v' + VERSION;
}

function updateConnectionBadge(online) {
  const badge = document.getElementById('connection-badge');
  if (!badge) return;
  if (online) {
    badge.classList.remove('visible');
    badge.textContent = '';
  } else {
    badge.textContent = 'Hors connexion';
    badge.classList.add('visible');
  }
}

function setReconnecting() {
  const badge = document.getElementById('connection-badge');
  if (!badge) return;
  badge.textContent = 'Reconnexion…';
  badge.classList.add('visible');
}

function initConnectionBadge() {
  const setOnline = () => updateConnectionBadge(true);
  const setOffline = () => updateConnectionBadge(false);

  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOffline);

  // État initial
  updateConnectionBadge(navigator.onLine);

  // Polling de rattrapage toutes les 10s si hors-ligne
  let pollCount = 0;
  const pollTimer = setInterval(() => {
    if (navigator.onLine) {
      updateConnectionBadge(true);
      pollCount = 0;
    } else {
      pollCount++;
      // Après 60s sans connexion, espace le polling
      if (pollCount > 6) clearInterval(pollTimer);
    }
  }, 10000);
}

let retryCount = 0;
async function retryBackend() {
  setReconnecting();
  const ok = await Api.ensureDevice().then(() => true).catch(() => false);
  if (ok) {
    retryCount = 0;
    updateConnectionBadge(true);
    // L'appareil a pu démarrer hors ligne sans être lié : on re-vérifie
    // la liaison avant de reprendre le mode normal.
    const s = await Api.getSettings().catch(() => null);
    if (s && !s.user_matricule) { LinkScreen.show(); return; }
    Toast.show('Backend reconnecté.');
    Dashboard.refresh();
    Bulletins.refresh();
    Accounts.refresh();
    return;
  }
  retryCount++;
  const delay = Math.min(30000, 5000 * retryCount);
  setTimeout(retryBackend, delay);
}

window.addEventListener('nka-connection', (e) => {
  const state = e.detail;
  if (state === 'online') {
    retryCount = 0;
    updateConnectionBadge(true);
  } else if (state === 'reconnecting') {
    setReconnecting();
  } else if (state === 'offline') {
    updateConnectionBadge(false);
  }
});

function applyAnalyseNav(enabled) {
  const btn = document.querySelector('.nav-item[data-view="analyse"]');
  if (btn) btn.style.display = enabled ? '' : 'none';
  // Si on est sur la vue Analyse pendant que l'option est coupée, repartir sur l'Accueil.
  if (!enabled) {
    const view = document.getElementById('view-analyse');
    if (view && !view.classList.contains('hidden')) Router.goTo('dashboard');
  }
}

window.addEventListener('nka-amounts-changed', (e) => {
  applyAnalyseNav(!!(e.detail && e.detail.enabled));
});

/* ===== Bandeau « données en cache » =====
   Affiché quand le service worker ou le client sert des données
   depuis un cache (événement nka-cache-hit), retiré au retour du réseau.
   Styles alignés sur les tokens du design system (app.css). */
function showOfflineCacheBanner(e) {
  const cachedAt = e && e.detail && e.detail.cachedAt;
  const label = cachedAt
    ? `Hors ligne — données en cache du ${new Date(cachedAt).toLocaleString('fr-FR')}`
    : 'Hors ligne — données en cache';

  // Un seul bandeau : s'il existe déjà, on met juste à jour la date si elle arrive.
  const existing = document.getElementById('offline-cache-banner');
  if (existing) {
    if (cachedAt) {
      const text = existing.querySelector('span');
      if (text) text.textContent = label;
    }
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'offline-cache-banner';
  banner.setAttribute('role', 'status');
  banner.style.cssText = [
    'position: sticky',
    'top: 0',
    'z-index: 60',
    'display: flex',
    'align-items: center',
    'justify-content: space-between',
    'gap: 12px',
    'background: var(--md-primary-container)',
    'color: var(--md-on-primary-container)',
    'padding: calc(8px + env(safe-area-inset-top, 0px)) 16px 8px',
    'font-family: var(--font-body)',
    'font-size: 0.8rem',
    'font-weight: 600',
    'box-shadow: var(--shadow-soft)',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = label;

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer');
  close.textContent = '×';
  close.style.cssText = [
    'background: transparent',
    'border: none',
    'color: inherit',
    'font-size: 1.15rem',
    'line-height: 1',
    'padding: 2px 8px',
    'cursor: pointer',
    'border-radius: 50%',
    'flex-shrink: 0',
  ].join(';');
  close.addEventListener('click', () => banner.remove());

  banner.appendChild(text);
  banner.appendChild(close);
  document.body.insertBefore(banner, document.body.firstChild);
}

window.addEventListener('nka-cache-hit', (e) => showOfflineCacheBanner(e));
window.addEventListener('nka-connection', (e) => {
  if (e.detail === 'online') {
    const banner = document.getElementById('offline-cache-banner');
    if (banner) banner.remove();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  Pin.start(bootApp);
});
