import { formatCurrency, formatDate, formatFileSize, formatRelativeDate,
         getMonthName, getMonthNameShort, debounce, getYears, getMonths, showToast, showConfirmDialog } from './utils.js';
import api from './api.js';

const state = {
  theme: 'system',
  accounts: [],
  settings: {},
  currentPage: 'unlock',
  bulletins: [],
  selectedBulletins: new Set(),
  multiSelect: false,
  hasPassword: false,
  sessionToken: localStorage.getItem('nka-session')
};

const pageCache = {};

const App = {
  async init() {
    await this.checkPasswordStatus();
    await this.loadSettings();
    await this.loadAccounts();
    this.initTheme();
    this.initRouter();
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },

  async checkPasswordStatus() {
    try {
      const res = await api.getPasswordStatus();
      state.hasPassword = res.hasPassword;
    } catch {
      state.hasPassword = true;
    }
  },

  async loadSettings() {
    try {
      state.settings = await api.getSettings();
    } catch {
      state.settings = {};
    }
  },

  async loadAccounts() {
    try {
      const res = await api.getAccounts();
      state.accounts = Array.isArray(res) ? res : [];
    } catch {
      state.accounts = [];
    }
  },

  initTheme() {
    const saved = localStorage.getItem('nka-theme') || 'system';
    state.theme = saved;
    this.applyTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (state.theme === 'system') this.applyTheme();
    });
  },

  applyTheme() {
    const t = state.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : state.theme;
    document.documentElement.setAttribute('data-theme', t);
  },

  async isSessionValid() {
    if (!state.sessionToken) return false;
    try {
      const res = await api.checkSession(state.sessionToken);
      return res.valid;
    } catch {
      return false;
    }
  },

  initRouter() {
    const hash = window.location.hash.slice(1);
    if (!hash) {
      window.location.hash = 'unlock';
    }
  },

  handleRoute() {
    const hash = window.location.hash.slice(1) || 'unlock';
    this.navigateTo(hash);
  },

  async navigateTo(page) {
    state.currentPage = page;
    const container = document.getElementById('app-content');
    if (!container) return;

    this.updateHeader(page);

    const fullscreenPages = ['unlock', 'auth'];
    const isFullscreen = fullscreenPages.includes(page);
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.classList.toggle('bottom-nav--hidden', isFullscreen);
    const header = document.querySelector('.app-header');
    if (header) header.classList.toggle('app-header--hidden', isFullscreen);
    container.classList.toggle('page-fullscreen', isFullscreen);

    container.innerHTML = `
      <div class="loading-screen">
        <div class="spinner"></div>
      </div>`;

    try {
      const html = await this.loadPage(page);
      container.innerHTML = html;
      this.initPage(page);
      this.updateActiveNav(page);
      container.scrollTop = 0;
      window.scrollTo(0, 0);
    } catch (err) {
      container.innerHTML = `
        <div class="error-state">
          <div class="error-state__icon">⚠️</div>
          <div class="error-state__title">Erreur de chargement</div>
          <div class="error-state__text">Impossible de charger cette page.</div>
          <button class="error-state__retry" onclick="App.navigateTo('${page}')">Réessayer</button>
        </div>`;
    }
  },

  async loadPage(page) {
    if (pageCache[page]) return pageCache[page];
    const res = await fetch('pages/' + page + '.html');
    if (!res.ok) throw new Error('Page ' + page + ' not found');
    const html = await res.text();
    pageCache[page] = html;
    return html;
  },

  updateHeader(page) {
    const titleEl = document.querySelector('.app-header__title');
    const subtitleEl = document.querySelector('.app-header__subtitle');
    const backEl = document.querySelector('.header-back');
    if (!titleEl) return;
    const titles = {
      dashboard: { title: 'Nka Bulletin', subtitle: 'Tableau de bord' },
      explorer: { title: 'Explorer', subtitle: 'Mes bulletins' },
      settings: { title: 'Paramètres', subtitle: 'Configuration' },
      unlock: { title: '', subtitle: '' },
      auth: { title: 'Connexion', subtitle: 'Ajouter un compte' }
    };
    const info = titles[page] || { title: 'Nka Bulletin', subtitle: '' };
    titleEl.textContent = info.title;
    if (subtitleEl) {
      subtitleEl.style.display = info.subtitle ? '' : 'none';
      subtitleEl.textContent = info.subtitle;
    }
    if (backEl) {
      backEl.style.display = page === 'auth' ? 'flex' : 'none';
      backEl.onclick = () => { window.location.hash = 'settings'; };
    }
  },

  updateActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  },

  initPage(page) {
    switch(page) {
      case 'unlock': initUnlock(); break;
      case 'auth': initAuth(); break;
      case 'dashboard': initDashboard(); break;
      case 'explorer': initExplorer(); break;
      case 'settings': initSettings(); break;
    }
  }
};

