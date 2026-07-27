/* ============================================
   Nka Bulletin — Application Router & State
   ============================================ */

import { formatCurrency, formatDate, formatDateShort, formatFileSize, formatRelativeDate,
         getMonthName, getMonthNameShort, debounce, getYears, getMonths, uid, showToast } from './utils.js';
import api from './api.js';

// ============================================
// Global State
// ============================================
const state = {
  theme: 'system',
  accounts: [],
  settings: null,
  currentPage: 'dashboard',
  bulletins: [],
  selectedBulletins: new Set(),
  multiSelect: false
};

// Cache loaded pages
const pageCache = {};

// ============================================
// Application Initialization
// ============================================
const App = {
  async init() {
    await this.loadSettings();
    await this.loadAccounts();
    this.initTheme();
    this.initRouter();
    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());
    // Handle initial route
    this.handleRoute();
  },

  async loadSettings() {
    try {
      const res = await api.getSettings();
      state.settings = res.data;
    } catch {
      state.settings = { biometricEnabled: false, theme: 'system', autoSync: true,
        pdfAnalysisEnabled: true, appVersion: '1.0.0' };
    }
  },

  async loadAccounts() {
    try {
      const res = await api.getAccounts();
      state.accounts = res.data;
    } catch {
      state.accounts = [];
    }
  },

  initTheme() {
    const saved = localStorage.getItem('nka-theme') || 'system';
    state.theme = saved;
    this.applyTheme();
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (state.theme === 'system') this.applyTheme();
    });
  },

  applyTheme() {
    const theme = state.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : state.theme;
    document.documentElement.setAttribute('data-theme', theme);
  },

  initRouter() {
    // Determine initial page based on biometric setting
    const initialPage = state.settings?.biometricEnabled ? 'unlock' : 'dashboard';
    const currentHash = window.location.hash.slice(1);
    if (!currentHash || (currentHash === 'dashboard' && initialPage === 'unlock')) {
      window.location.hash = initialPage;
    }
  },

  handleRoute() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    this.navigateTo(hash);
  },

  async navigateTo(page) {
    state.currentPage = page;
    const container = document.getElementById('app-content');
    if (!container) return;

    // Update header
    this.updateHeader(page);

    const fullscreenPages = ['unlock', 'auth'];
    const isFullscreen = fullscreenPages.includes(page);

    // Show/hide bottom nav
    const nav = document.querySelector('.bottom-nav');
    if (nav) {
      nav.classList.toggle('bottom-nav--hidden', isFullscreen);
    }

    // Show/hide header
    const header = document.querySelector('.app-header');
    if (header) {
      header.classList.toggle('app-header--hidden', isFullscreen);
    }

    // Toggle fullscreen class on content
    container.classList.toggle('page-fullscreen', isFullscreen);

    // Show loading
    container.innerHTML = `
      <div class="loading-screen">
        <div class="spinner"></div>
      </div>`;

    try {
      const html = await this.loadPage(page);
      container.innerHTML = html;
      this.initPage(page);
      this.updateActiveNav(page);
      // Scroll to top
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
    const response = await fetch(`pages/${page}.html`);
    if (!response.ok) throw new Error(`Page ${page} not found`);
    const html = await response.text();
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

    // Back button for auth page
    if (backEl) {
      backEl.style.display = page === 'auth' ? 'flex' : 'none';
      backEl.onclick = () => {
        window.location.hash = 'settings';
      };
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

// Make App globally accessible for inline onclick handlers
window.App = App;

// ============================================
// PAGE INITIALIZERS
// ============================================

// ---------- UNLOCK ----------
function initUnlock() {
  // If biometric disabled, redirect to dashboard
  if (!state.settings?.biometricEnabled) {
    window.location.hash = 'dashboard';
    return;
  }

  const btn = document.getElementById('unlock-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.innerHTML = '<div class="spinner" style="width:24px;height:24px;border-width:2px;border-top-color:var(--md-on-primary);border-color:rgba(255,255,255,0.3)"></div>';
      // Simulate biometric check
      setTimeout(() => {
        window.location.hash = 'dashboard';
      }, 600);
    });
  }
}

// ---------- AUTH ----------
function initAuth() {
  const providers = ['gmail', 'outlook', 'yahoo', 'imap'];

  providers.forEach(provider => {
    const btn = document.getElementById(`connect-${provider}`);
    if (btn) {
      btn.addEventListener('click', () => handleConnect(provider));
    }
  });

  // IMAP form toggle
  const imapBtn = document.getElementById('connect-imap');
  const imapForm = document.getElementById('imap-form');
  if (imapBtn && imapForm) {
    imapBtn.addEventListener('click', () => {
      imapForm.classList.toggle('hidden');
    });
  }

  // IMAP form submit
  const imapSubmit = document.getElementById('imap-submit');
  if (imapSubmit) {
    imapSubmit.addEventListener('click', async () => {
      const credentials = {
        host: document.getElementById('imap-host')?.value,
        port: parseInt(document.getElementById('imap-port')?.value) || 993,
        ssl: document.getElementById('imap-ssl')?.checked ?? true,
        user: document.getElementById('imap-user')?.value,
        password: document.getElementById('imap-pass')?.value,
        email: document.getElementById('imap-user')?.value
      };
      if (!credentials.host || !credentials.user || !credentials.password) {
        showToast('Veuillez remplir tous les champs obligatoires');
        return;
      }
      await addAccount('IMAP', credentials);
    });
  }

  // Render existing accounts
  renderConnectedAccounts();
}

async function handleConnect(provider) {
  const labels = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo' };
  await addAccount(labels[provider] || provider);
}

async function addAccount(provider, credentials = null) {
  const btn = document.querySelector(`#connect-${provider.toLowerCase()}`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Connexion...';
  }

  try {
    const res = await api.connectAccount(provider.toLowerCase(), credentials);
    if (res.success) {
      state.accounts.push(res.data);
      renderConnectedAccounts();
      showToast(`Compte ${provider} connecté avec succès`);
    }
  } catch {
    showToast('Erreur de connexion au fournisseur');
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
}

function renderConnectedAccounts() {
  const list = document.getElementById('connected-accounts');
  if (!list) return;

  if (state.accounts.length === 0) {
    list.innerHTML = `<div class="empty-state" style="min-height:auto;padding:var(--space-lg)">
      <div class="empty-state__icon">📭</div>
      <div class="empty-state__title">Aucun compte</div>
      <div class="empty-state__text">Connectez un service pour recevoir vos bulletins</div>
    </div>`;
    return;
  }

  list.innerHTML = state.accounts.map(acc => `
    <div class="settings-item">
      <div class="settings-item__icon">${getProviderIcon(acc.provider)}</div>
      <div class="settings-item__body">
        <div class="settings-item__title">${acc.email}</div>
        <div class="settings-item__description">${acc.label} · Dernière synchro : ${acc.lastSync ? formatRelativeDate(acc.lastSync) : 'Jamais'}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" class="toggle__input" ${acc.connected ? 'checked' : ''} data-account-id="${acc.id}">
        <span class="toggle__slider"></span>
      </label>
    </div>
  `).join('');

  // Toggle handlers
  list.querySelectorAll('.toggle__input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = e.target.dataset.accountId;
      if (!e.target.checked) {
        await api.disconnectAccount(id);
        state.accounts = state.accounts.filter(a => a.id !== id);
        renderConnectedAccounts();
        showToast('Compte déconnecté');
      }
    });
  });
}

