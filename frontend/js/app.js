const VERSION = APP_VERSION || '2.0.0';

// ===== Migration de version non destructive =====
// Un changement de version ne doit jamais supprimer le compte, les bulletins
// ou la session de l'utilisateur. Les caches sont invalides par le Service
// Worker et les URLs versionnees ; on conserve donc les donnees privees.
(() => {
  try {
    if (localStorage.getItem('nka_app_version') !== APP_VERSION) {
      localStorage.setItem('nka_app_version', APP_VERSION);
    }
  } catch (_) {}
})();
const Toast = (() => {
  let queue = [];
  let timer;
  let chainTimer;
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
      if (queue.length) { const n = queue.shift(); chainTimer = setTimeout(() => show(n.message, n.duration), 100); }
    }, duration);
  }
  function hide() {
    clearTimeout(timer);
    clearTimeout(chainTimer);
    const el = document.getElementById('toast');
    if (el) el.classList.remove('show');
    showing = false;
    queue = [];
  }
  return { show, hide };
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
    if (/Aucun compte e-mail|NO_MAIL_ACCOUNT/i.test(m)) return 'Aucun compte e-mail configuré. Ouvrez Réglages pour connecter une boîte mail.';
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

    // Remise à zéro du scroll avant d'afficher la nouvelle vue.
    // Sans ça, la nouvelle vue s'ouvrait à la position de scroll de la précédente et le
    // navigateur réajustait la hauteur du document au changement de vue : saut visible.
    // Aucune vue ne conserve son propre scroll : le reset est toujours le bon comportement.
    window.scrollTo(0, 0);

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

