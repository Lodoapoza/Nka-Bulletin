;(function () {
  // ===== Administration des licences (accès caché) =====
  // 5 taps rapides sur le numéro de version (vue À propos) → mot de passe admin →
  // liste des matricules autorisés (statut, durée, expiration) + autoriser / révoquer.

  const $ = (id) => document.getElementById(id);

  let adminToken = null;

  // ---------- Lancement caché : 5 taps sur la version ----------
  const TAP_WINDOW = 3000;
  const TAPS_REQUIRED = 5;
  let tapCount = 0;
  let tapTimer = null;

  function bindVersionLaunch() {
    const versionEl = $('about-version');
    if (!versionEl) return;
    versionEl.addEventListener('click', () => {
      tapCount++;
      clearTimeout(tapTimer);
      if (tapCount >= TAPS_REQUIRED) {
        tapCount = 0;
        openAdmin();
        return;
      }
      tapTimer = setTimeout(() => { tapCount = 0; }, TAP_WINDOW);
    });
  }

  // ---------- Écran admin ----------
  function openAdmin() {
    $('admin-screen').classList.remove('hidden');
    $('admin-error').textContent = '';
    if (adminToken) {
      $('admin-login-block').classList.add('hidden');
      $('admin-panel').classList.remove('hidden');
      loadLicenses();
    } else {
      $('admin-login-block').classList.remove('hidden');
      $('admin-panel').classList.add('hidden');
      $('admin-password').value = '';
      setTimeout(() => $('admin-password').focus(), 60);
    }
  }

  function closeAdmin() {
    $('admin-screen').classList.add('hidden');
  }

  async function login() {
    const errEl = $('admin-error');
    errEl.textContent = '';
    const password = $('admin-password').value.trim();
    if (!password) { errEl.textContent = 'Mot de passe requis.'; return; }
    try {
      await Api.admin('/admin/license/list', password);
      adminToken = password;
      $('admin-login-block').classList.add('hidden');
      $('admin-panel').classList.remove('hidden');
      loadLicenses();
    } catch (e) {
      errEl.textContent = (window.ERR && ERR.msg) ? ERR.msg(e) : String(e.message || e);
    }
  }

  async function loadLicenses() {
    const listEl = $('admin-licenses');
    try {
      const data = await Api.admin('/admin/license/list', adminToken);
      renderLicenses(listEl, data.licenses || []);
    } catch (e) {
      listEl.innerHTML = `<div class="hint">${esc((window.ERR && ERR.msg) ? ERR.msg(e) : String(e.message || e))}</div>`;
    }
  }

  function fmtDate(iso) {
    if (!iso) return 'Illimité';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtDuration(months) {
    if (months == null) return 'Illimité';
    if (months === 12) return '1 an';
    if (months === 1) return '1 mois';
    return `${months} mois`;
  }

  const STATE_LABEL = { active: 'Active', expired: 'Expirée', revoked: 'Révoquée' };

  function renderLicenses(listEl, licenses) {
    if (!licenses.length) {
      listEl.innerHTML = '<div class="hint">Aucune licence pour l\'instant.</div>';
      return;
    }
    listEl.innerHTML = licenses.map((l) => `
      <div class="license-row">
        <div class="license-main">
          <div class="license-matricule mono">${esc(l.matricule)}</div>
          <div class="license-sub">${fmtDuration(l.months)} · expire ${fmtDate(l.expires_at)} · via ${esc(l.granted_by)}</div>
        </div>
        <div class="license-side">
          <span class="license-state state-${l.state}"><span class="dot"></span>${STATE_LABEL[l.state] || esc(l.state)}</span>
          ${l.state !== 'revoked' ? `<button class="btn btn-outline btn-xs" data-revoke="${esc(l.matricule)}">Révoquer</button>` : ''}
        </div>
      </div>`).join('');
    listEl.querySelectorAll('[data-revoke]').forEach((btn) => {
      btn.addEventListener('click', () => revoke(btn.dataset.revoke));
    });
  }

  async function grant() {
    const input = $('admin-matricule');
    const matricule = input.value.trim().toUpperCase();
    if (!matricule) return;
    const months = Number($('admin-duration').value);
    try {
      await Api.admin('/admin/license/grant', adminToken, {
        method: 'POST',
        body: JSON.stringify({ matricule, months: months || undefined }),
      });
      input.value = '';
      loadLicenses();
    } catch (e) {
      if (window.Toast) Toast.show((window.ERR && ERR.msg) ? ERR.msg(e) : String(e.message || e));
    }
  }

  async function revoke(matricule) {
    try {
      await Api.admin('/admin/license/revoke', adminToken, {
        method: 'POST',
        body: JSON.stringify({ matricule }),
      });
      loadLicenses();
    } catch (e) {
      if (window.Toast) Toast.show((window.ERR && ERR.msg) ? ERR.msg(e) : String(e.message || e));
    }
  }

  // ---------- Blocage « Abonnement expiré » ----------
  function showLicenceScreen(detail) {
    if (detail && detail.matricule) {
      $('licence-msg').textContent =
        `Matricule ${detail.matricule} : votre abonnement n'est plus actif. Contactez votre administrateur.`;
    }
    $('licence-screen').classList.remove('hidden');
  }

  function hideLicenceScreen() {
    $('licence-screen').classList.add('hidden');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function bind() {
    bindVersionLaunch();
    $('admin-close-btn').addEventListener('click', closeAdmin);
    $('admin-login-btn').addEventListener('click', login);
    $('admin-grant-btn').addEventListener('click', grant);
    $('licence-close-btn').addEventListener('click', hideLicenceScreen);
    $('admin-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    $('admin-matricule').addEventListener('keydown', (e) => { if (e.key === 'Enter') grant(); });
    window.addEventListener('nka-licence-expired', (e) => showLicenceScreen(e.detail));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();