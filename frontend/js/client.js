// ===== Client API Nka Bulletin =====
// Configurez ici l'URL de votre backend déployé (voir backend/README).
const API_BASE = window.NKA_API_BASE || '/api';

const Api = (() => {
  let token = localStorage.getItem('nka_token');
  let deviceId = localStorage.getItem('nka_device_id');

  async function ensureDevice(retries = 2) {
    if (token) return { token, deviceId };
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('nka_device_id', deviceId);
    }
    const url = `${API_BASE}/auth/register-device`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      const snippet = text.slice(0, 300);
      console.error(`ensureDevice: réponse non-JSON de ${url} (${res.status}):\n${snippet}`);
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return ensureDevice(retries - 1);
      }
      throw new Error(`Backend injoignable (${res.status})`);
    }
    token = data.token;
    localStorage.setItem('nka_token', token);
    return { token, deviceId };
  }

  async function request(path, options = {}, retried = false) {
    await ensureDevice();
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    if (res.status === 401 && !retried) {
      token = null;
      localStorage.removeItem('nka_token');
      return request(path, options, true);
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      const snippet = text.slice(0, 300);
      console.error(`request ${url}: réponse non-JSON (${res.status}):\n${snippet}`);
      throw new Error(`Erreur de communication avec le serveur (${res.status})`);
    }
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  }

  return {
    ensureDevice,
    getAccounts: () => request('/accounts'),
    addAccount: (payload) => request('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
    deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),

    runSync: () => request('/sync/run', { method: 'POST' }),
    getSyncStatus: () => request('/sync/status'),
    resetSync: () => request('/sync/reset', { method: 'POST' }),
    getSyncLogs: () => request('/sync/logs'),

    getBulletins: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/bulletins${qs ? '?' + qs : ''}`);
    },
    getStats: () => request('/bulletins/stats'),
    downloadBulletin: (id) => `${API_BASE}/bulletins/${id}/download`,
    deleteBulletin: (id) => request(`/bulletins/${id}`, { method: 'DELETE' }),
    mergeBulletins: async (payload, retried = false) => {
      await ensureDevice();
      const url = `${API_BASE}/bulletins/export/merge`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.status === 401 && !retried) {
        token = null; localStorage.removeItem('nka_token');
        return Api.mergeBulletins(payload, true);
      }
      if (!res.ok) {
        const text = await res.text();
        let msg;
        try { msg = JSON.parse(text).error; } catch (_) { msg = text.slice(0, 200); }
        throw new Error(msg || 'Échec de la fusion');
      }
      return res.blob();
    },

    getSettings: () => request('/settings'),
    saveSettings: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
    reprocessAmounts: () => request('/bulletins/reprocess-amounts', { method: 'POST' }),

    fetchBulletinBlob: async (id, retried = false) => {
      await ensureDevice();
      const url = `${API_BASE}/bulletins/${id}/download`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 && !retried) {
        token = null; localStorage.removeItem('nka_token');
        return Api.fetchBulletinBlob(id, true);
      }
      if (!res.ok) {
        const text = await res.text();
        let msg;
        try { msg = JSON.parse(text).error; } catch (_) { msg = text.slice(0, 200); }
        throw new Error(msg || 'Impossible de charger le bulletin');
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
      const filename = match ? match[1].trim() : `bulletin-${id}.pdf`;
      const blob = await res.blob();
      return { blob, filename, objectUrl: URL.createObjectURL(blob) };
    },

    getVapidKey: () => request('/push/vapid-public-key'),
    subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
    unsubscribePush: () => request('/push/unsubscribe', { method: 'POST' }),
  };
})();
