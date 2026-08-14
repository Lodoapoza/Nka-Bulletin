'use strict';

// ===== Planificateur de tranches « récent d'abord » =====
// Module pur : aucune DB, aucune heure locale. Découpe la fenêtre de
// synchronisation [oldestDate, newestDate] (bornes inclusives, ISO
// 'YYYY-MM-DD') en tranches mensuelles DÉCROISSANTES (récent → ancien), en
// deux phases :
//   - 'recent'  : les `recentWindowMonths` derniers mois avant `newestDate`
//                 (du premier jour du mois, recentWindowMonths - 1 mois
//                 avant newestDate, jusqu'à newestDate) ;
//   - 'history' : le reste, jusqu'à `oldestDate`.
// Reprise par curseur `{ phase, from }` : `from` est la prochaine tranche à
// traiter. `nextCursor` pointe la tranche suivante, `null` après la dernière.
//
// Décisions de calcul :
//   - Les dates ISO 'YYYY-MM-DD' se comparent lexicographiquement comme des
//     dates (même longueur) — aucun parsing vers Date nécessaire pour l'ordre.
//   - Le calendrier (nombres de jours par mois) utilise Date.UTC : jamais
//     l'heure locale, quel que soit le fuseau d'exécution.
//   - Les tranches sont identifiées par index de mois (année * 12 + mois - 1).
//   - Contrat du curseur : `from` est un début de mois (nos nextCursor le
//     garantissent). Un from en milieu de mois sur-traite le début du mois
//     (sûr, jamais de trou) — documenté pour les consommateurs externes.

function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) throw new Error(`Date ISO invalide : ${iso} (attendu YYYY-MM-DD)`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function monthIndex(ym) {
  return ym.year * 12 + (ym.month - 1);
}

function fromMonthIndex(idx) {
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Nombre de jours d'un mois — calendrier grégorien, calculé en UTC
// (new Date(Date.UTC(...)) ne dépend jamais du fuseau local).
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthStartISO(idx) {
  const { year, month } = fromMonthIndex(idx);
  return `${year}-${pad(month)}-01`;
}

function monthEndISO(idx) {
  const { year, month } = fromMonthIndex(idx);
  return `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
}

// Tranches mensuelles décroissantes couvrant [fromISO, toISO] (inclusif) :
//   - `fromISO` est la borne ANCIENNE : elle tronque le `from` de la tranche
//     la plus ancienne (ex. oldestDate, ou le début de la fenêtre récente) ;
//   - `toISO` est la borne RÉCENTE : elle tronque le `to` de la tranche la
//     plus récente (ex. newestDate, ou la fin du mois du curseur).
// Génération de l'ancien vers le récent, puis inversion pour l'ordre
// décroissant (récent → ancien) exigé par le plan.
// Garantie : jamais de tranche avec from > to ; fromISO > toISO → aucune
// tranche (borne ancienne après la borne récente : plus rien à planifier).
function chunksDescending(fromISO, toISO) {
  if (fromISO > toISO) return [];
  const fromIdx = monthIndex(parseISO(fromISO));
  const toIdx = monthIndex(parseISO(toISO));
  const chunks = [];
  for (let idx = fromIdx; idx <= toIdx; idx += 1) {
    const isFirst = idx === fromIdx;
    const isLast = idx === toIdx;
    chunks.push({
      from: isFirst ? fromISO : monthStartISO(idx),
      to: isLast ? toISO : monthEndISO(idx),
    });
  }
  chunks.reverse();
  return chunks;
}

function planChunks({ oldestDate, newestDate, recentWindowMonths = 24, cursor = null } = {}) {
  if (!oldestDate || !newestDate) {
    throw new Error('oldestDate et newestDate (YYYY-MM-DD) sont requis');
  }
  if (oldestDate > newestDate) {
    throw new Error('oldestDate doit précéder ou égaler newestDate');
  }
  if (!Number.isInteger(recentWindowMonths) || recentWindowMonths < 1) {
    throw new Error('recentWindowMonths doit être un entier >= 1');
  }

  const newestIdx = monthIndex(parseISO(newestDate));
  const recentStartIdx = newestIdx - (recentWindowMonths - 1);
  const recentStartISO = monthStartISO(recentStartIdx);

  if (cursor && cursor.phase === 'history') {
    // Historique déjà entamé : ne pas recréer la phase récente. La borne
    // récente de l'historique est la fin du mois du curseur (la tranche la
    // plus récente = le mois du curseur, complet). Si le curseur pointe
    // avant oldestDate, le garde de chunksDescending renvoie [] : tout est
    // déjà traité.
    const cursorEndISO = monthEndISO(monthIndex(parseISO(cursor.from)));
    const chunks = chunksDescending(oldestDate, cursorEndISO);
    return { phase: 'history', chunks, nextCursor: null };
  }

  // Phase récente : de la borne ancienne (from du curseur en reprise de
  // phase, sinon max(recentStart, oldestDate) — jamais de tranches au-delà
  // d'oldestDate) jusqu'à newestDate (borne récente).
  const recentFromISO = cursor && cursor.phase === 'recent'
    ? cursor.from
    : (oldestDate > recentStartISO ? oldestDate : recentStartISO);
  const chunks = chunksDescending(recentFromISO, newestDate);

  // Historique restant ? Il commence le mois précédant la fenêtre récente.
  const hasHistory = oldestDate < recentStartISO;
  const nextCursor = hasHistory
    ? { phase: 'history', from: monthStartISO(recentStartIdx - 1) }
    : null;

  return { phase: 'recent', chunks, nextCursor };
}

module.exports = { planChunks };
