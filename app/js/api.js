const API = '/api';

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

const api = {
  // Password
  getPasswordStatus() {
    return request('GET', '/auth/password/status');
  },
  setupPassword(password) {
    return request('POST', '/auth/password/setup', { password });
  },
  verifyPassword(password) {
    return request('POST', '/auth/password/verify', { password });
  },
  changePassword(oldPassword, newPassword) {
    return request('POST', '/auth/password/change', { oldPassword, newPassword });
  },
  checkSession(token) {
    return request('POST', '/auth/password/session-check', { token });
  },

  // Auth - OAuth
  getAuthUrl(provider) {
    return request('GET', '/auth/' + provider + '/login');
  },
  getAccounts() {
    return request('GET', '/auth/accounts');
  },
  deleteAccount(id) {
    return request('DELETE', '/auth/accounts/' + id);
  },
  verifyImap(credentials) {
    return request('POST', '/auth/imap/verify', credentials);
  },
  saveImap(config) {
    return request('POST', '/auth/imap/save', config);
  },

  // Mail
  syncMail(accountId) {
    return request('POST', '/mail/sync/' + accountId);
  },
  getSyncStatus(accountId) {
    return request('GET', '/mail/sync/status/' + accountId);
  },

  // Bulletins
  getBulletins(filters = {}) {
    const params = new URLSearchParams();
    if (filters.year) params.set('year', filters.year);
    if (filters.month) params.set('month', filters.month);
    if (filters.search) params.set('search', filters.search);
    if (filters.favorites) params.set('favorites', '1');
    if (filters.page) params.set('page', filters.page);
    const qs = params.toString();
    return request('GET', '/bulletins' + (qs ? '?' + qs : ''));
  },
  getBulletin(id) {
    return request('GET', '/bulletins/' + id);
  },
  toggleFavorite(id) {
    return request('POST', '/bulletins/' + id + '/favorite');
  },
  downloadBulletin(id) {
    return API + '/bulletins/' + id + '/download';
  },
  mergeBulletins(ids) {
    return request('POST', '/bulletins/merge', { ids });
  },
  shareBulletin(id) {
    return request('POST', '/bulletins/' + id + '/share');
  },

  // Stats
  getDashboardStats() {
    return request('GET', '/stats/dashboard');
  },
  getYearlyStats(year) {
    return request('GET', '/stats/yearly/' + year);
  },

  // Settings
  getSettings() {
    return request('GET', '/settings');
  },
  updateSetting(key, value) {
    return request('PUT', '/settings', { key, value });
  }
};

export default api;
