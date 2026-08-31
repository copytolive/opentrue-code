'use strict';

(() => {
  const menu = document.getElementById('fileActions');
  const panel = document.getElementById('filesPanel');
  const tree = document.getElementById('fileTree');
  if (!menu || !panel || !tree) return;

  const isOpen = () => !menu.classList.contains('hidden');

  function closeMenu() {
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, Math.max(min, max)));
  }

  function positionMenu(clientX, clientY) {
    requestAnimationFrame(() => {
      if (!isOpen()) return;
      const panelRect = panel.getBoundingClientRect();
      const margin = 8;
      const menuWidth = Math.max(220, Math.min(300, panelRect.width - margin * 2));
      menu.style.width = `${menuWidth}px`;
      menu.style.maxWidth = `${menuWidth}px`;
      const rect = menu.getBoundingClientRect();
      const x = clientX - panelRect.left;
      const y = clientY - panelRect.top;
      menu.style.left = `${clamp(x, margin, panelRect.width - rect.width - margin)}px`;
      menu.style.top = `${clamp(y, 40, panelRect.height - rect.height - margin)}px`;
      menu.setAttribute('aria-hidden', 'false');
    });
  }

  // The Explorer menu is a true row context menu: it opens only when the user
  // right-clicks directly on a file/folder row. Blank Explorer space and header
  // controls do not open it.
  tree.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.file-row[data-path]');
    if (!row) {
      closeMenu();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    positionMenu(event.clientX, event.clientY);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    if (menu.contains(event.target)) return;
    closeMenu();
  }, true);

  document.addEventListener('contextmenu', (event) => {
    if (!isOpen()) return;
    if (event.target.closest?.('.file-row[data-path]')) return;
    closeMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  panel.addEventListener('scroll', closeMenu, true);

  menu.addEventListener('click', (event) => {
    if (event.target.closest('button') && !event.target.closest('button:disabled')) {
      requestAnimationFrame(closeMenu);
    }
  });

  closeMenu();
})();