window.App = App;

// ── UNLOCK ──
function initUnlock() {
  if (state.hasPassword && state.sessionToken) {
    App.isSessionValid().then(valid => {
      if (valid) { window.location.hash = 'dashboard'; return; }
      showUnlockForm();
    });
  } else if (state.hasPassword) {
    showUnlockForm();
  } else {
    showSetupForm();
  }
}

function showUnlockForm() {
  const container = document.querySelector('.unlock-screen');
  if (container) {
    container.innerHTML = `
      <div class="unlock-screen__logo">🔒</div>
      <h1 class="unlock-screen__title">Nka Bulletin</h1>
      <p class="unlock-screen__subtitle">Entrez votre mot de passe</p>
      <input type="password" class="unlock-screen__input" id="password-input" placeholder="Mot de passe" autocomplete="off">
      <div class="unlock-screen__error" id="unlock-error"></div>
      <button class="unlock-screen__btn" id="unlock-btn">Déverrouiller</button>
    `;
    const btn = document.getElementById('unlock-btn');
    const input = document.getElementById('password-input');
    input.focus();
    const doUnlock = async () => {
      const pw = input.value;
      if (!pw) return;
      btn.disabled = true;
      btn.textContent = 'Vérification...';
      try {
        const res = await api.verifyPassword(pw);
        if (res.valid) {
          state.sessionToken = res.token;
          localStorage.setItem('nka-session', res.token);
          window.location.hash = 'dashboard';
        }
      } catch (e) {
        document.getElementById('unlock-error').textContent = 'Mot de passe incorrect';
        btn.disabled = false;
        btn.textContent = 'Déverrouiller';
        input.value = '';
        input.focus();
      }
    };
    btn.addEventListener('click', doUnlock);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doUnlock(); });
  }
}

function showSetupForm() {
  const container = document.querySelector('.unlock-screen');
  if (container) {
    container.innerHTML = `
      <div class="unlock-screen__logo">🔐</div>
      <h1 class="unlock-screen__title">Nka Bulletin</h1>
      <p class="unlock-screen__subtitle">Créez un mot de passe pour protéger vos bulletins</p>
      <input type="password" class="unlock-screen__input" id="password-input" placeholder="Nouveau mot de passe (4 caractères min)" autocomplete="off">
      <input type="password" class="unlock-screen__input" id="password-confirm" placeholder="Confirmer le mot de passe" autocomplete="off">
      <div class="unlock-screen__error" id="unlock-error"></div>
      <button class="unlock-screen__btn" id="unlock-btn">Créer mon mot de passe</button>
    `;
    const btn = document.getElementById('unlock-btn');
    const input = document.getElementById('password-input');
    const confirm = document.getElementById('password-confirm');
    input.focus();
    const doSetup = async () => {
      const pw = input.value;
      if (pw.length < 4) {
        document.getElementById('unlock-error').textContent = 'Minimum 4 caractères';
        return;
      }
      if (pw !== confirm.value) {
        document.getElementById('unlock-error').textContent = 'Les mots de passe ne correspondent pas';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Création...';
      try {
        const res = await api.setupPassword(pw);
        state.hasPassword = true;
        state.sessionToken = res.token;
        localStorage.setItem('nka-session', res.token);
        window.location.hash = 'dashboard';
      } catch (e) {
        document.getElementById('unlock-error').textContent = e.message || 'Erreur';
        btn.disabled = false;
        btn.textContent = 'Créer mon mot de passe';
      }
    };
    btn.addEventListener('click', doSetup);
    confirm.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSetup(); });
  }
}

