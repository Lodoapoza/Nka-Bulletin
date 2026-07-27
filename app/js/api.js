/* ============================================
   Nka Bulletin — API Client
   ============================================ */

const API_BASE = 'http://10.0.2.2:3000/api';

// ============================================
// Mock Data
// ============================================
const MOCK = {
  bulletins: [
    { id: 'b1', company: 'TechVision SARL', month: 1, year: 2026, amount: 1250000, netAmount: 1250000, fileSize: 245000, fileName: 'bulletin_janvier_2026.pdf', receivedAt: '2026-01-05T08:30:00Z', isFavorite: false, analyzed: true },
    { id: 'b2', company: 'TechVision SARL', month: 2, year: 2026, amount: 1250000, netAmount: 1250000, fileSize: 252000, fileName: 'bulletin_fevrier_2026.pdf', receivedAt: '2026-02-03T09:15:00Z', isFavorite: false, analyzed: true },
    { id: 'b3', company: 'TechVision SARL', month: 3, year: 2026, amount: 1350000, netAmount: 1350000, fileSize: 238000, fileName: 'bulletin_mars_2026.pdf', receivedAt: '2026-03-04T10:00:00Z', isFavorite: true, analyzed: true },
    { id: 'b4', company: 'AIA Assurances', month: 4, year: 2026, amount: 890000, netAmount: 890000, fileSize: 198000, fileName: 'bulletin_avril_2026.pdf', receivedAt: '2026-04-02T07:45:00Z', isFavorite: false, analyzed: true },
    { id: 'b5', company: 'AIA Assurances', month: 5, year: 2026, amount: 890000, netAmount: 890000, fileSize: 201000, fileName: 'bulletin_mai_2026.pdf', receivedAt: '2026-05-05T08:20:00Z', isFavorite: false, analyzed: true },
    { id: 'b6', company: 'AIA Assurances', month: 6, year: 2026, amount: 910000, netAmount: 910000, fileSize: 205000, fileName: 'bulletin_juin_2026.pdf', receivedAt: '2026-06-03T11:00:00Z', isFavorite: true, analyzed: true },
    { id: 'b7', company: 'Groupe SABC', month: 7, year: 2026, amount: 2450000, netAmount: 2450000, fileSize: 312000, fileName: 'bulletin_juillet_2026.pdf', receivedAt: '2026-07-07T09:30:00Z', isFavorite: false, analyzed: true },
    { id: 'b8', company: 'TechVision SARL', month: 8, year: 2025, amount: 1250000, netAmount: 1250000, fileSize: 240000, fileName: 'bulletin_aout_2025.pdf', receivedAt: '2025-08-04T08:00:00Z', isFavorite: false, analyzed: true },
    { id: 'b9', company: 'TechVision SARL', month: 9, year: 2025, amount: 1250000, netAmount: 1250000, fileSize: 247000, fileName: 'bulletin_septembre_2025.pdf', receivedAt: '2025-09-02T10:15:00Z', isFavorite: true, analyzed: true },
    { id: 'b10', company: 'TechVision SARL', month: 10, year: 2025, amount: 1250000, netAmount: 1250000, fileSize: 244000, fileName: 'bulletin_octobre_2025.pdf', receivedAt: '2025-10-06T09:45:00Z', isFavorite: false, analyzed: false },
  ],

  dashboard: {
    year: new Date().getFullYear(),
    totalBulletins: 7,
    lastBulletinMonth: 7,
    lastBulletinYear: 2026,
    lastBulletinCompany: 'Groupe SABC',
    lastNetSalary: 2450000,
    annualTotal: 8990000,
    analysisEnabled: true,
    lastSyncAt: '2026-07-07T09:30:00Z'
  },

  settings: {
    biometricEnabled: false,
    theme: 'system',
    autoSync: true,
    syncInterval: 6,
    pdfAnalysisEnabled: true,
    pdfAutoDetect: true,
    storageUsed: 2450000,
    storageTotal: 52428800,
    appVersion: '1.0.0',
    lastUpdate: '2026-07-15T14:00:00Z'
  },

  accounts: [
    { id: 'a1', provider: 'gmail', email: 'louis.samake@gmail.com', connected: true, lastSync: '2026-07-07T09:30:00Z', label: 'Gmail' },
    { id: 'a2', provider: 'outlook', email: 'louis.samake@outlook.com', connected: true, lastSync: '2026-07-06T14:00:00Z', label: 'Outlook' }
  ]
};

