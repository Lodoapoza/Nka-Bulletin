const Bulletins = (() => {
  const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  let currentYear = null;
  let currentMonth = null;
  let selected = new Set();
  let cache = [];

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
      listEl.innerHTML = `<div class="empty-state"><div class="glyph">🗂️</div><div>Aucun bulletin trouvé pour ces critères.</div></div>`;
      updateMergeBar();
      return;
    }
    listEl.innerHTML = cache.map(b => `
      <div class="bulletin-item">
        <input type="checkbox" data-id="${b.id}" ${selected.has(b.id) ? 'checked' : ''}>
        <div class="bulletin-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l3 3v15H6z" stroke="currentColor" stroke-width="1.6"/><path d="M9 9h6M9 12h6M9 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </div>
        <div class="bulletin-meta">
          <div class="title">${MONTHS_FR[b.month - 1]} ${b.year}</div>
          <div class="sub">${b.account_email}${b.net_amount ? ' · ' + new Intl.NumberFormat('fr-FR').format(b.net_amount) + ' XOF' : ''}</div>
        </div>
        <div class="bulletin-actions">
          <button class="icon-btn" data-download="${b.id}" aria-label="Télécharger">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = Number(cb.dataset.id);
        if (cb.checked) selected.add(id); else selected.delete(id);
        updateMergeBar();
      });
    });
    listEl.querySelectorAll('[data-download]').forEach(btn => {
      btn.addEventListener('click', () => window.open(Api.downloadBulletin(btn.dataset.download), '_blank'));
    });
  }

  function updateMergeBar() {
    const bar = document.getElementById('merge-bar');
    document.getElementById('merge-count').textContent = `${selected.size} sélectionné(s)`;
    bar.classList.toggle('hidden', selected.size < 2);
  }

  async function shareOrDownloadBlob(blob, filename) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Nka Bulletin', text: 'Mes bulletins de paie fusionnés.' });
        return;
      } catch (_) { /* l'utilisateur a annulé ou le partage a échoué -> repli sur le téléchargement */ }
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
      const blob = await Api.mergeBulletins(payload);
      await shareOrDownloadBlob(blob, `nka-bulletins-${label}.pdf`);
      Toast.show('Export prêt à partager !');
    } catch (e) {
      Toast.show(`Échec de la fusion : ${e.message}`);
    }
  }

  async function refresh() {
    const q = document.getElementById('search-input').value.trim();
    const params = {};
    if (currentYear) params.year = currentYear;
    if (currentMonth) params.month = currentMonth;
    if (q) params.q = q;
    try {
      cache = await Api.getBulletins(params);
      renderList();
    } catch (e) {
      Toast.show(`Erreur de chargement : ${e.message}`);
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
