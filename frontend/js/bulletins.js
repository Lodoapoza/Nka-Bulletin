const Bulletins = (() => {
  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const ICON_DOWNLOAD = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CACHED = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let currentYear = null;
  let currentMonth = null;
  let selected = new Set();
  let cache = [];
  let cachedSet = new Set();
  let availableYears = [];
  let yearDropdown = null;
  let monthDropdown = null;

  function markCached(btn) {
    btn.setAttribute('aria-label', 'En local');
    btn.title = 'Disponible hors ligne';
    btn.style.color = 'var(--md-primary)';
    btn.innerHTML = ICON_CACHED;
  }

  // ===== Filtres (dropdown custom partagé — voir dropdown.js) =====
  function renderYearDropdown() {
    const opts = [{ value: '', label: 'Toutes les années', selected: currentYear === null }];
    availableYears.forEach(y => opts.push({ value: String(y), label: String(y), selected: currentYear === y }));
    if (!yearDropdown) {
      yearDropdown = AppDropdown.create('year-trigger', opts, (v) => {
        currentYear = v;
        renderMonthDropdown();
        refresh();
      }, (v) => v ? String(v) : 'Toutes les années');
    } else {
      yearDropdown.setOptions(opts);
    }
  }

  function renderMonthDropdown() {
    let opts = [{ value: '', label: 'Tous les mois', selected: currentMonth === null }];
    if (currentYear) {
      const present = new Set(cache.filter(b => b.year === currentYear).map(b => b.month));
      MONTHS_FR.forEach((m, i) => {
        const num = i + 1;
        if (present.has(num)) opts.push({ value: String(num), label: m, selected: currentMonth === num });
      });
    } else {
      MONTHS_FR.forEach((m, i) => opts.push({ value: String(i + 1), label: m, selected: currentMonth === i + 1 }));
    }
    if (!monthDropdown) {
      monthDropdown = AppDropdown.create('month-trigger', opts, (v) => {
        currentMonth = v;
        refresh();
      }, (v) => v ? MONTHS_FR[v - 1] : 'Tous les mois');
    } else {
      monthDropdown.setOptions(opts);
    }
  }

  function renderList() {
    const listEl = document.getElementById('bulletins-list');
    if (!cache.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="glyph">🗂️</div><div>Aucun bulletin</div></div>`;
      updateMergeBar();
      return;
    }
    listEl.innerHTML = '';
    cache.forEach(b => {
      const row = document.createElement('div');
      row.className = 'bulletin-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.id = b.id;
      if (b.cachedOnly) {
        checkbox.disabled = true;
        checkbox.title = 'Bulletin local — fusion indisponible';
      }
      if (selected.has(b.id)) checkbox.checked = true;
      row.appendChild(checkbox);

      const iconDiv = document.createElement('div');
      iconDiv.className = 'bulletin-icon';
      iconDiv.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l3 3v15H6z" stroke="currentColor" stroke-width="1.6"/><path d="M9 9h6M9 12h6M9 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      row.appendChild(iconDiv);

      const metaDiv = document.createElement('div');
      metaDiv.className = 'bulletin-meta';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'title';
      titleDiv.textContent = b.noMeta
        ? (b.filename || `Bulletin #${b.id}`)
        : (b.type === 'gratification'
            ? (b.period_label || `Gratification ${b.year}`)
            : `${MONTHS_FR[b.month - 1]} ${b.year}`);
      metaDiv.appendChild(titleDiv);

      const subDiv = document.createElement('div');
      subDiv.className = 'sub';
      if (b.noMeta) {
        subDiv.textContent = 'En local uniquement';
      } else {
        // Sous-titre : nom (si présent) + montant net (masqué si l'utilisateur a
        // activé « masquer les montants » sur le tableau de bord). Le matricule et
        // l'email ne sont plus affichés ici — info redondante sur la liste.
        const parts = [];
        if (b.nom) parts.push(b.nom);
        if (b.net_amount) {
          const hidden = localStorage.getItem('nka_amounts_hidden') === '1';
          parts.push((hidden ? '•••••' : new Intl.NumberFormat('fr-FR').format(b.net_amount)) + ' XOF');
        }
        subDiv.textContent = parts.join(' · ');
      }
      metaDiv.appendChild(subDiv);

      row.appendChild(metaDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'bulletin-actions';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'icon-btn';
      dlBtn.dataset.download = b.id;
      if (!b.noMeta) {
        dlBtn.dataset.meta = JSON.stringify({
          id: b.id, year: b.year, month: b.month, net_amount: b.net_amount,
          account_email: b.account_email, nom: b.nom, matricule: b.matricule,
          type: b.type, period_label: b.period_label,
        });
      }
      if (cachedSet.has(String(b.id))) {
        markCached(dlBtn);
      } else {
        dlBtn.setAttribute('aria-label', 'Télécharger');
        dlBtn.innerHTML = ICON_DOWNLOAD;
      }
      actionsDiv.appendChild(dlBtn);

      row.appendChild(actionsDiv);

      listEl.appendChild(row);
    });

    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = Number(cb.dataset.id);
        if (cb.checked) selected.add(id); else selected.delete(id);
        updateMergeBar();
      });
    });
    listEl.querySelectorAll('[data-download]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          let meta = null;
          try { meta = JSON.parse(btn.dataset.meta || 'null'); } catch (_) {}
          const { blob, filename, objectUrl } = await Api.fetchBulletinBlob(btn.dataset.download, meta);
          const cachedId = String(btn.dataset.download);
          if (!cachedSet.has(cachedId)) {
            cachedSet.add(cachedId);
            markCached(btn);
          }
          if (NativeBridge && NativeBridge.isNative) {
            const opened = await NativeBridge.previewFile(blob, filename);
            if (!opened) await NativeBridge.shareFile(blob, filename);
            URL.revokeObjectURL(objectUrl);
          } else {
            window.open(objectUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
          }
        } catch (e) {
          Toast.show(ERR.msg(e));
        }
      });
    });
  }

  function updateMergeBar() {
    const bar = document.getElementById('merge-bar');
    document.getElementById('merge-count').textContent = `${selected.size} sélectionné(s)`;
    bar.classList.toggle('hidden', selected.size < 2);
  }

  async function mergeAndExport(payload, label) {
    Toast.show('Fusion des bulletins en cours...');
    try {
      const { blob, filename } = await Api.mergeBulletins(payload);
      if (NativeBridge && NativeBridge.isNative) {
        // App : aperçu système (FileOpener) quand disponible, sinon repli partage.
        const opened = await NativeBridge.previewFile(blob, filename);
        if (!opened) await NativeBridge.shareFile(blob, filename);
        return;
      }
      // Web : affiche l'aperçu PDF dans un nouvel onglet (l'utilisateur peut alors
      // l'imprimer/le télécharger/le partager depuis le visionneur du navigateur).
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      Toast.show('Aperçu ouvert — choisissez votre action depuis l\'aperçu');
    } catch (e) {
      Toast.show(ERR.msg(e));
    }
  }

  function matchesFilters(b, params) {
    if (params.year && b.year !== Number(params.year)) return false;
    if (params.month && b.month !== Number(params.month)) return false;
    if (params.q) {
      const hay = [b.nom, b.matricule, b.account_email].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(params.q.toLowerCase())) return false;
    }
    return true;
  }

  async function refresh() {
    const q = document.getElementById('search-input').value.trim();
    const params = {};
    if (currentYear) params.year = currentYear;
    if (currentMonth) params.month = currentMonth;
    if (q) params.q = q;

    const listEl = document.getElementById('bulletins-list');
    listEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>Chargement des bulletins...</div></div>';

    try {
      const serverList = await Api.getBulletins(params);

      // Fusion avec le cache local : un bulletin téléchargé (PDF en cache)
      // doit rester visible même si le serveur ne le retourne pas encore
      // (synchro incomplète, suppression serveur, etc.).
      const cachedRecs = await Api.listCachedBulletins();
      const serverIds = new Set(serverList.map(b => String(b.id)));
      const cachedAll = cachedRecs.filter(r => r.meta && r.meta.id != null).map(r => r.meta);
      const cachedBullets = cachedAll
        .filter(b => !serverIds.has(String(b.id)))
        .map(b => ({ ...b, cachedOnly: true }))
        .filter(b => matchesFilters(b, params));
      // Anciens caches sans métadonnées : affichés seulement sans filtre année/mois
      const noMetaRecs = !params.year && !params.month
        ? cachedRecs.filter(r => !r.meta && !serverIds.has(String(r.key)))
            .map(r => ({ id: Number(r.key), filename: r.filename, cachedOnly: true, noMeta: true }))
        : [];

      cache = [...serverList, ...cachedBullets, ...noMetaRecs]
        .sort((a, b) => (b.year - a.year) || (b.month - a.month));

      // Années disponibles : serveur (sans filtre) + cache local
      let all = [];
      try {
        // N'envoyer q que s'il est défini : sinon URLSearchParams produit
        // « q=undefined » et le serveur filtre filename LIKE '%undefined%' → liste vide.
        all = await Api.getBulletins(params.q ? { q: params.q } : {});
      } catch (_) {
        all = serverList;
      }
      const source = [...(all.length ? all : serverList), ...cachedAll];
      availableYears = [...new Set(source.map(b => b.year))].sort((a, b) => b - a);

      const ids = await Api.getCachedBulletinIds();
      cachedSet = new Set((ids || []).map(String));
      renderYearDropdown();
      renderMonthDropdown();
      renderList();
    } catch (e) {
      cache = [];
      listEl.innerHTML = '';
      Toast.show(ERR.msg(e));
    }
  }

  function bindActions() {
    // Dropdowns are initialized in renderYearDropdown/renderMonthDropdown
    let searchTimer;
    document.getElementById('search-input').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(refresh, 300);
    });

    document.getElementById('merge-selected-btn').addEventListener('click', () => {
      mergeAndExport({ ids: [...selected] }, 'selection');
    });

    document.querySelectorAll('[data-merge]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.merge;
        if (val === 'year') mergeAndExport({ year: currentYear || new Date().getFullYear() }, 'annee');
        else mergeAndExport({ lastNMonths: Number(val) }, `${val}-mois`);
      });
    });

    // Rafraîchissement progressif pendant un scan : le client émet nka-sync-tick
    // toutes les ~10 s tant que la synchro tourne. On ne rafraîchit que si la vue
    // bulletins est visible (Router : classe « hidden » sur #view-bulletins), avec
    // un throttle identique pour éviter les surcharges.
    let lastSyncTick = 0;
    window.addEventListener('nka-sync-tick', () => {
      const viewEl = document.getElementById('view-bulletins');
      if (!viewEl || viewEl.classList.contains('hidden')) return;
      if (Date.now() - lastSyncTick < 10000) return;
      lastSyncTick = Date.now();
      refresh();
    });
  }

  return { refresh, bindActions };
})();
