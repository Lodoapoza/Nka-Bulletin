/* ============================================
   Nka Bulletin — Utilities
   ============================================ */

/**
 * Format a number as FCFA currency
 * @param {number} amount
 * @returns {string} "1 234 567 FCFA"
 */
export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '— FCFA';
  const int = Math.round(amount);
  return int.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
}

/**
 * Format ISO date string to French locale
 * @param {string} isoString - "2026-01-15T10:30:00Z" or "2026-01-15"
 * @returns {string} "15 janvier 2026"
 */
export function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
}

/**
 * Format date to short form
 * @param {string} isoString
 * @returns {string} "15 janv. 2026"
 */
export function formatDateShort(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
}

/**
 * Format file size in human-readable form
 * @param {number} bytes
 * @returns {string} "245 Ko"
 */
export function formatFileSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
  return size.replace('.', ',') + ' ' + units[i];
}

/**
 * Get French month name from number (1-indexed)
 * @param {number} month - 1 to 12
 * @returns {string}
 */
export function getMonthName(month) {
  const names = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  return names[month - 1] || '—';
}

/**
 * Get abbreviated month name
 * @param {number} month
 * @returns {string}
 */
export function getMonthNameShort(month) {
  const names = [
    'Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'
  ];
  return names[month - 1] || '—';
}

/**
 * Debounce a function call
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms = 300) {
  let timer = null;
  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, ms);
  }
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

/**
 * Get array of available years (current year and previous 5)
 * @returns {number[]}
 */
export function getYears() {
  const current = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => current - i);
}

/**
 * Get array of months with French names
 * @returns {{ value: number, label: string }[]}
 */
export function getMonths() {
  return Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: getMonthName(i + 1)
  }));
}

/**
 * Generate a unique ID
 * @returns {string}
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Clamp a number between min and max
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {number} duration
 */
export function showToast(message, duration = 2500) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  // Force reflow for animation restart
  void toast.offsetWidth;
  toast.classList.add('toast--visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, duration);
}

/**
 * Format ISO date to relative form
 * @param {string} isoString
 * @returns {string}
 */
export function formatRelativeDate(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
    return formatDateShort(isoString);
  } catch {
    return '—';
  }
}
