const VERSION = 'v9';
window.APP_VERSION = VERSION;

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
    try { await navigator.serviceWorker.register('/sw.js'); }
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

  const backendOk = await Api.ensureDevice().then(() => true).catch((e) => {
    Toast.show(ERR.msg(e));
    return false;
  });

  safe('Dashboard.refresh', () => Dashboard.refresh());
  safe('Bulletins.refresh', () => Bulletins.refresh());
  safe('Accounts.refresh',  () => Accounts.refresh());
  Router.goTo('dashboard');
  showVersion();

  if (!backendOk) retryBackend();
}

function showVersion() {
  const el = document.getElementById('app-version');
  if (el) el.textContent = 'v' + VERSION;
}

let retryCount = 0;
async function retryBackend() {
  const ok = await Api.ensureDevice().then(() => true).catch(() => false);
  if (ok) {
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

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  Pin.start(bootApp);
});
