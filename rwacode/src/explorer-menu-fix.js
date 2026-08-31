'use strict';

(() => {
  const api = window.rwacode;
  const menu = document.getElementById('fileActions');
  const panel = document.getElementById('filesPanel');
  const tree = document.getElementById('fileTree');
  if (!menu || !panel || !tree) return;

  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'pdf']);
  const TEXT_EXTENSIONS = new Set([
    'js','jsx','ts','tsx','cjs','mjs','json','md','mdx','txt','css','scss','less','html','htm','xml',
    'yaml','yml','toml','ini','env','py','go','rs','java','kt','kts','swift','sql','sh','bash','zsh','fish',
    'vue','svelte','astro','rb','php','cs','cpp','cc','c','h','hpp','proto','graphql','gql','csv','tsv',
  ]);

  const isOpen = () => !menu.classList.contains('hidden');

  function closeMenu() {
    menu.classList.add('hidden');
    menu.setAttribute('aria-hidden', 'true');
    menu.removeAttribute('data-context-path');
    menu.removeAttribute('data-context-type');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, Math.max(min, max)));
  }

  function extensionOf(name = '') {
    const part = String(name).split('.').pop();
    return String(part === name ? '' : part).toLowerCase();
  }

  function isTextCandidate(name = '') {
    if (!name.includes('.')) return /^(Dockerfile|Makefile|Procfile|LICENSE|NOTICE|README)$/i.test(name);
    return TEXT_EXTENSIONS.has(extensionOf(name));
  }

  function setSelectedRow(row) {
    const path = row.dataset.path;
    for (const candidate of tree.querySelectorAll('.file-row.selected')) candidate.classList.remove('selected');
    row.classList.add('selected');
    try {
      if (typeof state !== 'undefined') state.selectedPath = path;
    } catch {}
    menu.dataset.contextPath = path || '';
    menu.dataset.contextType = row.dataset.type || '';
  }

  async function syncMenuForRow(row) {
    const type = row.dataset.type || '';
    const name = row.querySelector('.file-name')?.textContent?.trim() || '';
    const isFile = type === 'file';
    const isFolder = type === 'directory';

    const imageButton = menu.querySelector('[data-real-action="open-image"]');
    const terminalButton = menu.querySelector('[data-real-action="open-terminal"]');
    const findButton = menu.querySelector('[data-real-action="find-folder"]');
    const addChatButton = menu.querySelector('[data-real-action="add-chat"]');
    const pasteButton = menu.querySelector('[data-real-action="paste"]');

    if (imageButton) imageButton.classList.toggle('hidden', !(isFile && IMAGE_EXTENSIONS.has(extensionOf(name))));
    if (terminalButton) terminalButton.disabled = !(isFile || isFolder);
    if (findButton) findButton.classList.toggle('hidden', !isFolder);
    if (addChatButton) {
      const label = addChatButton.querySelector('span');
      if (label) label.textContent = isFolder ? 'Add Folder to Chat' : 'Add File to Chat';
      addChatButton.disabled = !(isFolder || (isFile && isTextCandidate(name)));
    }
    if (pasteButton) {
      try { pasteButton.disabled = !(await api.files.clipboardState()); }
      catch { pasteButton.disabled = true; }
    }
  }

  function positionMenu(clientX, clientY) {
    requestAnimationFrame(() => {
      if (!isOpen()) return;
      const panelRect = panel.getBoundingClientRect();
      const margin = 8;
      const menuWidth = Math.max(230, Math.min(292, panelRect.width - margin * 2));
      menu.style.width = `${menuWidth}px`;
      menu.style.maxWidth = `${menuWidth}px`;

      const rect = menu.getBoundingClientRect();
      const x = clientX - panelRect.left;
      const y = clientY - panelRect.top;
      const maxLeft = panelRect.width - rect.width - margin;
      const maxTop = panelRect.height - rect.height - margin;

      menu.style.left = `${clamp(x, margin, maxLeft)}px`;
      menu.style.top = `${clamp(y, 38, maxTop)}px`;
      menu.setAttribute('aria-hidden', 'false');
    });
  }

  // Final authority for Explorer context-menu invocation. Capture phase prevents
  // the older row/menu handlers from reopening or relocating the menu.
  tree.addEventListener('contextmenu', async (event) => {
    const row = event.target.closest('.file-row[data-path]');
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!row) {
      closeMenu();
      return;
    }

    setSelectedRow(row);
    await syncMenuForRow(row);
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    positionMenu(event.clientX, event.clientY);
  }, true);

  // Normal left-click never opens the context menu and dismisses any open one.
  tree.addEventListener('pointerdown', (event) => {
    if (event.button === 0 && isOpen() && !menu.contains(event.target)) closeMenu();
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    if (menu.contains(event.target)) return;
    closeMenu();
  }, true);

  document.addEventListener('contextmenu', (event) => {
    if (!isOpen()) return;
    if (event.target.closest?.('#fileTree .file-row[data-path]')) return;
    closeMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  panel.addEventListener('scroll', closeMenu, true);

  // Real actions are implemented by real-mac-ui.js. This layer owns only
  // selection, invocation, geometry, and dismissal; successful clicks close it.
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button && !button.disabled) requestAnimationFrame(closeMenu);
  });

  closeMenu();
})();