// ============================================
// Mock helpers
// ============================================
function delay(ms = 300) {
  return new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 200));
}

function shouldMock() {
  return true; // Always use mock data in dev
}

// ============================================
// API Client
// ============================================
const api = {
  /**
   * Fetch bulletins with optional filters
   */
  async getBulletins({ year, month, favoritesOnly, search } = {}) {
    await delay();
    let results = [...MOCK.bulletins];
    if (year) results = results.filter(b => b.year === year);
    if (month) results = results.filter(b => b.month === month);
    if (favoritesOnly) results = results.filter(b => b.isFavorite);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(b =>
        b.company.toLowerCase().includes(q) ||
        b.fileName.toLowerCase().includes(q)
      );
    }
    results.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    return { success: true, data: results };
  },

  /**
   * Get dashboard stats
   */
  async getDashboardStats() {
    await delay();
    return { success: true, data: { ...MOCK.dashboard } };
  },

  /**
   * Get all settings
   */
  async getSettings() {
    await delay();
    return { success: true, data: { ...MOCK.settings } };
  },

  /**
   * Update settings
   */
  async updateSettings(updates) {
    await delay();
    Object.assign(MOCK.settings, updates);
    return { success: true, data: { ...MOCK.settings } };
  },

  /**
   * Get all connected accounts
   */
  async getAccounts() {
    await delay();
    return { success: true, data: MOCK.accounts.map(a => ({ ...a })) };
  },

  /**
   * Connect a new account
   */
  async connectAccount(provider, credentials) {
    await delay(600);
    const newAccount = {
      id: 'a' + Date.now(),
      provider,
      email: credentials?.email || `${provider}@exemple.com`,
      connected: true,
      lastSync: null,
      label: provider.charAt(0).toUpperCase() + provider.slice(1)
    };
    MOCK.accounts.push(newAccount);
    return { success: true, data: newAccount };
  },

  /**
   * Disconnect an account
   */
  async disconnectAccount(accountId) {
    await delay();
    const idx = MOCK.accounts.findIndex(a => a.id === accountId);
    if (idx !== -1) MOCK.accounts.splice(idx, 1);
    return { success: true };
  },

  /**
   * Trigger mail sync
   */
  async syncMail() {
    await delay(1500);
    const now = new Date().toISOString();
    MOCK.accounts.forEach(a => { a.lastSync = now; });
    return { success: true, message: 'Synchronisation terminée avec succès' };
  },

  /**
   * Toggle favorite status
   */
  async toggleFavorite(bulletinId) {
    await delay();
    const bulletin = MOCK.bulletins.find(b => b.id === bulletinId);
    if (bulletin) {
      bulletin.isFavorite = !bulletin.isFavorite;
    }
    return { success: true, data: { id: bulletinId, isFavorite: bulletin?.isFavorite ?? false } };
  },

  /**
   * Merge multiple PDFs
   */
  async mergePDFs(bulletinIds) {
    await delay(2000);
    return { success: true, data: { id: 'merged_' + Date.now(), fileName: 'bulletins_fusionnes.pdf' } };
  },

  /**
   * Download a bulletin PDF
   */
  async downloadPDF(bulletinId) {
    await delay(500);
    const bulletin = MOCK.bulletins.find(b => b.id === bulletinId);
    return { success: true, data: { fileName: bulletin?.fileName || 'bulletin.pdf', blob: new Blob(['']) } };
  },

  /**
   * Share a bulletin
   */
  async sharePDF(bulletinId) {
    await delay(200);
    const bulletin = MOCK.bulletins.find(b => b.id === bulletinId);
    return { success: true, data: { fileName: bulletin?.fileName || 'bulletin.pdf' } };
  },

  /**
   * Get storage info
   */
  async getStorageInfo() {
    await delay();
    return { success: true, data: { used: MOCK.settings.storageUsed, total: MOCK.settings.storageTotal } };
  }
};

export default api;
