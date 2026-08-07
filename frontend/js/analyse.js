// ===== Vue Analyse : évolution des salaires net =====
// Données : GET /api/analyse/salary (aggregats serveur). Lecture seule de
// bulletins.year / month / net_amount — pas de nouvelle colonne en base.
// Le masquage (œil du tableau de bord) s'applique aux montants ; le graphique
// garde sa forme mais ne révèle aucun chiffre.

const Analyse = (() => {
  const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const MASK = '•••• ••••';

  let currentYear = new Date().getFullYear(); // par défaut : année en cours
  let userSelected = false;                    // false tant que l'utilisateur n'a pas choisi
  let lastData = null;

  function amountsHidden() {
    return localStorage.getItem('nka_amounts_hidden') === '1';
  }

  function fmt(n) {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('fr-FR').format(n) + ' XOF';
  }

  function hide(v) { return amountsHidden() ? MASK : v; }

  function fmtMonthYear(ym) {
    if (!ym) return '';
    const [y, m] = String(ym).split('-').map(Number);
    return `${MONTHS_FR[m - 1]} ${y}`;
  }

  function shortLabel(p) {
    return `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(2)}`;
  }

  // ---------- Sélecteur d'année ----------
  // L'année en cours est affichée en premier (décroissant), « Toutes » en dernier.
  function renderChips(data) {
    const el = document.getElementById('analyse-chips');
    el.innerHTML = '';
    const yrs = (data.years || []).slice().sort((a, b) => b - a);
    const mk = (label, value) => {
      const b = document.createElement('button');
      b.className = 'chip' + (currentYear === value ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        userSelected = true;
        if (currentYear !== value) { currentYear = value; refresh(); }
      });
      el.appendChild(b);
    };
    yrs.forEach((y) => mk(String(y), y));
    mk('Toutes', null);
  }

  // ---------- Cartes stats ----------
  // Cartes calculées sur la période affichée (année sélectionnée, sinon tout l'historique).
  function renderStats(data) {
    const yr = currentYear ? data.perYear[String(currentYear)] : null;
    const scope = yr || data.totals || {};
    const scopeLabel = currentYear ? `Année ${currentYear}` : 'Toutes les années';
    const periodLabel = data.period.startMonth
      ? `Du ${fmtMonthYear(data.period.startMonth)} au ${fmtMonthYear(data.period.endMonth)}`
      : (currentYear ? `Année ${currentYear}` : '');

    const set = (id, value, sub) => {
      document.getElementById(id).textContent = value;
      document.getElementById(id + '-sub').textContent = sub;
    };

    const scopeMax = scope.max || null;
    const scopeMin = scope.min || null;
    set('analyse-max', hide(scopeMax ? fmt(scopeMax.net) : '—'), scopeMax ? fmtMonthYear(scopeMax.year + '-' + String(scopeMax.month).padStart(2, '0')) : '');
    set('analyse-min', hide(scopeMin ? fmt(scopeMin.net) : '—'), scopeMin ? fmtMonthYear(scopeMin.year + '-' + String(scopeMin.month).padStart(2, '0')) : '');

    set('analyse-avg', hide(scope.avgNet != null ? fmt(scope.avgNet) : '—'), scope.count ? `Sur ${scope.count} ${scope.count > 1 ? 'bulletins' : 'bulletin'}` : '');
    set('analyse-total', hide(scope.totalNet != null ? fmt(scope.totalNet) : '—'), scopeLabel + (periodLabel && scopeLabel !== periodLabel ? ` · ${periodLabel}` : ''));
  }

  // ---------- Graphique SVG (courbe ligne + pointillés min/max) ----------
  function renderChart(series) {
    const el = document.getElementById('analyse-chart');
    const hint = document.getElementById('analyse-chart-hint');
    if (!series || !series.length) { el.innerHTML = ''; hint.textContent = ''; return; }

    const W = 340, H = 168;
    const PAD = { top: 14, right: 12, bottom: 24, left: 12 };
    const n = series.length;
    const hidden = amountsHidden();

    const minNet = Math.min(...series.map(p => p.net));
    const maxNet = Math.max(...series.map(p => p.net));
    const range = (maxNet - minNet) || 1;

    const xs = (i) => PAD.left + (n === 1 ? (W - PAD.left - PAD.right) / 2 : i * (W - PAD.left - PAD.right) / (n - 1));
    const ys = (v) => PAD.top + ((maxNet - v) / range) * (H - PAD.top - PAD.bottom);
    const pts = series.map((p, i) => `${xs(i)},${ys(p.net)}`).join(' ');

    const minIdx = series.findIndex(p => p.net === minNet);
    const maxIdx = series.findIndex(p => p.net === maxNet);

    let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Évolution du salaire net mensuel">`;
    // repères pointillés min / max
    svg += `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${ys(minNet)}" y2="${ys(minNet)}" stroke="var(--md-error)" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>`;
    svg += `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${ys(maxNet)}" y2="${ys(maxNet)}" stroke="var(--md-primary)" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>`;
    // courbe
    if (n > 1) {
      svg += `<polyline points="${pts}" fill="none" stroke="var(--md-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    // points + tooltip (<title>)
    series.forEach((p, i) => {
      const tip = hidden
        ? `${MONTHS_FR[p.month - 1]} ${p.year}`
        : `${MONTHS_FR[p.month - 1]} ${p.year} : ${fmt(p.net)}`;
      const r = (i === minIdx || i === maxIdx) ? 3.5 : 2.5;
      const stroke = i === minIdx ? 'var(--md-error)' : 'var(--md-primary)';
      svg += `<circle cx="${xs(i)}" cy="${ys(p.net)}" r="${r}" fill="var(--md-surface)" stroke="${stroke}" stroke-width="1.6"><title>${tip}</title></circle>`;
    });
    // labels mois (espacés pour ne pas surcharger)
    const step = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += step) {
      const p = series[i];
      const anchor = i === 0 ? 'start' : (i >= n - step ? 'end' : 'middle');
      svg += `<text x="${xs(i)}" y="${H - 6}" text-anchor="${anchor}" font-size="8.5" fill="var(--md-on-surface-variant)" font-family="var(--font-body)">${shortLabel(p)}</text>`;
    }
    svg += '</svg>';
    el.innerHTML = svg;
    hint.textContent = hidden
      ? 'Montants masqués (œil du tableau de bord)'
      : `Pointillés : minimum (${fmt(minNet)}) et maximum (${fmt(maxNet)}) de la période`;
  }

  // ---------- Tableau des variations (vrai tableau, sans bordures) ----------
  function renderTable(series, deltas, hidden = false) {
    const el = document.getElementById('analyse-table');
    if (!series || !series.length) { el.innerHTML = '<div class="hint">Aucune donnée.</div>'; return; }

    const byKey = {};
    (deltas || []).forEach(d => { byKey[`${d.year}-${d.month}`] = d; });

    const rowsHtml = series.map((p, i) => {
      const d = byKey[`${p.year}-${p.month}`];
      const isFirst = i === 0;
      let variation;
      if (isFirst) {
        variation = '<span class="badge-delta delta-flat">Base</span>';
      } else if (d && d.pct !== null && !hidden) {
        const abs = Math.abs(d.pct);
        const cls = abs > 10 ? (d.pct > 0 ? 'delta-up' : 'delta-down') : 'delta-flat';
        const icon = d.pct > 0 ? '↑' : (d.pct < 0 ? '↓' : '=');
        variation = `<span class="badge-delta ${cls}">${icon} ${abs.toLocaleString('fr-FR')}%</span>`;
      } else {
        variation = '<span class="badge-delta delta-flat">—</span>';
      }
      return `
        <tr>
          <td class="analyse-month">${MONTHS_FR[p.month - 1]} ${p.year}</td>
          <td class="r mono analyse-net">${hide(fmt(p.net))}</td>
          <td class="r">${variation}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <table class="analyse-table">
        <thead>
          <tr>
            <th>Mois</th>
            <th class="r">Salaire net</th>
            <th class="r">Variation</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  }

  // ---------- Alertes ----------
  function renderAlerts(data) {
    const card = document.getElementById('analyse-alerts-card');
    const ul = document.getElementById('analyse-alerts');
    ul.innerHTML = '';
    const items = [];

    (data.missing || []).slice(0, 6).forEach((ym) => {
      items.push(`Mois manquant : ${fmtMonthYear(ym)}`);
    });
    if (data.totals && data.totals.max) {
      const yr = currentYear ? data.perYear[String(currentYear)] : null;
      const scope = yr || data.totals;
      if (scope && scope.max) {
        items.push(`Meilleur salaire : ${fmtMonthYear(scope.max.year + '-' + String(scope.max.month).padStart(2, '0'))}`);
      }
    }
    if (data.trend === 'up') items.push('Net en hausse sur la période');
    if (data.trend === 'down') items.push('Net en baisse sur la période');
    if (data.trend === 'flat' && data.series && data.series.length > 1) items.push('Salaire stable sur la période');

    if (!items.length) { card.classList.add('hidden'); return; }
    items.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
    card.classList.remove('hidden');
  }

  function render(data) {
    const empty = document.getElementById('analyse-empty');
    const emptyMsg = document.getElementById('analyse-empty-msg');
    const hasData = data.series && data.series.length > 0;

    renderChips(data);
    if (hasData) {
      renderStats(data);
      renderChart(data.series);
      renderTable(data.series, data.deltas, amountsHidden());
      renderAlerts(data);
      empty.classList.add('hidden');
    } else {
      emptyMsg.textContent = 'Aucun bulletin analysé pour le moment. Vérifiez que l\'analyse des montants est activée dans Réglages.';
      empty.classList.remove('hidden');
    }
  }

  async function refresh() {
    try {
      let data = await Api.getAnalyseSalary(currentYear);
      if (data.hidden) {
        lastData = null;
        document.getElementById('analyse-chips').innerHTML = '';
        document.getElementById('analyse-stats').style.display = 'none';
        document.getElementById('analyse-chart-card').classList.add('hidden');
        document.getElementById('analyse-table-card').classList.add('hidden');
        document.getElementById('analyse-alerts-card').classList.add('hidden');
        document.getElementById('analyse-empty-msg').textContent =
          'Activez « Analyse des montants PDF » dans Réglages pour voir l\'évolution de vos salaires.';
        document.getElementById('analyse-empty').classList.remove('hidden');
        return;
      }
      // Au premier affichage, si l'année en cours n'a pas encore de données,
      // bascule automatiquement sur la plus récente disponible.
      if (!userSelected && data.years && data.years.length && !data.years.includes(currentYear)) {
        currentYear = data.years[data.years.length - 1];
        data = await Api.getAnalyseSalary(currentYear);
      }
      document.getElementById('analyse-stats').style.display = '';
      document.getElementById('analyse-chart-card').classList.remove('hidden');
      document.getElementById('analyse-table-card').classList.remove('hidden');
      lastData = data;
      render(data);
    } catch (e) {
      Toast.show(ERR.msg(e));
    }
  }

  function bindActions() {
    document.getElementById('analyse-chips').addEventListener('click', () => {});
  }

  return { refresh, bindActions };
})();