// ── AUTH ──
function initAuth() {
  const providers = ['gmail', 'outlook', 'yahoo', 'imap'];
  providers.forEach(p => {
    const btn = document.getElementById('connect-' + p);
    if (btn) btn.addEventListener('click', () => handleConnect(p));
  });

  const imapBtn = document.getElementById('connect-imap');
  const imapForm = document.getElementById('imap-form');
  if (imapBtn && imapForm) {
    imapBtn.addEventListener('click', () => imapForm.classList.toggle('hidden'));
  }

  const imapSubmit = document.getElementById('imap-submit');
  if (imapSubmit) {
    imapSubmit.addEventListener('click', async () => {
      const creds = {
        host: document.getElementById('imap-host')?.value,
        port: parseInt(document.getElementById('imap-port')?.value) || 993,
        ssl: document.getElementById('imap-ssl')?.checked ?? true,
        user: document.getElementById('imap-user')?.value,
        password: document.getElementById('imap-pass')?.value
      };
      if (!creds.host || !creds.user || !creds.password) {
        showToast('Veuillez remplir tous les champs');
        return;
      }
      try {
        await api.verifyImap(creds);
        await api.saveImap(creds);
        showToast('Compte IMAP connecté');
        App.loadAccounts();
        renderConnectedAccounts();
      } catch (e) {
        showToast(e.message || 'Erreur de connexion IMAP');
      }
    });
  }

  renderConnectedAccounts();
}

