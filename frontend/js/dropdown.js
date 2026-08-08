// ===== Dropdown custom partagé (scrollable, stylé, design system Material) =====
// Utilisé par la vue Bulletins (année / mois) et la vue Analyse (année).
// Le <select> natif ne peut pas être stylé (liste pleine page, scrollbar système),
// d'où ce composant : panel max-height 280px, scrollbar fine, états hover/selected.
const AppDropdown = (() => {
  function create(triggerId, options, onSelect, getLabel) {
    const trigger = document.getElementById(triggerId);
    let panel = null;
    let isOpen = false;
    let opts = options;
    let onDocClick = null;
    let onKeyDown = null;

    function close() {
      if (panel) { panel.remove(); panel = null; }
      isOpen = false;
      trigger.setAttribute('aria-expanded', 'false');
      if (onDocClick) document.removeEventListener('click', onDocClick);
      if (onKeyDown) document.removeEventListener('keydown', onKeyDown);
      onDocClick = null;
      onKeyDown = null;
    }

    function renderPanel() {
      panel.innerHTML = opts.map(opt => `
        <button class="dropdown-item${opt.selected ? ' selected' : ''}${opt.disabled ? ' disabled' : ''}"
                data-value="${opt.value}" ${opt.disabled ? 'disabled' : ''}>
          ${opt.label}
        </button>
      `).join('');
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      trigger.setAttribute('aria-expanded', 'true');

      panel = document.createElement('div');
      panel.className = 'custom-dropdown-panel';
      renderPanel();

      // Position sous le trigger
      const rect = trigger.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 4}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.minWidth = `${rect.width}px`;

      document.body.appendChild(panel);

      // Clic sur un élément
      panel.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item:not(.disabled)');
        if (item) {
          const val = item.dataset.value === '' ? null : Number(item.dataset.value);
          onSelect(val);
          updateLabel(val);
          close();
        }
      });

      // Fermeture : clic extérieur / Escape
      onDocClick = (e) => { if (!trigger.contains(e.target) && !panel.contains(e.target)) close(); };
      onKeyDown = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKeyDown);
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen ? close() : open();
    });

    // Met à jour le label du trigger après sélection
    function updateLabel(value) {
      const labelEl = trigger.querySelector('.dropdown-label');
      if (labelEl) labelEl.textContent = getLabel(value);
    }

    // Remplace les options (garde les listeners, reconstruit le panel si ouvert)
    function setOptions(newOpts) {
      opts = newOpts;
      if (isOpen && panel) renderPanel();
    }

    return { open, close, updateLabel, setOptions };
  }

  return { create };
})();
