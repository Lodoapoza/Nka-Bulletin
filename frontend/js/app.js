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
  const views = ['dashboard', 'bulletins', 'settings'];
  const HEADER_LABELS = { dashboard: 'Tableau de bord', bulletins: 'Mes bulletins', settings: 'Paramètres' };

  function goTo(viewName) {
    views.forEach(v => {
      document.getElementById(`view-${v}`).classList.toggle('hidden', v !== viewName);
    });
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    document.getElementById('header-sub').textContent = HEADER_LABELS[viewName];

    if (viewName === 'dashboard') Dashboard.refresh();
    if (viewName === 'bulletins') Bulletins.refresh();
    if (viewName === 'settings') Accounts.refresh();
  }

  function bind() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.view));
    });
  }

  return { bind, goTo };
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
  safe('Settings',  () => Settings.bindActions());
  safe('Keyboard',  () => NativeBridge && NativeBridge.ensureKeyboard && NativeBridge.ensureKeyboard());

  const backendOk = await Api.ensureDevice().then(() => true).catch((e) => {
    Toast.show(ERR.msg(e));
    return false;
  });

  safe('Dashboard.refresh', () => Dashboard.refresh());
  safe('Bulletins.refresh', () => Bulletins.refresh());
  safe('Accounts.refresh',  () => Accounts.refresh());
  Router.goTo('dashboard');
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

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  Pin.start(bootApp);
});
