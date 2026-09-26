// ===== Client API Nka Bulletin =====
// Configurez ici l'URL de votre backend déployé (voir backend/README).
const API_BASE = window.NKA_API_BASE || '/api';

const Api = (() => {
  let token = localStorage.getItem('nka_token');
  let deviceId = localStorage.getItem('nka_device_id');
  // Mémoïsation single-flight manuelle : une seule requête d'enregistrement
  // concurrente pour tout le boot (les appels simultanés partagent la même
  // promesse). La promesse n'est remise à null QU'EN CAS DE SUCCÈS.
  // En cas d'échec, elle reste en place pour que les appelants concurrents
  // reçoivent la même erreur. Un appel ultérieur sans token (ex. 401) doit
  // forcer un nouvel enregistrement → on expose une fonction de reset.
  let ensureDevicePromise = null;
  let ensureDeviceResolved = false;

  function resetEnsureDevice() {
    ensureDevicePromise = null;
    ensureDeviceResolved = false;
  }

  function isOnline() {
    return navigator.onLine !== false;
  }

  // Partie réseau de l'enregistrement, retries internes compris. Les appels
  // récursifs passent par CETTE fonction (jamais par le wrapper mémoïsé,
  // sinon deadlock sur la promesse partagée).
  async function registerDevice(retries) {
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
        return registerDevice(retries - 1);
      }
      throw new Error(`Backend injoignable (${res.status})`);
    }
    token = data.token;
    localStorage.setItem('nka_token', token);
    return { token, deviceId };
  }

  async function ensureDevice(retries = 2) {
    if (token) return { token, deviceId };
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('nka_device_id', deviceId);
    }
    if (!isOnline()) return { token: null, deviceId };
    
    // Si une promesse est en cours et n'a pas encore résolu, on l'attend
    if (ensureDevicePromise && !ensureDeviceResolved) {
      return ensureDevicePromise;
    }
    
    // Sinon on crée une nouvelle tentative
    ensureDevicePromise = registerDevice(retries);
    ensureDeviceResolved = false;
    try {
      const result = await ensureDevicePromise;
      ensureDeviceResolved = true;
      return result;
    } catch (e) {
      // En cas d'échec, on garde la promesse pour les appelants concurrents
      // mais on permet un reset explicite via resetEnsureDevice()
      throw e;
    }
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
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const isSyncStatus = path.startsWith('/sync/status');

    if (!isOnline()) {
      if (isGet && !isSyncStatus) {
        const cached = await OfflineCache.getApi(path);
        if (cached) {
          notifyConnection('offline');
          dispatchCacheHit(path, cached.cachedAt);
          return cached.data;
        }
        notifyConnection('offline');
        throw new Error('Hors ligne — données non disponibles en cache');
      }
      notifyConnection('offline');
      throw new Error('Hors ligne — action impossible sans connexion');
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let res;
      try {
        res = await fetchWithTimeout(url, {
          ...options,
          headers,
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
        resetEnsureDevice(); // Permet un nouvel enregistrement device au retry
        Toast.show('Session expirée ou appareil déconnecté — reconnectez-vous.');
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

      if (res.status === 403 && data && data.code === 'LICENCE_EXPIRED') {
        // Blocage abonnement : ne PAS servir le cache offline (contournement impossible).
        notifyConnection('online');
        window.dispatchEvent(new CustomEvent('nka-licence-expired', { detail: data }));
        throw new Error(data.error || 'Abonnement expiré');
      }

      if (!res.ok) {
        notifyConnection('online');
        throw new Error(data.error || `Erreur ${res.status}`);
      }
      notifyConnection('online');
      if (isGet && res.ok && !isSyncStatus) {
        OfflineCache.setApi(path, data).catch(() => {});
        if (res.headers.get('X-Cache') === 'hit') {
          dispatchCacheHit(path, Date.now());
        }
      }
      return data;
    }
  }

  // ===== Cache hors-ligne (IndexedDB) =====
  const DB_NAME = 'nka-offline-cache';
  const DB_VERSION = 2;

  const OfflineCache = (() => {
    let dbPromise = null;
    // TTL par défaut : 7 jours pour les données API, 30 jours pour les PDFs
    const API_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const PDF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

    function openDb() {
      if (!dbPromise) {
        dbPromise = new Promise((resolve) => {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            // Recréer les stores à chaque changement de version pour purger les caches périmés
            if (db.objectStoreNames.contains('api')) db.deleteObjectStore('api');
            if (db.objectStoreNames.contains('pdf')) db.deleteObjectStore('pdf');
            const store = db.createObjectStore('api', { keyPath: 'key' });
            store.createIndex('cachedAt', 'cachedAt');
            const pdfStore = db.createObjectStore('pdf', { keyPath: 'key' });
            pdfStore.createIndex('cachedAt', 'cachedAt');
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => {
            console.warn('[offline-cache] Ouverture IndexedDB impossible', req.error);
            resolve(null);
          };
        });
      }
      return dbPromise;
    }

    async function withStore(storeName, mode, fn) {
      const db = await openDb();
      if (!db) return undefined;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, mode);
          const req = fn(tx.objectStore(storeName));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => {
            console.warn(`[offline-cache] Lecture ${storeName} impossible`, req.error);
            resolve(undefined);
          };
        } catch (e) {
          console.warn(`[offline-cache] Transaction ${storeName} impossible`, e);
          resolve(undefined);
        }
      });
    }

    async function write(storeName, record) {
      try {
        const db = await openDb();
        if (!db) return;
        await new Promise((resolve) => {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => {
            console.warn(`[offline-cache] Écriture ${storeName} impossible`, tx.error);
            resolve();
          };
          tx.onabort = () => {
            if (tx.error && tx.error.name === 'QuotaExceededError') {
              console.warn('[offline-cache] Quota dépassé, écriture ignorée');
            }
            resolve();
          };
        });
      } catch (e) {
        console.warn(`[offline-cache] Écriture ${storeName} impossible`, e);
      }
    }

    return {
      setApi(path, data) {
        return write('api', { key: path, data, cachedAt: Date.now() });
      },
      async getApi(path) {
        const rec = await withStore('api', 'readonly', (store) => store.get(path));
        if (!rec) return undefined;
        // Vérifier TTL (7 jours par défaut)
        if (Date.now() - rec.cachedAt > API_TTL_MS) {
          // Supprimer l'entrée expirée proprement
          withStore('api', 'readwrite', (store) => store.delete(path)).catch(() => {});
          return undefined;
        }
        return { data: rec.data, cachedAt: rec.cachedAt };
      },
      clearApi(path) {
        return withStore('api', 'readwrite', (store) => store.delete(path));
      },
      clearAll() {
        return Promise.all([
          withStore('api', 'readwrite', (store) => store.clear()),
          withStore('pdf', 'readwrite', (store) => store.clear()),
        ]);
      },
      async close() {
        if (!dbPromise) return;
        const pending = dbPromise;
        dbPromise = null;
        try {
          const db = await pending;
          if (db) db.close();
        } catch (_) {}
      },
      setPdf(id, blob, filename, meta) {
        return write('pdf', { key: String(id), blob, filename, meta: meta || null, cachedAt: Date.now() });
      },
      async getPdf(id) {
        const rec = await withStore('pdf', 'readonly', (store) => store.get(String(id)));
        if (!rec) return undefined;
        // Vérifier TTL (30 jours par défaut)
        if (Date.now() - rec.cachedAt > PDF_TTL_MS) {
          withStore('pdf', 'readwrite', (store) => store.delete(String(id))).catch(() => {});
          return undefined;
        }
        return { blob: rec.blob, filename: rec.filename, cachedAt: rec.cachedAt };
      },
      async listPdfIds() {
        const keys = await withStore('pdf', 'readonly', (store) => store.getAllKeys());
        if (!keys) return [];
        return keys.map(String);
      },
      async listPdfRecords() {
        const recs = await withStore('pdf', 'readonly', (store) => store.getAll());
        if (!recs) return [];
        return recs.map(r => ({ key: r.key, filename: r.filename, meta: r.meta || null, cachedAt: r.cachedAt }));
      },
    };
  })();

  function dispatchCacheHit(path, cachedAt) {
    window.dispatchEvent(new CustomEvent('nka-cache-hit', { detail: { path, cachedAt } }));
  }

  // ===== Sondage du statut de synchro =====
  // Un scan complet (35 ans) peut prendre jusqu'à ~1h30 côté backend.
  // On sonde rapidement au début (1,5 s) puis on espace à 5 s après 2 min,
  // avec une garde de sécurité de 2 h. La synchro continue en arrière-plan
  // même si on atteint la garde — on prévient juste l'utilisateur.
  async function pollSyncStatus(requestId, onProgress) {
    // Compatibilité avec les anciens appels pollSyncStatus(callback).
    if (typeof requestId === 'function') { onProgress = requestId; requestId = null; }
    const FAST_INTERVAL = 1500;     // 1,5 s
    const SLOW_INTERVAL = 5000;     // 5 s
    const FAST_DURATION = 120000;  // 2 min en mode rapide
    const SAFETY_CAP = 7200000;    // 2 h (garde de sécurité)
    const start = Date.now();
    let lastTick = 0; // Throttle de l'événement nka-sync-tick (~10 s)
    let status = { status: 'running' };
    for (;;) {
      const elapsed = Date.now() - start;
      if (elapsed >= SAFETY_CAP) return status;
      const delay = elapsed < FAST_DURATION ? FAST_INTERVAL : SLOW_INTERVAL;
      await new Promise(r => setTimeout(r, delay));
      try {
        status = await Api.getSyncStatus(requestId);
      } catch (e) {
        // Erreur réseau passagère — on continue à sonder ; la synchro backend suit son cours.
        continue;
      }
      if (onProgress) { try { onProgress(status); } catch (_) {} }
      // 'none' : aucune sync_request pour cet appareil (device orphelin, premier lancement).
      // La synchro s'est terminée trop vite pour être captée ou n'a jamais existé.
      // On traite comme 'done' pour éviter un spin infini jusqu'au safety cap.
      if (status.status === 'none') {
        status.status = 'done';
        status.new_bulletins = 0;
        return status;
      }
      // Rafraîchissement progressif : tant que le scan tourne, on prévient les vues
      // (ex. liste des bulletins) toutes les ~10 s pour montrer l'arrivée des bulletins.
      if (Date.now() - lastTick >= 10000) {
        lastTick = Date.now();
        window.dispatchEvent(new CustomEvent('nka-sync-tick'));
      }
      if (status.status === 'done' || status.status === 'failed') return status;
    }
  }

  return {
    ensureDevice,
    // Éjection automatique : quand le compte a déjà 3 appareils, le serveur déconnecte
    // le plus ancien et renvoie ejected:true — on prévient l'utilisateur.
    loginEmail: async (email) => {
      const data = await request('/auth/login-email', { method: 'POST', body: JSON.stringify({ email }) });
      if (data && data.ejected && typeof Toast !== 'undefined') {
        Toast.show("L'appareil le plus ancien de ce compte a été déconnecté automatiquement.");
      }
      return data;
    },
    setEmail: (email) => request('/auth/set-email', { method: 'POST', body: JSON.stringify({ email }) }),
    getAccounts: (opts = {}) => request(`/accounts${opts.nocache ? '?sw-no-cache=' + Date.now() : ''}`),
    addAccount: (payload) => request('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
    deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),
    clearApiCache: (path) => OfflineCache.clearApi(path),
    clearAllCache: () => OfflineCache.clearAll(),
    closeOfflineCache: () => OfflineCache.close(),

    runSync: (opts = {}) => request('/sync/run', { method: 'POST', body: JSON.stringify(opts) }),
    getSyncStatus: (requestId) => request(
      `/sync/status${requestId ? '?id=' + encodeURIComponent(requestId) + '&sw-no-cache=' + Date.now() : '?sw-no-cache=' + Date.now()}`
    ),
    resetSync: () => request('/sync/reset', { method: 'POST' }),
    getSyncLogs: () => request('/sync/logs'),
    pollSyncStatus,

    getBulletins: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/bulletins${qs ? '?' + qs : ''}`);
    },
    getStats: () => request('/bulletins/stats'),
    getAnalyseSalary: (year) => request(`/analyse/salary${year ? '?year=' + encodeURIComponent(year) : ''}`),
    downloadBulletin: (id) => `${API_BASE}/bulletins/${id}/download`,
    getCachedBulletinIds: () => OfflineCache.listPdfIds(),
    listCachedBulletins: () => OfflineCache.listPdfRecords(),
    deleteBulletin: (id) => request(`/bulletins/${id}`, { method: 'DELETE' }),
    mergeBulletins: async (payload, retried = false) => {
      await ensureDevice();
      if (!isOnline()) {
        notifyConnection('offline');
        throw new Error('Hors ligne — action impossible');
      }
      const url = `${API_BASE}/bulletins/export/merge`;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        let res;
        try {
          res = await fetchWithTimeout(url, {
            method: 'POST',
            headers,
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
          let body;
          try { body = JSON.parse(text); msg = body.error; } catch (_) { msg = text.slice(0, 200); }
          if (res.status === 403 && body && body.code === 'LICENCE_EXPIRED') {
            notifyConnection('online');
            window.dispatchEvent(new CustomEvent('nka-licence-expired', { detail: body }));
            throw new Error(msg || 'Abonnement expiré');
          }
          notifyConnection('offline');
          throw new Error(msg || 'Échec de la fusion');
        }
        notifyConnection('online');
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
        const filename = match ? match[1].trim() : 'bulletins-fusionnes.pdf';
        const blob = await res.blob();
        return { blob, filename };
      }
    },

    getSettings: () => request('/settings'),
    saveSettings: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
    reprocessAmounts: () => request('/bulletins/reprocess-amounts', { method: 'POST' }),

    fetchBulletinBlob: async (id, meta = null, retried = false) => {
      await ensureDevice();
      if (!isOnline()) {
        const cachedPdf = await OfflineCache.getPdf(id);
        if (cachedPdf) {
          notifyConnection('offline');
          dispatchCacheHit(`pdf:${id}`, cachedPdf.cachedAt);
          return { blob: cachedPdf.blob, filename: cachedPdf.filename, objectUrl: URL.createObjectURL(cachedPdf.blob) };
        }
        notifyConnection('offline');
        throw new Error('Hors ligne — bulletin non disponible en cache');
      }
      const url = `${API_BASE}/bulletins/${id}/download`;
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        let res;
        try {
          res = await fetchWithTimeout(url, { headers });
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            notifyConnection('reconnecting');
            const delay = backoff(attempt);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          const cachedPdf = await OfflineCache.getPdf(id);
          if (cachedPdf) {
            notifyConnection('offline');
            dispatchCacheHit(`pdf:${id}`, cachedPdf.cachedAt);
            return { blob: cachedPdf.blob, filename: cachedPdf.filename, objectUrl: URL.createObjectURL(cachedPdf.blob) };
          }
          notifyConnection('offline');
          throw new Error('Serveur indisponible, réessayez dans un instant');
        }
        if (res.status === 401 && !retried) {
          token = null; localStorage.removeItem('nka_token');
          return Api.fetchBulletinBlob(id, meta, true);
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
          let body;
          try { body = JSON.parse(text); msg = body.error; } catch (_) { msg = text.slice(0, 200); }
          if (res.status === 403 && body && body.code === 'LICENCE_EXPIRED') {
            notifyConnection('online');
            window.dispatchEvent(new CustomEvent('nka-licence-expired', { detail: body }));
            throw new Error(msg || 'Abonnement expiré');
          }
          const cachedPdf = await OfflineCache.getPdf(id);
          if (cachedPdf) {
            notifyConnection('offline');
            dispatchCacheHit(`pdf:${id}`, cachedPdf.cachedAt);
            return { blob: cachedPdf.blob, filename: cachedPdf.filename, objectUrl: URL.createObjectURL(cachedPdf.blob) };
          }
          notifyConnection('offline');
          throw new Error(msg || 'Impossible de charger le bulletin');
        }
        notifyConnection('online');
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
        const filename = match ? match[1].trim() : `bulletin-${id}.pdf`;
        const blob = await res.blob();
        OfflineCache.setPdf(id, blob, filename, meta).catch(() => {});
        return { blob, filename, objectUrl: URL.createObjectURL(blob) };
      }
    },

    getVapidKey: () => request('/push/vapid-public-key'),
    subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
    unsubscribePush: () => request('/push/unsubscribe', { method: 'POST' }),
    sendTestPush: () => request('/push/test', { method: 'POST' }),
    // Utilitaire pour forcer un ré-enregistrement device (ex. déconnexion, reset)
    _resetEnsureDevice: resetEnsureDevice,
    // Enregistrer une synchronisation en arrière-plan (Background Sync API)
    // À appeler quand l'utilisateur demande une sync hors ligne
    async registerBackgroundSync() {
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.sync.register('nka-sync');
          return true;
        } catch (e) {
          console.warn('[client] Background Sync registration failed:', e.message);
          return false;
        }
      }
      return false;
    },

    // ===== Admin (système de licences) =====
    // Appels authentifiés par X-Admin-Token (indépendants de la session device).
    async admin(path, adminToken, options = {}) {
      if (!isOnline()) throw new Error('Hors ligne — impossible de contacter le serveur');
      const url = `${API_BASE}${path}`;
      const res = await fetchWithTimeout(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
          ...(options.headers || {}),
        },
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (_) { data = { error: text.slice(0, 200) }; }
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      return data;
    },
  };
})();
