// ===== Client API Nka Bulletin =====
// Configurez ici l'URL de votre backend déployé (voir backend/README).
const API_BASE = window.NKA_API_BASE || '/api';

const Api = (() => {
  let token = localStorage.getItem('nka_token');
  let deviceId = localStorage.getItem('nka_device_id');

  async function ensureDevice() {
    if (token && deviceId) return { token, deviceId };
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('nka_device_id', deviceId);
    }
    const res = await fetch(`${API_BASE}/auth/register-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json();
    token = data.token;
    localStorage.setItem('nka_token', token);
    return { token, deviceId };
  }

  async function request(path, options = {}) {
    await ensureDevice();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
      throw new Error(err.error || `Erreur ${res.status}`);
    }
    return res;
  }

  return {
    ensureDevice,
    getAccounts: () => request('/accounts').then(r => r.json()),
    addAccount: (payload) => request('/accounts', { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json()),
    deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }).then(r => r.json()),

    runSync: () => request('/sync/run', { method: 'POST' }).then(r => r.json()),
    getSyncLogs: () => request('/sync/logs').then(r => r.json()),

    getBulletins: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/bulletins${qs ? '?' + qs : ''}`).then(r => r.json());
    },
    getStats: () => request('/bulletins/stats').then(r => r.json()),
    downloadBulletin: (id) => `${API_BASE}/bulletins/${id}/download`,
    deleteBulletin: (id) => request(`/bulletins/${id}`, { method: 'DELETE' }).then(r => r.json()),
    mergeBulletins: async (payload) => {
      await ensureDevice();
      const res = await fetch(`${API_BASE}/bulletins/export/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Échec de la fusion' }));
        throw new Error(err.error);
      }
      return res.blob();
    },

    getSettings: () => request('/settings').then(r => r.json()),
    saveSettings: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }).then(r => r.json()),

    getVapidKey: () => request('/push/vapid-public-key').then(r => r.json()),
    subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }).then(r => r.json()),
    unsubscribePush: () => request('/push/unsubscribe', { method: 'POST' }).then(r => r.json()),
  };
})();