function getProviderIcon(provider) {
  const icons = {
    gmail: '📧',
    outlook: '💼',
    yahoo: '🔵',
    imap: '📨'
  };
  return icons[provider] || '📧';
}

// ---------- DASHBOARD ----------
async function initDashboard() {
  const statsContainer = document.getElementById('dashboard-stats');
  const actionsContainer = document.getElementById('dashboard-actions');
  const syncBtn = document.getElementById('sync-btn');

  // Show skeletons
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="skeleton skeleton-stat"></div>
      <div class="skeleton skeleton-stat"></div>
      <div class="skeleton skeleton-stat"></div>
      <div class="skeleton skeleton-stat"></div>`;
  }

  // Sync button
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px"></div>';
      try {
        await api.syncMail();
        showToast('Synchronisation terminée ✓');
        initDashboard(); // Refresh
      } catch {
        showToast('Erreur de synchronisation');
      }
      syncBtn.innerHTML = '🔄';
    });
  }

  try {
    const res = await api.getDashboardStats();
    const d = res.data;

    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="stat-card stat-card--primary" style="animation:cardEnter 0.35s ease both">
          <div class="stat-card__icon">📊</div>
          <div class="stat-card__value">${d.totalBulletins}</div>
          <div class="stat-card__label">Bulletins ${d.year}</div>
        </div>
        <div class="stat-card" style="animation:cardEnter 0.35s ease 0.08s both">
          <div class="stat-card__icon">📄</div>
          <div class="stat-card__value">${getMonthNameShort(d.lastBulletinMonth)}</div>
          <div class="stat-card__label">Dernier bulletin</div>
        </div>
        <div class="stat-card" style="animation:cardEnter 0.35s ease 0.14s both">
          <div class="stat-card__icon">💰</div>
          <div class="stat-card__value">${formatCurrency(d.lastNetSalary)}</div>
          <div class="stat-card__label">Dernier salaire net</div>
        </div>
        <div class="stat-card" style="animation:cardEnter 0.35s ease 0.20s both">
          <div class="stat-card__icon">📈</div>
          <div class="stat-card__value" style="font-size:var(--text-xl)">${formatCurrency(d.annualTotal)}</div>
          <div class="stat-card__label">Cumul annuel ${d.year}</div>
        </div>`;
    }

    if (actionsContainer) {
      actionsContainer.innerHTML = `
        <button class="quick-action" onclick="window.location.hash='explorer'">
          📂 Voir tout
        </button>
        <button class="quick-action" onclick="window.location.hash='settings'">
          ⚙️ Paramètres
        </button>`;
    }
  } catch {
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="error-state" style="grid-column:1/-1">
          <div class="error-state__icon">⚠️</div>
          <div class="error-state__title">Erreur</div>
          <button class="error-state__retry" onclick="initDashboard()">Réessayer</button>
        </div>`;
    }
  }
}

// ---------- EXPLORER ----------
let explorerFilters = { year: 0, month: 0, favoritesOnly: false, search: '' };

function initExplorer() {
  explorerFilters = { year: 0, month: 0, favoritesOnly: false, search: '' };

  // Search
  const searchInput = document.getElementById('explorer-search');
  if (searchInput) {
    const debouncedSearch = debounce((val) => {
      explorerFilters.search = val;
      renderBulletins();
    }, 300);
    searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
  }

  // Year chips
  const yearContainer = document.getElementById('explorer-years');
  if (yearContainer) {
    const years = getYears();
    yearContainer.innerHTML = `
      <button class="chip chip--active" data-year="0">Tout</button>
      ${years.map(y => `<button class="chip" data-year="${y}">${y}</button>`).join('')}
    `;
    yearContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      yearContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      explorerFilters.year = parseInt(chip.dataset.year) || 0;
      renderBulletins();
    });
  }

  // Month chips
  const monthContainer = document.getElementById('explorer-months');
  if (monthContainer) {
    const months = getMonths();
    monthContainer.innerHTML = `
      <button class="chip chip--active" data-month="0">Tout</button>
      ${months.map(m => `<button class="chip" data-month="${m.value}">${m.label.slice(0, 3)}</button>`).join('')}
    `;
    monthContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      monthContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      explorerFilters.month = parseInt(chip.dataset.month) || 0;
      renderBulletins();
    });
  }

  // Favorites toggle
  const favToggle = document.getElementById('explorer-fav-toggle');
  if (favToggle) {
    favToggle.addEventListener('click', () => {
      explorerFilters.favoritesOnly = !explorerFilters.favoritesOnly;
      favToggle.classList.toggle('chip--active');
      renderBulletins();
    });
  }

  // Select mode button
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

  // Cancel selection button
  const cancelBtn = document.getElementById('select-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.multiSelect = false;
      state.selectedBulletins.clear();
      const selectBtn = document.getElementById('explorer-select');
      if (selectBtn) selectBtn.textContent = 'Sélectionner';
      const bar = document.getElementById('multi-select-bar');
      if (bar) bar.classList.remove('multi-select-bar--visible');
      renderBulletins();
    });
  }

  // Merge button
  const mergeBtn = document.getElementById('merge-btn');
  if (mergeBtn) {
    mergeBtn.addEventListener('click', async () => {
      if (state.selectedBulletins.size < 2) {
        showToast('Sélectionnez au moins 2 bulletins');
        return;
      }
      mergeBtn.textContent = 'Fusion en cours...';
      mergeBtn.disabled = true;
      try {
        await api.mergePDFs([...state.selectedBulletins]);
        showToast('Fusion réussie ✓');
        state.multiSelect = false;
        state.selectedBulletins.clear();
        document.getElementById('explorer-select').textContent = 'Sélectionner';
        renderBulletins();
        updateMultiSelectBar();
      } catch {
        showToast('Erreur lors de la fusion');
      }
      mergeBtn.textContent = 'Fusionner';
      mergeBtn.disabled = false;
    });
  }

  renderBulletins();
}

async function renderBulletins() {
  const container = document.getElementById('explorer-list');
  if (!container) return;

  // Show skeletons
  container.innerHTML = Array(4).fill('<div class="skeleton skeleton-card"></div>').join('');

  try {
    const res = await api.getBulletins(explorerFilters);
    const bulletins = res.data;

    if (bulletins.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📋</div>
          <div class="empty-state__title">Aucun bulletin</div>
          <div class="empty-state__text">${explorerFilters.search ? 'Aucun résultat pour votre recherche.' :
            explorerFilters.favoritesOnly ? 'Aucun favori pour le moment.' : 
            'Aucun bulletin trouvé pour cette période.'}</div>
        </div>`;
      return;
    }

    container.innerHTML = bulletins.map(b => {
      const selected = state.selectedBulletins.has(b.id);
      return `
        <div class="bulletin-card ${selected ? 'bulletin-card--selected' : ''}" 
             data-id="${b.id}" style="animation-delay:${Math.random() * 0.2}s">
          ${state.multiSelect ? `<div class="bulletin-card__checkbox">${selected ? '✓' : ''}</div>` : ''}
          <div class="bulletin-card__icon">📄</div>
          <div class="bulletin-card__body">
            <div class="bulletin-card__title">${b.company} · ${getMonthName(b.month)} ${b.year}</div>
            <div class="bulletin-card__meta">
              <span>${formatDateShort(b.receivedAt)}</span>
              <span class="bulletin-card__meta-separator"></span>
              <span>${formatFileSize(b.fileSize)}</span>
            </div>
          </div>
          <div class="bulletin-card__amount">${formatCurrency(b.amount)}</div>
          <button class="bulletin-card__favorite" data-id="${b.id}" data-fav="${b.isFavorite}">
            ${b.isFavorite ? '❤️' : '🤍'}
          </button>
        </div>`;
    }).join('');

    // Card click handlers
    container.querySelectorAll('.bulletin-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Ignore clicks on favorite button
        if (e.target.closest('.bulletin-card__favorite')) return;
        const id = card.dataset.id;

        if (state.multiSelect) {
          // Toggle selection
          if (state.selectedBulletins.has(id)) {
            state.selectedBulletins.delete(id);
            card.classList.remove('bulletin-card--selected');
          } else {
            state.selectedBulletins.add(id);
            card.classList.add('bulletin-card--selected');
          }
          updateMultiSelectBar();
        } else {
          showBulletinActions(id);
        }
      });
    });

    // Favorite toggles
    container.querySelectorAll('.bulletin-card__favorite').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const wasFav = btn.dataset.fav === 'true';
        btn.dataset.fav = String(!wasFav);
        btn.textContent = wasFav ? '🤍' : '❤️';
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => { btn.style.transform = ''; }, 200);
        await api.toggleFavorite(id);
      });
    });

  } catch {
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state__icon">⚠️</div>
        <div class="error-state__title">Erreur de chargement</div>
        <div class="error-state__text">Impossible de récupérer les bulletins.</div>
        <button class="error-state__retry" onclick="renderBulletins()">Réessayer</button>
      </div>`;
  }
}

function updateMultiSelectBar() {
  const bar = document.getElementById('multi-select-bar');
  const countEl = document.getElementById('select-count');
  const mergeBtn = document.getElementById('merge-btn');
  if (!bar) return;

  if (state.multiSelect && state.selectedBulletins.size > 0) {
    bar.classList.add('multi-select-bar--visible');
    if (countEl) countEl.textContent = `${state.selectedBulletins.size} sélectionné(s)`;
    if (mergeBtn) {
      mergeBtn.style.display = state.selectedBulletins.size >= 2 ? '' : 'none';
    }
  } else {
    bar.classList.remove('multi-select-bar--visible');
  }
}

function showBulletinActions(bulletinId) {
  // Close existing sheet
  const existing = document.querySelector('.action-sheet-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'action-sheet-overlay';
  overlay.innerHTML = `
    <div class="action-sheet">
      <div class="action-sheet__handle"></div>
      <div class="action-sheet__title">Actions</div>
      <button class="action-sheet__option" data-action="view">
        <span class="action-sheet__option-icon">👁️</span>
        Voir le bulletin
      </button>
      <button class="action-sheet__option" data-action="download">
        <span class="action-sheet__option-icon">⬇️</span>
        Télécharger
      </button>
      <button class="action-sheet__option" data-action="share">
        <span class="action-sheet__option-icon">📤</span>
        Partager
      </button>
      <button class="action-sheet__option" data-action="delete" class="action-sheet__option--danger">
        <span class="action-sheet__option-icon">🗑️</span>
        Supprimer
      </button>
      <button class="action-sheet__option" data-action="cancel">
        Annuler
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Click on overlay to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Option handlers
  overlay.querySelectorAll('.action-sheet__option').forEach(opt => {
    opt.addEventListener('click', () => {
      const action = opt.dataset.action;
      overlay.remove();
      switch (action) {
        case 'view':
          showToast('Ouverture du bulletin...');
          break;
        case 'download':
          showToast('Téléchargement...');
          break;
        case 'share':
          showToast('Partage...');
          break;
        case 'delete':
          showToast('Suppression...');
          break;
      }
    });
  });
}