async function handleConnect(provider) {
  if (provider === 'imap') return;
  const btn = document.getElementById('connect-' + provider);
  if (btn) { btn.disabled = true; btn.textContent = 'Redirection...'; }
  try {
    const res = await api.getAuthUrl(provider);
    if (res.url) window.location.href = res.url;
  } catch (e) {
    showToast(e.message || 'Erreur de connexion');
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
}

function renderConnectedAccounts() {
  const list = document.getElementById('connected-accounts');
  if (!list) return;
  if (!state.accounts.length) {
    list.innerHTML = `<div class="empty-state" style="min-height:auto;padding:var(--space-lg)">
      <div class="empty-state__icon">📭</div>
      <div class="empty-state__title">Aucun compte</div>
      <div class="empty-state__text">Connectez un service pour recevoir vos bulletins</div>
    </div>`;
    return;
  }
  list.innerHTML = state.accounts.map(a => `
    <div class="settings-item">
      <div class="settings-item__icon">${getProviderIcon(a.provider)}</div>
      <div class="settings-item__body">
        <div class="settings-item__title">${a.email}</div>
        <div class="settings-item__description">${a.provider} · ${a.last_sync ? 'Synchro : ' + formatRelativeDate(a.last_sync) : 'Jamais synchronisé'}</div>
      </div>
      <button class="btn btn--small btn--ghost" onclick="api.deleteAccount('${a.id}').then(()=>{App.loadAccounts();renderConnectedAccounts();showToast('Compte supprimé')}).catch(e=>showToast(e.message))">Suppr.</button>
    </div>
  `).join('');
}

function getProviderIcon(p) {
  return { gmail: '📧', outlook: '💼', yahoo: '🔵', imap: '📨' }[p] || '📧';
}

// ── DASHBOARD ──
async function initDashboard() {
  if (!state.sessionToken) { window.location.hash = 'unlock'; return; }
  const valid = await App.isSessionValid();
  if (!valid) { localStorage.removeItem('nka-session'); state.sessionToken = null; window.location.hash = 'unlock'; return; }

  const statsContainer = document.getElementById('dashboard-stats');
  const actionsContainer = document.getElementById('dashboard-actions');
  const syncBtn = document.getElementById('sync-btn');
  const syncInfo = document.getElementById('sync-info');

  if (statsContainer) statsContainer.innerHTML = Array(4).fill('<div class="skeleton skeleton-stat"></div>').join('');

  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.textContent = '⏳';
      try {
        for (const a of state.accounts) await api.syncMail(a.id);
        showToast('Synchronisation terminée');
        initDashboard();
      } catch { showToast('Erreur de synchronisation'); }
      syncBtn.textContent = '🔄';
    });
  }

  try {
    const stats = await api.getDashboardStats();
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="stat-card stat-card--primary" style="animation:cardEnter 0.35s ease both">
          <div class="stat-card__icon">📊</div>
          <div class="stat-card__value">${stats.totalBulletins || 0}</div>
          <div class="stat-card__label">Bulletins ${stats.currentYear || ''}</div>
        </div>
        <div class="stat-card" style="animation:cardEnter 0.35s ease 0.08s both">
          <div class="stat-card__icon">📄</div>
          <div class="stat-card__value">${stats.lastBulletinDate ? formatRelativeDate(stats.lastBulletinDate) : '—'}</div>
          <div class="stat-card__label">Dernier bulletin</div>
        </div>
        <div class="stat-card" style="animation:cardEnter 0.35s ease 0.14s both">
          <div class="stat-card__icon">💰</div>
          <div class="stat-card__value">${stats.lastNetSalary ? formatCurrency(stats.lastNetSalary) : '—'}</div>
          <div class="stat-card__label">Dernier salaire net</div>
        </div>
        <div class="stat-card" style="animation:cardEnter 0.35s ease 0.20s both">
          <div class="stat-card__icon">📈</div>
          <div class="stat-card__value" style="font-size:var(--text-xl)">${stats.annualSalaryTotal ? formatCurrency(stats.annualSalaryTotal) : '—'}</div>
          <div class="stat-card__label">Cumul annuel ${stats.currentYear || ''}</div>
        </div>`;
    }
    if (syncInfo) {
      syncInfo.textContent = (state.accounts.length ? state.accounts.length + ' compte(s) connecté(s)' : 'Aucun compte connecté');
    }
    if (actionsContainer) {
      actionsContainer.innerHTML = `
        <button class="quick-action" onclick="window.location.hash='explorer'">📂 Voir tout</button>
        <button class="quick-action" onclick="window.location.hash='settings'">⚙️ Paramètres</button>`;
    }
  } catch {
    if (statsContainer) statsContainer.innerHTML = `<div class="error-state" style="grid-column:1/-1"><div class="error-state__icon">⚠️</div><div class="error-state__title">Erreur</div><button class="error-state__retry" onclick="initDashboard()">Réessayer</button></div>`;
  }
}

// ── EXPLORER ──
const explorerFilters = { year: 0, month: 0, favorites: false, search: '', page: 1 };

function initExplorer() {
  Object.assign(explorerFilters, { year: 0, month: 0, favorites: false, search: '', page: 1 });

  const searchInput = document.getElementById('explorer-search');
  if (searchInput) {
    const ds = debounce(v => { explorerFilters.search = v; explorerFilters.page = 1; renderBulletins(); }, 300);
    searchInput.addEventListener('input', e => ds(e.target.value));
  }

  const yearContainer = document.getElementById('explorer-years');
  if (yearContainer) {
    const years = getYears();
    yearContainer.innerHTML = '<button class="chip chip--active" data-year="0">Tout</button>' +
      years.map(y => `<button class="chip" data-year="${y}">${y}</button>`).join('');
    yearContainer.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      yearContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      explorerFilters.year = parseInt(chip.dataset.year) || 0;
      explorerFilters.page = 1;
      renderBulletins();
    });
  }

  const monthContainer = document.getElementById('explorer-months');
  if (monthContainer) {
    const months = getMonths();
    monthContainer.innerHTML = '<button class="chip chip--active" data-month="0">Tout</button>' +
      months.map(m => `<button class="chip" data-month="${m.value}">${m.label.slice(0,3)}</button>`).join('');
    monthContainer.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      monthContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      explorerFilters.month = parseInt(chip.dataset.month) || 0;
      explorerFilters.page = 1;
      renderBulletins();
    });
  }

  const favToggle = document.getElementById('explorer-fav-toggle');
  if (favToggle) {
    favToggle.addEventListener('click', () => {
      explorerFilters.favorites = !explorerFilters.favorites;
      favToggle.classList.toggle('chip--active');
      explorerFilters.page = 1;
      renderBulletins();
    });
  }

  const selectBtn = document.getElementById('explorer-select');
  if (selectBtn) {
    selectBtn.addEventListener('click', () => {
      state.multiSelect = !state.multiSelect;
      state.selectedBulletins.clear();
      selectBtn.textContent = state.multiSelect ? 'Annuler' : 'Sélectionner';
      selectBtn.classList.toggle('btn--secondary');
      renderBulletins();
      updateMultiSelectBar();
    });
  }

  const cancelBtn = document.getElementById('select-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.multiSelect = false;
      state.selectedBulletins.clear();
      const sb = document.getElementById('explorer-select');
      if (sb) sb.textContent = 'Sélectionner';
      const bar = document.getElementById('multi-select-bar');
      if (bar) bar.classList.remove('multi-select-bar--visible');
      renderBulletins();
    });
  }

  const mergeBtn = document.getElementById('merge-btn');
  if (mergeBtn) {
    mergeBtn.addEventListener('click', async () => {
      if (state.selectedBulletins.size < 2) { showToast('Sélectionnez au moins 2 bulletins'); return; }
      mergeBtn.textContent = 'Fusion...';
      mergeBtn.disabled = true;
      try {
        await api.mergeBulletins([...state.selectedBulletins]);
        showToast('Fusion réussie');
        state.multiSelect = false;
        state.selectedBulletins.clear();
        document.getElementById('explorer-select').textContent = 'Sélectionner';
        renderBulletins();
        updateMultiSelectBar();
      } catch { showToast('Erreur de fusion'); }
      mergeBtn.textContent = 'Fusionner';
      mergeBtn.disabled = false;
    });
  }

  renderBulletins();
}

async function renderBulletins() {
  const container = document.getElementById('explorer-list');
  if (!container) return;

  container.innerHTML = Array(4).fill('<div class="skeleton skeleton-card"></div>').join('');

  try {
    const res = await api.getBulletins(explorerFilters);
    const bulletins = res.bulletins || [];

    if (!bulletins.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state__icon">📋</div><div class="empty-state__title">Aucun bulletin</div><div class="empty-state__text">${explorerFilters.search ? 'Aucun résultat' : explorerFilters.favorites ? 'Aucun favori' : 'Aucun bulletin trouvé'}</div></div>`;
      return;
    }

    container.innerHTML = bulletins.map(b => {
      const sel = state.selectedBulletins.has(b.id);
      return `
        <div class="bulletin-card ${sel ? 'bulletin-card--selected' : ''}" data-id="${b.id}" style="animation-delay:${Math.random()*0.2}s">
          ${state.multiSelect ? `<div class="bulletin-card__checkbox">${sel ? '✓' : ''}</div>` : ''}
          <div class="bulletin-card__icon">📄</div>
          <div class="bulletin-card__body">
            <div class="bulletin-card__title">${b.subject || 'Bulletin ' + getMonthName(b.month) + ' ' + b.year}</div>
            <div class="bulletin-card__meta">
              <span>${formatDate(b.received_at)}</span>
              <span class="bulletin-card__meta-separator"></span>
              <span>${formatFileSize(b.size_bytes)}</span>
            </div>
          </div>
          <div class="bulletin-card__amount">${b.net_salary ? formatCurrency(b.net_salary) : ''}</div>
          <button class="bulletin-card__favorite" data-id="${b.id}" data-fav="${b.is_favorite}">${b.is_favorite ? '❤️' : '🤍'}</button>
        </div>`;
    }).join('');

    container.querySelectorAll('.bulletin-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.bulletin-card__favorite')) return;
        const id = card.dataset.id;
        if (state.multiSelect) {
          if (state.selectedBulletins.has(id)) { state.selectedBulletins.delete(id); card.classList.remove('bulletin-card--selected'); }
          else { state.selectedBulletins.add(id); card.classList.add('bulletin-card--selected'); }
          updateMultiSelectBar();
        } else {
          showBulletinActions(id);
        }
      });
    });

    container.querySelectorAll('.bulletin-card__favorite').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const wasFav = btn.dataset.fav === 'true';
        btn.dataset.fav = String(!wasFav);
        btn.textContent = wasFav ? '🤍' : '❤️';
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => btn.style.transform = '', 200);
        try { await api.toggleFavorite(id); } catch {}
      });
    });

  } catch {
    container.innerHTML = `<div class="error-state"><div class="error-state__icon">⚠️</div><div class="error-state__title">Erreur</div><button class="error-state__retry" onclick="renderBulletins()">Réessayer</button></div>`;
  }
}

