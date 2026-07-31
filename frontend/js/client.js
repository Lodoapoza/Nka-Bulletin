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

  const RETRYABLE_STATUS = new Set([502, 503, 504]);
  const MAX_RETRIES = 3;

  function backoff(attempt) {
    return Math.min(8000, 500 * Math.pow(2, attempt) + Math.random() * 1000);
  }

  function notifyConnection(state) {
    const evt = new CustomEvent('nka-connection', { detail: state });
    window.dispatchEvent(evt);
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(path, options = {}, retried = false) {
    await ensureDevice();
    const url = `${API_BASE}${path}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let res;
      try {
        res = await fetchWithTimeout(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
          },
        });
      } catch (err) {
        const isTimeout = err.name === 'AbortError';
        if (attempt < MAX_RETRIES) {
          notifyConnection('reconnecting');
          const delay = backoff(attempt);
          console.warn(`[client] Retry ${path} (${isTimeout ? 'timeout' : 'réseau'}) dans ${Math.round(delay)}ms (tentative ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        notifyConnection('offline');
        throw new Error(isTimeout ? 'Le serveur met trop de temps à répondre' : 'Serveur indisponible, réessayez dans un instant');
      }

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
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
          notifyConnection('reconnecting');
          const delay = backoff(attempt);
          console.warn(`[client] Retry ${path} (${res.status}) dans ${Math.round(delay)}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        notifyConnection('offline');
        throw new Error(`Serveur indisponible (${res.status})`);
      }

      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        notifyConnection('reconnecting');
        const delay = backoff(attempt);
        console.warn(`[client] Retry ${path} (${res.status}) dans ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        notifyConnection('offline');
        throw new Error(data.error || `Erreur ${res.status}`);
      }
      notifyConnection('online');
      return data;
    }
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
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        let res;
        try {
          res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            notifyConnection('reconnecting');
            const delay = backoff(attempt);
            console.warn(`[client] Retry merge (réseau) dans ${Math.round(delay)}ms`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          notifyConnection('offline');
          throw new Error('Serveur indisponible, réessayez dans un instant');
        }
        if (res.status === 401 && !retried) {
          token = null; localStorage.removeItem('nka_token');
          return Api.mergeBulletins(payload, true);
        }
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
          notifyConnection('reconnecting');
          const delay = backoff(attempt);
          console.warn(`[client] Retry merge (${res.status}) dans ${Math.round(delay)}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (!res.ok) {
          const text = await res.text();
          let msg;
          try { msg = JSON.parse(text).error; } catch (_) { msg = text.slice(0, 200); }
          notifyConnection('offline');
          throw new Error(msg || 'Échec de la fusion');
        }
        notifyConnection('online');
        return res.blob();
      }
    },

    getSettings: () => request('/settings'),
    saveSettings: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
    reprocessAmounts: () => request('/bulletins/reprocess-amounts', { method: 'POST' }),

    fetchBulletinBlob: async (id, retried = false) => {
      await ensureDevice();
      const url = `${API_BASE}/bulletins/${id}/download`;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        let res;
        try {
          res = await fetchWithTimeout(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            notifyConnection('reconnecting');
            const delay = backoff(attempt);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          notifyConnection('offline');
          throw new Error('Serveur indisponible, réessayez dans un instant');
        }
        if (res.status === 401 && !retried) {
          token = null; localStorage.removeItem('nka_token');
          return Api.fetchBulletinBlob(id, true);
        }
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
          notifyConnection('reconnecting');
          const delay = backoff(attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (!res.ok) {
          const text = await res.text();
          let msg;
          try { msg = JSON.parse(text).error; } catch (_) { msg = text.slice(0, 200); }
          notifyConnection('offline');
          throw new Error(msg || 'Impossible de charger le bulletin');
        }
        notifyConnection('online');
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
        const filename = match ? match[1].trim() : `bulletin-${id}.pdf`;
        const blob = await res.blob();
        return { blob, filename, objectUrl: URL.createObjectURL(blob) };
      }
    },

    getVapidKey: () => request('/push/vapid-public-key'),
    subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
    unsubscribePush: () => request('/push/unsubscribe', { method: 'POST' }),
  };
})();
