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
  let periodPicker = null;

  function markCached(btn) {
    btn.setAttribute('aria-label', 'En local');
    btn.title = 'Disponible hors ligne';
    btn.style.color = 'var(--md-primary)';
    btn.innerHTML = ICON_CACHED;
  }

  function getPeriodLabel() {
    if (!currentYear && !currentMonth) return 'Toute la période';
    if (currentYear && !currentMonth) return String(currentYear);
    if (!currentYear && currentMonth) return MONTHS_FR[currentMonth - 1];
    return `${MONTHS_FR[currentMonth - 1]} ${currentYear}`;
  }

  function renderPeriodTrigger() {
    const btn = document.getElementById('period-trigger');
    btn.textContent = getPeriodLabel();
    btn.dataset.year = currentYear || '';
    btn.dataset.month = currentMonth || '';
  }

  function openPeriodPicker() {
    if (periodPicker) return;
    const trigger = document.getElementById('period-trigger');
    const rect = trigger.getBoundingClientRect();
    
    const years = availableYears.length ? availableYears : [new Date().getFullYear()];
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const displayYear = currentYear || new Date().getFullYear();
    let pickerYear = displayYear;

    function renderPicker() {
      const presentMonths = currentYear 
        ? new Set(cache.filter(b => b.year === currentYear).map(b => b.month))
        : new Set();

      const monthGrid = MONTHS_SHORT.map((m, i) => {
        const num = i + 1;
        const hasData = presentMonths.has(num);
        const isCurrent = (!currentYear || currentYear === pickerYear) && currentMonth === num;
        const isSelected = !currentYear && !currentMonth ? false : isCurrent;
        const disabled = currentYear && !hasData;
        return `
          <button class="picker-month${isSelected ? ' selected' : ''}${disabled ? ' disabled' : ''}" 
                  data-month="${num}" 
                  ${disabled ? 'disabled' : ''}
                  aria-label="${MONTHS_FR[i]} ${pickerYear}">
            ${m}
          </button>
        `;
      }).join('');

      return `
        <div class="period-picker" role="dialog" aria-label="Choisir la période">
          <div class="picker-header">
            <button class="picker-nav" data-year="${pickerYear - 1}" aria-label="Année précédente">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="picker-year-label">${pickerYear}</div>
            <button class="picker-nav" data-year="${pickerYear + 1}" aria-label="Année suivante">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="picker-months">${monthGrid}</div>
          <div class="picker-actions">
            <button class="btn btn-text picker-clear">${currentYear || currentMonth ? 'Effacer' : ''}</button>
            <button class="btn btn-primary picker-close">Fermer</button>
          </div>
        </div>
      `;
    }

    periodPicker = document.createElement('div');
    periodPicker.className = 'period-picker-overlay';
    periodPicker.innerHTML = renderPicker();
    document.body.appendChild(periodPicker);

    // Position
    const pickerEl = periodPicker.querySelector('.period-picker');
    pickerEl.style.top = `${rect.bottom + 8}px`;
    pickerEl.style.left = `${rect.left}px`;

    // Events
    periodPicker.addEventListener('click', (e) => {
      const nav = e.target.closest('.picker-nav');
      if (nav) {
        pickerYear = Number(nav.dataset.year);
        if (pickerYear >= minYear && pickerYear <= maxYear) {
          periodPicker.querySelector('.period-picker').innerHTML = renderPicker();
        }
        return;
      }
      const monthBtn = e.target.closest('.picker-month:not(.disabled)');
      if (monthBtn) {
        currentYear = pickerYear;
        currentMonth = Number(monthBtn.dataset.month);
        closePicker();
        renderPeriodTrigger();
        refresh();
        return;
      }
      if (e.target.closest('.picker-clear')) {
        currentYear = null;
        currentMonth = null;
        closePicker();
        renderPeriodTrigger();
        refresh();
        return;
      }
      if (e.target.closest('.picker-close') || e.target === periodPicker) {
        closePicker();
        return;
      }
    });

    // Close on outside click / escape
    const onKeyDown = (e) => { if (e.key === 'Escape') closePicker(); };
    const onClickOut = (e) => { if (!periodPicker.contains(e.target) && e.target !== trigger) closePicker(); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClickOut);

    function closePicker() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClickOut);
      periodPicker.remove();
      periodPicker = null;
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
      titleDiv.textContent = `${MONTHS_FR[b.month - 1]} ${b.year}`;
      metaDiv.appendChild(titleDiv);

      const subDiv = document.createElement('div');
      subDiv.className = 'sub';
      const identity = b.nom ? b.nom + (b.matricule ? ' · ' + b.matricule : '') : (b.matricule || '');
      subDiv.textContent = (identity ? identity + ' · ' : '') + b.account_email + (b.net_amount ? ' · ' + new Intl.NumberFormat('fr-FR').format(b.net_amount) + ' XOF' : '');
      metaDiv.appendChild(subDiv);

      row.appendChild(metaDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'bulletin-actions';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'icon-btn';
      dlBtn.dataset.download = b.id;
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
          const { blob, filename, objectUrl } = await Api.fetchBulletinBlob(btn.dataset.download);
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

  async function refresh() {
    const q = document.getElementById('search-input').value.trim();
    const params = {};
    if (currentYear) params.year = currentYear;
    if (currentMonth) params.month = currentMonth;
    if (q) params.q = q;

    const listEl = document.getElementById('bulletins-list');
    listEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>Chargement des bulletins...</div></div>';

    try {
      cache = await Api.getBulletins(params);
      // Construire la liste des années disponibles depuis TOUS les bulletins
      const all = await Api.getBulletins({ q: params.q });
      availableYears = [...new Set(all.map(b => b.year))].sort((a, b) => b - a);
      const ids = await Api.getCachedBulletinIds();
      cachedSet = new Set((ids || []).map(String));
      renderPeriodTrigger();
      renderList();
    } catch (e) {
      cache = [];
      listEl.innerHTML = '';
      Toast.show(ERR.msg(e));
    }
  }

  function bindActions() {
    document.getElementById('period-trigger').addEventListener('click', openPeriodPicker);

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
  }

  return { refresh, bindActions };
})();