function updateMultiSelectBar() {
  const bar = document.getElementById('multi-select-bar');
  const countEl = document.getElementById('select-count');
  const mergeBtn = document.getElementById('merge-btn');
  if (!bar) return;
  if (state.multiSelect && state.selectedBulletins.size > 0) {
    bar.classList.add('multi-select-bar--visible');
    if (countEl) countEl.textContent = state.selectedBulletins.size + ' sélectionné(s)';
    if (mergeBtn) mergeBtn.style.display = state.selectedBulletins.size >= 2 ? '' : 'none';
  } else {
    bar.classList.remove('multi-select-bar--visible');
  }
}

function showBulletinActions(id) {
  const existing = document.querySelector('.action-sheet-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'action-sheet-overlay';
  overlay.innerHTML = `
    <div class="action-sheet">
      <div class="action-sheet__handle"></div>
      <div class="action-sheet__title">Actions</div>
      <button class="action-sheet__option" data-action="view">👁️ Voir le bulletin</button>
      <button class="action-sheet__option" data-action="download">⬇️ Télécharger</button>
      <button class="action-sheet__option" data-action="share">📤 Partager</button>
      <button class="action-sheet__option" data-action="cancel">Annuler</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelectorAll('.action-sheet__option').forEach(opt => {
    opt.addEventListener('click', () => {
      const action = opt.dataset.action;
      overlay.remove();
      if (action === 'view') window.open(api.downloadBulletin(id), '_blank');
      else if (action === 'download') window.location.href = api.downloadBulletin(id);
      else if (action === 'share') { api.shareBulletin(id).then(() => showToast('Partagé')).catch(() => showToast('Erreur de partage')); }
    });
  });
}

// ── SETTINGS ──
async function initSettings() {
  await renderSettings();
}

async function renderSettings() {
  renderThemeSelector();
  await renderToggles();
}

function renderThemeSelector() {
  const container = document.getElementById('theme-selector');
  if (!container) return;
  const options = [
    { value: 'system', label: 'Système', icon: '☀️🌙' },
    { value: 'light', label: 'Clair', icon: '☀️' },
    { value: 'dark', label: 'Sombre', icon: '🌙' }
  ];
  container.innerHTML = options.map(o =>
    `<div class="theme-option ${state.theme === o.value ? 'theme-option--active' : ''}" data-theme="${o.value}"><div class="theme-option__preview theme-option__preview--${o.value}">${o.icon}</div><div class="theme-option__label">${o.label}</div></div>`
  ).join('');
  container.querySelectorAll('.theme-option').forEach(el => {
    el.addEventListener('click', async () => {
      const t = el.dataset.theme;
      state.theme = t;
      localStorage.setItem('nka-theme', t);
      container.querySelectorAll('.theme-option').forEach(o => o.classList.remove('theme-option--active'));
      el.classList.add('theme-option--active');
      document.documentElement.classList.add('theme-transitioning');
      App.applyTheme();
      setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 400);
      try { await api.updateSetting('theme', t); } catch {}
    });
  });
}

async function renderToggles() {
  const s = state.settings || {};

  // Password change
  const changePwBtn = document.getElementById('change-password-btn');
  if (changePwBtn) {
    changePwBtn.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal__title">Changer le mot de passe</div>
          <div class="modal__text">
            <input type="password" class="form-input" id="pw-old" placeholder="Ancien mot de passe" style="margin-bottom:8px;width:100%">
            <input type="password" class="form-input" id="pw-new" placeholder="Nouveau mot de passe (4 min)" style="margin-bottom:8px;width:100%">
            <input type="password" class="form-input" id="pw-confirm" placeholder="Confirmer" style="margin-bottom:8px;width:100%">
            <div id="pw-error" style="color:var(--md-error);font-size:var(--text-sm)"></div>
          </div>
          <div class="modal__actions">
            <button class="btn btn--ghost" id="pw-cancel">Annuler</button>
            <button class="btn btn--primary" id="pw-save">Changer</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const err = () => overlay.querySelector('#pw-error');
      overlay.querySelector('#pw-cancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#pw-save').addEventListener('click', async () => {
        const old = overlay.querySelector('#pw-old').value;
        const nw = overlay.querySelector('#pw-new').value;
        const cf = overlay.querySelector('#pw-confirm').value;
        if (nw.length < 4) { err().textContent = 'Minimum 4 caractères'; return; }
        if (nw !== cf) { err().textContent = 'Les mots de passe ne correspondent pas'; return; }
        try {
          await api.changePassword(old, nw);
          overlay.remove();
          showToast('Mot de passe changé');
        } catch (e) { err().textContent = e.message; }
      });
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    });
  }

  // Auto sync
  const at = document.getElementById('toggle-autosync');
  if (at) {
    at.checked = s.autoSync !== 'false';
    at.addEventListener('change', async e => { try { await api.updateSetting('autoSync', e.target.checked ? 'true' : 'false'); } catch {} });
  }

  // Sync interval
  const si = document.getElementById('sync-interval');
  if (si) {
    si.value = s.sync_frequency || '3600000';
    si.addEventListener('change', async e => { try { await api.updateSetting('sync_frequency', e.target.value); } catch {} });
  }

  // PDF analysis
  const pa = document.getElementById('toggle-analysis');
  if (pa) {
    pa.checked = s.pdf_analysis_enabled !== 'false';
    pa.addEventListener('change', async e => { try { await api.updateSetting('pdf_analysis_enabled', e.target.checked ? 'true' : 'false'); } catch {} });
  }

  // Storage
  const storageLabel = document.getElementById('storage-label');
  const storageBar = document.getElementById('storage-bar');
  if (storageLabel && storageBar) {
    try {
      const st = await api.getDashboardStats();
      const used = st.totalSize || 0;
      storageLabel.textContent = formatFileSize(used);
      storageBar.style.width = '0%';
    } catch {
      storageLabel.textContent = '—';
    }
  }

  // Clear data
  const clearBtn = document.getElementById('clear-data-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      showConfirmDialog('Effacer les données', 'Cette action est irréversible.', async () => {
        showToast('Fonctionnalité à venir');
      });
    });
  }

  // Version
  const ver = document.getElementById('app-version');
  if (ver) ver.textContent = '1.0.0';
}

document.addEventListener('DOMContentLoaded', () => App.init());
