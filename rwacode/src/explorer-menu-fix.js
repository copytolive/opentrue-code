'use strict';

(() => {
  const menu = document.getElementById('fileActions');
  const panel = document.getElementById('filesPanel');
  const tree = document.getElementById('fileTree');
  const panelMore = document.getElementById('fileMoreButton');
  if (!menu || !panel) return;

  const isOpen = () => !menu.classList.contains('hidden');

  function closeMenu() {
    if (!isOpen()) return;
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
      menu.style.width = `${Math.max(220, Math.min(300, panelRect.width - margin * 2))}px`;
      menu.style.maxWidth = `${Math.max(220, panelRect.width - margin * 2)}px`;
      const rect = menu.getBoundingClientRect();
      const x = Number.isFinite(clientX) ? clientX - panelRect.left : margin;
      const y = Number.isFinite(clientY) ? clientY - panelRect.top : 48;
      menu.style.left = `${clamp(x, margin, panelRect.width - rect.width - margin)}px`;
      menu.style.top = `${clamp(y, 48, panelRect.height - rect.height - margin)}px`;
      menu.setAttribute('aria-hidden', 'false');
    });
  }

  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    const target = event.target;
    if (menu.contains(target)) return;
    if (target.closest?.('.file-row-more') || target.closest?.('#fileMoreButton')) return;
    closeMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);

  tree?.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.file-row[data-path]');
    if (!row) return;
    positionMenu(event.clientX, event.clientY);
  });

  tree?.addEventListener('click', (event) => {
    const trigger = event.target.closest('.file-row-more');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    positionMenu(rect.right, rect.bottom);
  });

  panelMore?.addEventListener('click', () => {
    const rect = panelMore.getBoundingClientRect();
    positionMenu(rect.right, rect.bottom);
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('button') && !event.target.closest('button:disabled')) {
      requestAnimationFrame(() => {
        if (isOpen()) closeMenu();
      });
    }
  });
})();