// ---------- SETTINGS ----------
async function initSettings() {
  await renderSettings();
}

async function renderSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  // Theme selector
  renderThemeSelector();

  // Toggles
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

  container.innerHTML = options.map(opt => `
    <div class="theme-option ${state.theme === opt.value ? 'theme-option--active' : ''}" data-theme="${opt.value}">
      <div class="theme-option__preview theme-option__preview--${opt.value}">${opt.icon}</div>
      <div class="theme-option__label">${opt.label}</div>
    </div>
  `).join('');

  container.querySelectorAll('.theme-option').forEach(el => {
    el.addEventListener('click', async () => {
      const theme = el.dataset.theme;
      state.theme = theme;
      localStorage.setItem('nka-theme', theme);
      // Re-render theme selector
      container.querySelectorAll('.theme-option').forEach(o => o.classList.remove('theme-option--active'));
      el.classList.add('theme-option--active');
      // Apply with transition
      document.documentElement.classList.add('theme-transitioning');
      App.applyTheme();
      setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 400);
      // Save to backend
      await api.updateSettings({ theme });
    });
  });
}

async function renderToggles() {
  // Biometric toggle
  const bioToggle = document.getElementById('toggle-biometric');
  if (bioToggle) {
    bioToggle.checked = state.settings?.biometricEnabled ?? false;
    bioToggle.addEventListener('change', async (e) => {
      state.settings.biometricEnabled = e.target.checked;
      await api.updateSettings({ biometricEnabled: e.target.checked });
    });
  }

  // Auto sync toggle
  const syncToggle = document.getElementById('toggle-autosync');
  if (syncToggle) {
    syncToggle.checked = state.settings?.autoSync ?? true;
    syncToggle.addEventListener('change', async (e) => {
      state.settings.autoSync = e.target.checked;
      await api.updateSettings({ autoSync: e.target.checked });
    });
  }

  // PDF analysis toggle
  const analysisToggle = document.getElementById('toggle-analysis');
  if (analysisToggle) {
    analysisToggle.checked = state.settings?.pdfAnalysisEnabled ?? true;
    analysisToggle.addEventListener('change', async (e) => {
      state.settings.pdfAnalysisEnabled = e.target.checked;
      await api.updateSettings({ pdfAnalysisEnabled: e.target.checked });
    });
  }

  // Auto detect toggle
  const detectToggle = document.getElementById('toggle-autodetect');
  if (detectToggle) {
    detectToggle.checked = state.settings?.pdfAutoDetect ?? true;
    detectToggle.addEventListener('change', async (e) => {
      state.settings.pdfAutoDetect = e.target.checked;
      await api.updateSettings({ pdfAutoDetect: e.target.checked });
    });
  }

  // Sync interval
  const syncInterval = document.getElementById('sync-interval');
  if (syncInterval) {
    syncInterval.value = state.settings?.syncInterval ?? 6;
    syncInterval.addEventListener('change', async (e) => {
      state.settings.syncInterval = parseInt(e.target.value);
      await api.updateSettings({ syncInterval: parseInt(e.target.value) });
    });
  }

  // Storage
  const storageBar = document.getElementById('storage-bar');
  const storageLabel = document.getElementById('storage-label');
  if (storageBar && storageLabel) {
    const used = state.settings?.storageUsed ?? 0;
    const total = state.settings?.storageTotal ?? 1;
    const pct = Math.min((used / total) * 100, 100);
    storageBar.style.width = pct + '%';
    storageLabel.textContent = `${formatFileSize(used)} / ${formatFileSize(total)}`;
  }

  // App version
  const versionEl = document.getElementById('app-version');
  if (versionEl) {
    versionEl.textContent = state.settings?.appVersion ?? '1.0.0';
  }

  // Clear data button
  const clearBtn = document.getElementById('clear-data-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      showConfirmDialog(
        'Effacer les données',
        'Cette action supprimera tous les bulletins et comptes synchronisés. Les données téléchargées seront définitivement perdues.',
        async () => {
          showToast('Données effacées');
        }
      );
    });
  }
}

function showConfirmDialog(title, message, onConfirm) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__title">${title}</div>
      <div class="modal__text">${message}</div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="dialog-cancel">Annuler</button>
        <button class="btn btn--danger" id="dialog-confirm">Confirmer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#dialog-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#dialog-confirm').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ============================================
// Start
// ============================================
document.addEventListener('DOMContentLoaded', () => App.init());
