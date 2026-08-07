const Bulletins = (() => {
  const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const ICON_DOWNLOAD = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CACHED = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let currentYear = null;
  let currentMonth = null;
  let selected = new Set();
  let cache = [];
  let cachedSet = new Set();

  function markCached(btn) {
    btn.setAttribute('aria-label', 'En local');
    btn.title = 'Disponible hors ligne';
    btn.style.color = 'var(--md-primary)';
    btn.innerHTML = ICON_CACHED;
  }

  function renderYearChips() {
    const wrap = document.getElementById('year-chips');
    const thisYear = new Date().getFullYear();
    const years = [thisYear, thisYear - 1, thisYear - 2];
    wrap.innerHTML = `<button class="chip ${currentYear === null ? 'active' : ''}" data-year="">Toutes les années</button>` +
      years.map(y => `<button class="chip ${currentYear === y ? 'active' : ''}" data-year="${y}">${y}</button>`).join('');
    wrap.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
      currentYear = chip.dataset.year ? Number(chip.dataset.year) : null;
      renderYearChips();
      refresh();
    }));
  }

  function renderMonthChips() {
    const wrap = document.getElementById('month-chips');
    wrap.innerHTML = `<button class="chip ${currentMonth === null ? 'active' : ''}" data-month="">Tous les mois</button>` +
      MONTHS_FR.map((m, i) => `<button class="chip ${currentMonth === i + 1 ? 'active' : ''}" data-month="${i + 1}">${m}</button>`).join('');
    wrap.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
      currentMonth = chip.dataset.month ? Number(chip.dataset.month) : null;
      renderMonthChips();
      refresh();
    }));
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
            await NativeBridge.shareFile(blob, filename);
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

  async function shareOrDownloadBlob(blob, filename) {
    if (NativeBridge && NativeBridge.isNative) {
      try {
        await NativeBridge.shareFile(blob, filename);
        return;
      } catch (_) {}
    }
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Nka Bulletin', text: 'Mes bulletins de paie fusionnés.' });
        return;
      } catch (_) {}
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function mergeAndExport(payload, label) {
    Toast.show('Fusion des bulletins en cours...');
    try {
      const { blob, filename } = await Api.mergeBulletins(payload);
      await shareOrDownloadBlob(blob, filename);
      Toast.show('Export prêt à partager !');
    } catch (e) {
      Toast.show(ERR.msg(e));
    }
  }

  async function refresh() {
    renderYearChips();
    renderMonthChips();
    const q = document.getElementById('search-input').value.trim();
    const params = {};
    if (currentYear) params.year = currentYear;
    if (currentMonth) params.month = currentMonth;
    if (q) params.q = q;

    // État de chargement
    const listEl = document.getElementById('bulletins-list');
    listEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>Chargement des bulletins...</div></div>';

    try {
      cache = await Api.getBulletins(params);
      const ids = await Api.getCachedBulletinIds();
      cachedSet = new Set((ids || []).map(String));
      renderList();
    } catch (e) {
      cache = [];
      listEl.innerHTML = '';
      Toast.show(ERR.msg(e));
    }
  }

  function bindActions() {
    renderYearChips();
    renderMonthChips();

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
