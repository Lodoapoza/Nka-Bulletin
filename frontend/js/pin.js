// ===== Verrouillage par code PIN local (Web Crypto, aucune donnée envoyée au serveur) =====
const Pin = (() => {
  const STORAGE_KEY = 'nka_pin_record'; // { saltB64, hashB64 }
  const PIN_LENGTH = 4;
  const MAX_ATTEMPTS = 5;
  const COOLDOWN_SECONDS = 30;
  let entered = '';
  let mode = 'unlock'; // 'setup' | 'unlock' | 'confirm' | 'change-old' | 'change-new'
  let pendingNewPin = '';
  let onUnlocked = null;
  let attemptCount = 0;
  let cooldownTimer = null;

  const dotsEl = document.getElementById('pin-dots');
  const keypadEl = document.getElementById('pin-keypad');
  const errorEl = document.getElementById('pin-error');
  const titleEl = document.getElementById('pin-title');
  const subtitleEl = document.getElementById('pin-subtitle');
  const screenEl = document.getElementById('pin-screen');

  async function deriveHash(pin, saltBytes) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' },
      keyMaterial, 256
    );
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  }

  function bufToB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function b64ToBuf(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }

  function hasPinConfigured() {
    return !!localStorage.getItem(STORAGE_KEY);
  }

  async function setPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveHash(pin, salt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ saltB64: bufToB64(salt), hashB64: hash }));
  }

  async function verifyPin(pin) {
    const record = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!record) return false;
    const salt = b64ToBuf(record.saltB64);
    const hash = await deriveHash(pin, salt);
    return hash === record.hashB64;
  }

  function renderDots() {
    dotsEl.innerHTML = '';
    for (let i = 0; i < PIN_LENGTH; i++) {
      const d = document.createElement('div');
      d.className = 'pin-dot' + (i < entered.length ? ' filled' : '');
      dotsEl.appendChild(d);
    }
  }

  function renderKeypad() {
    keypadEl.innerHTML = '';
    const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
    keys.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'pin-key';
      btn.textContent = k;
      btn.style.visibility = k === '' ? 'hidden' : 'visible';
      btn.addEventListener('click', () => handleKey(k));
      keypadEl.appendChild(btn);
    });
  }

  async function handleKey(k) {
    // Bloqué pendant le cooldown
    if (cooldownTimer) return;

    errorEl.textContent = '';
    if (k === '⌫') { entered = entered.slice(0, -1); renderDots(); return; }
    if (k === '' || entered.length >= PIN_LENGTH) return;
    entered += k;
    renderDots();
    if (entered.length === PIN_LENGTH) {
      await onPinComplete();
    }
  }

  async function onPinComplete() {
    const pin = entered;
    if (mode === 'setup') {
      pendingNewPin = pin;
      entered = '';
      mode = 'confirm';
      titleEl.textContent = 'Confirmez votre code PIN';
      subtitleEl.textContent = 'Saisissez-le une seconde fois.';
      renderDots();
      return;
    }
    if (mode === 'confirm') {
      if (pin === pendingNewPin) {
        await setPin(pin);
        finishUnlock();
      } else {
        errorEl.textContent = 'Les codes ne correspondent pas. Recommencez.';
        entered = ''; pendingNewPin = ''; mode = 'setup';
        titleEl.textContent = 'Définissez votre code PIN';
        subtitleEl.textContent = 'Ce code protège l\'accès à vos bulletins sur cet appareil.';
        renderDots();
      }
      return;
    }
    if (mode === 'unlock') {
      const ok = await verifyPin(pin);
      if (ok) {
        finishUnlock();
      } else {
        attemptCount++;
        errorEl.textContent = 'Code incorrect.';
        entered = '';
        renderDots();

        if (attemptCount >= MAX_ATTEMPTS) {
          startCooldown();
        }
      }
      return;
    }
    if (mode === 'change-old') {
      const ok = await verifyPin(pin);
      if (ok) {
        entered = '';
        mode = 'setup'; // réutilise le flux setup/confirm pour le nouveau code
        titleEl.textContent = 'Nouveau code PIN';
        subtitleEl.textContent = 'Choisissez votre nouveau code.';
        renderDots();
      } else {
        errorEl.textContent = 'Code actuel incorrect.';
        entered = '';
        renderDots();
      }
      return;
    }
  }

  function startCooldown() {
    let remaining = COOLDOWN_SECONDS;
    errorEl.textContent = `Trop de tentatives — réessayez dans ${remaining} s`;
    subtitleEl.textContent = 'Verrouillage temporaire';

    cooldownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        attemptCount = 0;
        errorEl.textContent = '';
        entered = '';
        const pinConfigured = hasPinConfigured();
        subtitleEl.textContent = pinConfigured
          ? 'Bienvenue de retour sur Nka Bulletin.'
          : "Ce code protège l'accès à vos bulletins sur cet appareil.";
        renderDots();
      } else {
        errorEl.textContent = `Trop de tentatives — réessayez dans ${remaining} s`;
      }
    }, 1000);
  }

  function finishUnlock() {
    screenEl.classList.add('hidden');
    entered = '';
    mode = 'unlock';
    attemptCount = 0;
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
    if (onUnlocked) onUnlocked();
  }

  function resetAttempts() {
    attemptCount = 0;
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }

  function start(callback) {
    onUnlocked = callback;
    screenEl.classList.remove('hidden');
    renderKeypad();
    resetAttempts();
    if (hasPinConfigured()) {
      mode = 'unlock';
      titleEl.textContent = 'Entrez votre code PIN';
      subtitleEl.textContent = 'Bienvenue de retour sur Nka Bulletin.';
    } else {
      mode = 'setup';
      titleEl.textContent = 'Définissez votre code PIN';
      subtitleEl.textContent = "Ce code protège l'accès à vos bulletins sur cet appareil.";
    }
    renderDots();
  }

  function promptChangePin() {
    screenEl.classList.remove('hidden');
    mode = 'change-old';
    titleEl.textContent = 'Code PIN actuel';
    subtitleEl.textContent = 'Confirmez votre identité pour changer de code.';
    entered = '';
    onUnlocked = () => { Toast.show('Code PIN mis à jour.'); };
    renderDots();
    resetAttempts();
  }

  return { start, promptChangePin, hasPinConfigured };
})();