// ===== Rechargement de version deferé =====
// Une mise à jour du service worker ne doit jamais couper l'utilisateur en
// pleine saisie de son code PIN. On mémorise la demande et on ne recharge
// qu'une fois #pin-screen masqué, avec un court délai de grâce pour laisser
// le tableau de bord s'afficher.
const VersionReload = (() => {
  const GRACE_MS = 3000;
  const POLL_MS = 500;
  const SCREEN_ID = 'pin-screen';

  let pending = false;
  let scheduled = false;
  let pollTimer = null;
  let graceTimer = null;

  function pinScreenGone() {
    const el = document.getElementById(SCREEN_ID);
    // Fail-open : si l'écran n'existe plus (HTML inattendu), on ne bloque
    // jamais indéfiniment une mise à jour.
    return !el || el.classList.contains('hidden');
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function apply() {
    if (scheduled || !pending) return;
    if (!pinScreenGone()) return; // l'intervalle réessaiera
    scheduled = true;
    stopPolling();
    // Le toast n'est émis qu'ici : jamais pendant la saisie du code PIN.
    Toast.show('Mise à jour en cours d\'application...', GRACE_MS);
    graceTimer = setTimeout(() => {
      // L'utilisateur peut être revenu sur l'écran PIN pendant la grâce
      // (« Changer le code PIN » depuis Réglages). Dans ce cas on ne recharge
      // pas : on repart en attente plutôt que de couper la saisie.
      if (pinScreenGone()) {
        window.location.reload();
        return;
      }
      scheduled = false;
      Toast.hide();
      pollTimer = setInterval(apply, POLL_MS);
    }, GRACE_MS);
  }

  function request() {
    if (pending) return; // demande déjà en attente : une seule programmation
    pending = true;
    // L'intervalle n'existe que tant qu'une mise à jour attend.
    pollTimer = setInterval(apply, POLL_MS);
    apply();
  }

  return { request };
})();

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sworker-v2.js', { updateViaCache: 'none' });

      // Periodic Background Sync : enregistrer pour sync auto quotidienne
      if ('periodicSync' in reg) {
        try {
          const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (status.state === 'granted') {
            await reg.periodicSync.register('nka-periodic-sync', {
              minInterval: 24 * 60 * 60 * 1000, // 24h
            });
            console.log('[app] Periodic background sync enregistrée (24h)');
          }
        } catch (e) {
          console.warn('[app] Periodic Sync registration:', e.message);
        }
      }

      // 1. Détecter mise à jour SW en attente (reg.onupdatefound)
      let refreshing = false;
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Nouveau SW installé et en attente (si skipWaiting pas immédiat)
            console.log('[app] Nouveau SW installé, en attente d\'activation');
            VersionReload.request();
          }
        });
      });

      // 2. Écouter le changement de controller (nouveau SW actif) -> demander
      // le rechargement, qui sera différé hors écran PIN par VersionReload.
      let controllerChangeHandled = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (controllerChangeHandled) return;
        controllerChangeHandled = true;
        console.log('[app] Controller changé, mise à jour demandée');
        VersionReload.request();
      });

      // 3. Écouter les messages du SW (fallback iOS + background sync + notification mise à jour)
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (!event.data || !event.data.type) return;
        if (event.data.type === 'nka-notification-click' && event.data.url) {
          const hashIndex = event.data.url.indexOf('#');
          const view = hashIndex > -1 ? event.data.url.substring(hashIndex + 1) : 'dashboard';
          Router.goTo(view);
          window.focus();
        } else if (event.data.type === 'nka-background-sync') {
          console.log('[app] Background sync déclenchée, lancement de la sync...');
          Api.getAccounts().then(accounts => {
            if (accounts.length > 0) {
              const btn = document.getElementById('dash-sync-now');
              if (btn && Dashboard.runSyncFlow) Dashboard.runSyncFlow(btn);
            }
          }).catch(e => console.warn('[app] Background sync check failed:', e.message || e));
        } else if (event.data.type === 'nka-sw-updated') {
          // Nouveau SW activé (via activate event) -> demander le rechargement,
          // différé hors écran PIN par VersionReload.
          console.log('[app] SW mis à jour reçu, demande de rechargement');
          VersionReload.request();
        }
      });
    } catch (e) { console.warn('Service worker non enregistré :', e); }
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

  const backendOk = await Api.ensureDevice().then(() => true).catch((e) => {
    Toast.show(ERR.msg(e));
    return false;
  });

  safe('Dashboard.refresh', () => Dashboard.refresh());
  safe('Bulletins.refresh', () => Bulletins.refresh());
  safe('Accounts.refresh',  () => Accounts.refresh());

  // Pull-to-refresh
  initPullToRefresh();

  // État serveur : options + liaison multi-appareils.
  // En cas d'échec (hors ligne), on garde l'accès au mode cache.
  let settings = null;
  if (backendOk) {
    settings = await Api.getSettings().catch(() => null);
  }
  applyAnalyseNav(!!(settings && settings.extract_amounts));

  // L'app démarre toujours sur l'accueil ; le rattachement à un compte
  // (email) se fait dans Réglages, carte « Compte ».
  // goTo('dashboard') re-demande Dashboard.refresh() : la garde interne du
  // module (refreshPromise) coalesce avec le refresh lancé ci-dessus.
  Router.goTo('dashboard');
  showVersion();
  initConnectionBadge();

  if (backendOk) {
    // Synchro de démarrage via le flux commun du bouton « Mettre à jour »
    // (dashboard.js : runSync + poll + toasts + refresh) — plus de boucle de
    // poll locale. Uniquement si un compte existe et qu'aucun job
    // pending/running n'est déjà actif. Le flux désactive le bouton pendant
    // son exécution : la garde `disabled` empêche tout double run/poll
    // (boot + clic utilisateur).
    Api.getAccounts()
      .then((accounts) => {
        if (!accounts.length) return null;
        return Api.getSyncStatus().then((s) => s.status);
      })
      .then((status) => {
        if (!status || status === 'pending' || status === 'running') return;
        const btn = document.getElementById('dash-sync-now');
        if (btn && Dashboard.runSyncFlow) Dashboard.runSyncFlow(btn);
      })
      .catch((e) => console.warn('[app] sync boot:', e.message || e));
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

/* ===== Pull-to-refresh PWA =====
   Sur mobile : tirer vers le bas pour rafraîchir la vue courante.
   Ne s'active que si on est au sommet de la page (scrollY === 0). */
function initPullToRefresh() {
  let startY = 0;
  let currentY = 0;
  let pulling = false;
  let triggered = false;

  const indicator = document.createElement('div');
  indicator.id = 'ptr-indicator';
  indicator.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 50%',
    'transform: translateX(-50%) translateY(-120%)',
    'width: 40px',
    'height: 40px',
    'border-radius: 50%',
    'border: 2px solid var(--md-primary)',
    'border-top-color: transparent',
    'opacity: 0',
    'pointer-events: none',
    'z-index: 1000',
    'transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s',
    'animation: ptr-spin 0.8s linear infinite',
  ].join(';');

  // Keyframes pour le spinner
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ptr-spin { to { transform: translateX(-50%) translateY(-120%) rotate(360deg); } }
  `;
  document.head.appendChild(style);
  document.body.appendChild(indicator);

  function showIndicator(progress) {
    const maxPull = 80;
    const y = Math.min(progress, maxPull);
    indicator.style.opacity = y / maxPull;
    indicator.style.transform = `translateX(-50%) translateY(calc(-120% + ${y}px))`;
  }

  function hideIndicator() {
    indicator.style.opacity = '0';
    indicator.style.transform = 'translateX(-50%) translateY(-120%)';
  }

  function triggerRefresh() {
    if (triggered) return;
    triggered = true;
    hideIndicator();
    Toast.show('Actualisation…');
    // Déclencher le refresh de la vue active
    const activeView = document.querySelector('.view:not(.hidden)');
    if (activeView) {
      const viewId = activeView.id.replace('view-', '');
      const refreshMap = {
        dashboard: () => Dashboard.refresh(),
        bulletins: () => Bulletins.refresh(),
        analyse: () => Analyse.refresh(),
        settings: () => Accounts.refresh(),
      };
      if (refreshMap[viewId]) refreshMap[viewId]();
    }
    setTimeout(() => { triggered = false; }, 1000);
  }

  window.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0 && !pulling) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    currentY = e.touches[0].clientY;
    const delta = currentY - startY;
    if (delta > 0) {
      e.preventDefault();
      showIndicator(delta * 0.5);
      if (delta > 60) {
        indicator.style.borderColor = 'var(--md-primary)';
        indicator.style.borderTopColor = 'var(--md-primary)';
      }
    }
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    const delta = currentY - startY;
    if (delta > 60) {
      triggerRefresh();
    } else {
      hideIndicator();
    }
  }, { passive: true });
}

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
    'font-family: var(--font-body)',
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
