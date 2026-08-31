'use strict';

(() => {
  const api = window.rwacode;
  const tree = document.getElementById('fileTree');
  const legacyMenu = document.getElementById('fileActions');
  if (!tree || !legacyMenu) return;

  // The old menu remains only as an action backend for real-mac-ui.js. It is
  // never rendered. A fresh context menu is created only for an actual row
  // right-click, which avoids every legacy positioning/open-state conflict.
  legacyMenu.classList.add('hidden');
  legacyMenu.setAttribute('aria-hidden', 'true');

  const IMAGE_EXTENSIONS = new Set(['png','jpg','jpeg','gif','webp','svg','bmp','tif','tiff','pdf']);
  const TEXT_EXTENSIONS = new Set([
    'js','jsx','ts','tsx','cjs','mjs','json','md','mdx','txt','css','scss','less','html','htm','xml',
    'yaml','yml','toml','ini','env','py','go','rs','java','kt','kts','swift','sql','sh','bash','zsh','fish',
    'vue','svelte','astro','rb','php','cs','cpp','cc','c','h','hpp','proto','graphql','gql','csv','tsv',
  ]);

  let contextMenu = null;
  let contextRow = null;

  function extensionOf(name = '') {
    const part = String(name).split('.').pop();
    return String(part === name ? '' : part).toLowerCase();
  }

  function isTextCandidate(name = '') {
    if (!name.includes('.')) return /^(Dockerfile|Makefile|Procfile|LICENSE|NOTICE|README)$/i.test(name);
    return TEXT_EXTENSIONS.has(extensionOf(name));
  }

  function closeMenu() {
    if (contextMenu) contextMenu.remove();
    contextMenu = null;
    contextRow = null;
  }

  function selectRow(row) {
    for (const candidate of tree.querySelectorAll('.file-row.selected')) candidate.classList.remove('selected');
    row.classList.add('selected');
    try {
      if (typeof state !== 'undefined') state.selectedPath = row.dataset.path || null;
    } catch {}
  }

  function separator() {
    const node = document.createElement('div');
    node.className = 'rw-context-separator';
    return node;
  }

  function item(action, label, shortcut = '', options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `rw-context-item${options.danger ? ' danger' : ''}`;
    button.dataset.action = action;
    button.disabled = Boolean(options.disabled);
    button.innerHTML = `<span class="rw-context-label"></span><span class="rw-context-shortcut"></span>`;
    button.querySelector('.rw-context-label').textContent = label;
    button.querySelector('.rw-context-shortcut').textContent = shortcut;
    return button;
  }

  async function createMenu(row, clientX, clientY) {
    closeMenu();
    contextRow = row;
    selectRow(row);

    const type = row.dataset.type || '';
    const name = row.querySelector('.file-name')?.textContent?.trim() || '';
    const isFolder = type === 'directory';
    const isFile = type === 'file';
    const isImage = isFile && IMAGE_EXTENSIONS.has(extensionOf(name));
    const canChat = isFolder || (isFile && isTextCandidate(name));
    let canPaste = false;
    try { canPaste = Boolean(await api.files.clipboardState()); } catch {}

    const menu = document.createElement('div');
    menu.id = 'rwExplorerContextMenu';
    menu.className = 'rw-explorer-context-menu';
    menu.setAttribute('role', 'menu');
    menu.dataset.path = row.dataset.path || '';
    menu.dataset.type = type;

    const nodes = [
      item('new-file', 'New File…'),
      item('new-folder', 'New Folder…'),
      separator(),
      item('reveal', 'Reveal in Finder', '⌥⌘R'),
      ...(isImage ? [item('open-image', 'Open in Images Preview')] : []),
      item('open-terminal', 'Open in Terminal'),
      ...(isFolder ? [item('find-folder', 'Find in Folder…', '⌥⇧F')] : []),
      separator(),
      item('add-chat', isFolder ? 'Add Folder to Chat' : 'Add File to Chat', '', { disabled: !canChat }),
      separator(),
      item('cut', 'Cut', '⌘X'),
      item('copy', 'Copy', '⌘C'),
      item('paste', 'Paste', '⌘V', { disabled: !canPaste }),
      separator(),
      item('copy-path', 'Copy Path', '⌥⌘C'),
      item('copy-relative', 'Copy Relative Path', '⌥⇧⌘C'),
      separator(),
      item('rename', 'Rename…', '↩'),
      item('delete', 'Delete', '⌘⌫', { danger: true }),
    ];
    for (const node of nodes) menu.appendChild(node);

    document.body.appendChild(menu);
    contextMenu = menu;

    const rect = menu.getBoundingClientRect();
    const gap = 6;
    const left = Math.max(gap, Math.min(clientX, window.innerWidth - rect.width - gap));
    const top = Math.max(gap, Math.min(clientY, window.innerHeight - rect.height - gap));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;

    menu.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      proxyAction(button.dataset.action);
    });
  }

  function proxyAction(action) {
    const row = contextRow;
    if (!row) return;
    selectRow(row);

    // real-mac-ui.js owns the tested root-locked implementations. Trigger its
    // hidden backend button so this rebuild changes only invocation/geometry.
    const source = legacyMenu.querySelector(`[data-real-action="${action}"]`);
    if (!source) {
      try { if (typeof status === 'function') status(`Explorer action unavailable: ${action}`); } catch {}
      closeMenu();
      return;
    }
    source.disabled = false;
    closeMenu();
    source.click();
  }

  // Sole authoritative invocation: right-click directly on a real file/folder.
  tree.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.file-row[data-path]');
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!row) {
      closeMenu();
      return;
    }
    void createMenu(row, event.clientX, event.clientY);
  }, true);

  // Never allow the old static menu to become visible again.
  const keepLegacyHidden = new MutationObserver(() => {
    if (!legacyMenu.classList.contains('hidden')) legacyMenu.classList.add('hidden');
    legacyMenu.setAttribute('aria-hidden', 'true');
  });
  keepLegacyHidden.observe(legacyMenu, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });

  document.addEventListener('pointerdown', (event) => {
    if (!contextMenu) return;
    if (contextMenu.contains(event.target)) return;
    closeMenu();
  }, true);

  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('#fileTree .file-row[data-path]')) return;
    closeMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  tree.addEventListener('scroll', closeMenu, true);

  closeMenu();
})();
