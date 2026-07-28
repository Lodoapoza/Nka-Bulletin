const Toast = (() => {
  let timer;
  function show(message, duration = 3200) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), duration);
  }
  return { show };
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

  await Api.ensureDevice().catch(() => {
    Toast.show('Backend injoignable — vérifiez NKA_API_BASE / votre connexion.');
  });

  safe('Dashboard.refresh', () => Dashboard.refresh());
  safe('Bulletins.refresh', () => Bulletins.refresh());
  safe('Accounts.refresh',  () => Accounts.refresh());
  Router.goTo('dashboard');
}

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  Pin.start(bootApp);
});
