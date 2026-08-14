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
                data-value="${opt.value}" ${opt.disabled ? 'disabled aria-disabled="true"' : ''}
                role="option" aria-selected="${opt.selected ? 'true' : 'false'}">
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
      panel.setAttribute('role', 'listbox');
      renderPanel();

      // Position sous le trigger
      const rect = trigger.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 4}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.minWidth = `${rect.width}px`;

      document.body.appendChild(panel);

      // Clic sur un élément (comportement historique, intact)
      panel.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item:not(.disabled)');
        if (item) {
          const val = item.dataset.value === '' ? null : Number(item.dataset.value);
          onSelect(val);
          updateLabel(val);
          close();
          trigger.focus();
        }
      });

      // Navigation clavier dans le panneau (pattern listbox) :
      // ArrowUp/ArrowDown (boucle), Home/End, Tab ferme, Enter/Space =
      // comportement natif du bouton focussé (déclenche le clic → sélection).
      const items = () => [...panel.querySelectorAll('.dropdown-item:not(.disabled)')];
      const focusAt = (i) => {
        const list = items();
        if (!list.length) return;
        list[(i + list.length) % list.length].focus();
      };
      panel.addEventListener('keydown', (e) => {
        const list = items();
        if (!list.length) return;
        const current = list.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(current + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(current - 1); }
        else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
        else if (e.key === 'End') { e.preventDefault(); focusAt(list.length - 1); }
        else if (e.key === 'Tab') { close(); }
      });

      // Fermeture : clic extérieur / Escape (Escape restitue le focus au trigger)
      onDocClick = (e) => { if (!trigger.contains(e.target) && !panel.contains(e.target)) close(); };
      onKeyDown = (e) => { if (e.key === 'Escape') { close(); trigger.focus(); } };
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKeyDown);

      // Focus initial : l'option sélectionnée, sinon la première disponible.
      const selected = panel.querySelector('.dropdown-item.selected:not(.disabled)');
      const first = panel.querySelector('.dropdown-item:not(.disabled)');
      (selected || first || panel).focus();
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
