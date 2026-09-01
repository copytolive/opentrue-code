'use strict';

(() => {
  const api = window.rwacode;
  const rootElement = document.documentElement;
  const fileActions = document.getElementById('fileActions');
  const fileTree = document.getElementById('fileTree');
  const fileSearch = document.getElementById('fileSearch');
  const fileSearchInput = document.getElementById('fileSearchInput');
  const rootPath = document.getElementById('rootPath');
  const securityChip = document.querySelector('.security-chip');

  const IMAGE_EXTENSIONS = new Set(['png','jpg','jpeg','gif','webp','svg','bmp','tif','tiff','pdf']);

  function runtimeState() {
    try { return state; } catch { return null; }
  }

  function setStatus(message) {
    try { status(message); } catch {}
  }

  function cssPx(variable, fallback) {
    const value = Number.parseFloat(getComputedStyle(rootElement).getPropertyValue(variable));
    return Number.isFinite(value) ? value : fallback;
  }

  function constrainRailWidths() {
    const viewport = Math.max(1000, window.innerWidth || 0);
    const minCenter = viewport < 1220 ? 460 : 520;
    const filesMin = 280;
    const rightMin = 320;
    const filesCap = viewport < 1450 ? 350 : 500;
    const rightCap = viewport < 1450 ? 400 : 560;
    let filesWidth = Math.min(filesCap, Math.max(filesMin, cssPx('--files-w', 370)));
    let rightWidth = Math.min(rightCap, Math.max(rightMin, cssPx('--right-w', 416)));
    const sideBudget = Math.max(filesMin + rightMin, viewport - minCenter);

    if (filesWidth + rightWidth > sideBudget) {
      let overflow = filesWidth + rightWidth - sideBudget;
      const rightRoom = Math.max(0, rightWidth - rightMin);
      const rightShrink = Math.min(overflow, rightRoom);
      rightWidth -= rightShrink;
      overflow -= rightShrink;
      if (overflow > 0) filesWidth = Math.max(filesMin, filesWidth - overflow);
    }

    rootElement.style.setProperty('--files-w', `${Math.round(filesWidth)}px`);
    rootElement.style.setProperty('--right-w', `${Math.round(rightWidth)}px`);
    try {
      localStorage.setItem('rwacode:files-width', String(Math.round(filesWidth)));
      localStorage.setItem('rwacode:right-width', String(Math.round(rightWidth)));
    } catch {}
  }

  constrainRailWidths();
  let railFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(railFrame);
    railFrame = requestAnimationFrame(constrainRailWidths);
  });

  async function promptText(title, value = '', message = '') {
    if (window.rwacodeDialogs?.prompt) return window.rwacodeDialogs.prompt(title, value, message);
    return null;
  }

  function selectedRow() {
    return document.querySelector('.file-row.selected');
  }

  function selectedMeta() {
    const s = runtimeState();
    const row = selectedRow();
    return {
      path: s?.selectedPath || row?.dataset.path || null,
      type: row?.dataset.type || null,
      name: row?.querySelector('.file-name')?.textContent?.trim() || '',
    };
  }

  function extensionOf(name = '') {
    const part = String(name).split('.').pop();
    return String(part === name ? '' : part).toLowerCase();
  }

  function menuMarkup() {
    return `
      <button data-real-action="new-file"><span>New File…</span></button>
      <button data-real-action="new-folder"><span>New Folder…</span></button>
      <button data-real-action="reveal"><span>Reveal in Finder</span><span class="menu-shortcut">⌥⌘R</span></button>
      <button data-real-action="open-image"><span>Open in Images Preview</span></button>
      <button data-real-action="open-terminal"><span>Open in Terminal</span></button>
      <div class="file-action-separator"></div>
      <button data-real-action="find-folder"><span>Find in Folder…</span><span class="menu-shortcut">⌥⇧F</span></button>
      <div class="file-action-separator"></div>
      <button data-real-action="cut"><span>Cut</span><span class="menu-shortcut">⌘X</span></button>
      <button data-real-action="copy"><span>Copy</span><span class="menu-shortcut">⌘C</span></button>
      <button data-real-action="paste"><span>Paste</span><span class="menu-shortcut">⌘V</span></button>
      <div class="file-action-separator"></div>
      <button data-real-action="copy-path"><span>Copy Path</span><span class="menu-shortcut">⌥⌘C</span></button>
      <button data-real-action="copy-relative"><span>Copy Relative Path</span><span class="menu-shortcut">⌥⇧⌘C</span></button>
      <div class="file-action-separator"></div>
      <button data-real-action="rename"><span>Rename…</span><span class="menu-shortcut">↩</span></button>
      <button data-real-action="delete" class="danger"><span>Delete</span><span class="menu-shortcut">⌘⌫</span></button>
    `;
  }

  async function refreshMenuState() {
    if (!fileActions) return;
    const meta = selectedMeta();
    const extension = extensionOf(meta.name);
    const isFolder = meta.type === 'directory';
    const isFile = meta.type === 'file';
    const imageButton = fileActions.querySelector('[data-real-action="open-image"]');
    const findButton = fileActions.querySelector('[data-real-action="find-folder"]');
    const pasteButton = fileActions.querySelector('[data-real-action="paste"]');
    if (imageButton) imageButton.classList.toggle('hidden', !(isFile && IMAGE_EXTENSIONS.has(extension)));
    if (findButton) findButton.classList.toggle('hidden', !isFolder);
    if (pasteButton) pasteButton.disabled = !(await api.files.clipboardState());
  }

  if (fileActions) {
    fileActions.innerHTML = menuMarkup();
    fileActions.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-real-action]');
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.realAction;
      const s = runtimeState();
      const meta = selectedMeta();
      try {
        if (action === 'new-file' || action === 'new-folder') {
          const destination = meta.type === 'directory' ? meta.path : (s?.currentDir || '.');
          const name = await promptText(action === 'new-file' ? 'New file name' : 'New folder name');
          if (!name?.trim()) return;
          await api.files.create(destination, name.trim(), action === 'new-folder' ? 'directory' : 'file');
          if (typeof loadDirectory === 'function') await loadDirectory(s?.currentDir || '.', true);
          setStatus(`${action === 'new-folder' ? 'Folder' : 'File'} created in ${destination}`);
          fileActions.classList.add('hidden');
          return;
        }
        if (action === 'reveal' || action === 'rename' || action === 'delete') {
          await fileAction(action);
          return;
        }
        if (action === 'open-image') {
          await api.files.openImagePreview(meta.path);
          fileActions.classList.add('hidden');
          return;
        }
        if (action === 'open-terminal') {
          await api.files.openTerminal(meta.path || s?.currentDir || '.');
          fileActions.classList.add('hidden');
          return;
        }
        if (action === 'find-folder') {
          if (meta.type === 'directory' && typeof loadDirectory === 'function') await loadDirectory(meta.path);
          fileSearch?.classList.remove('hidden');
          if (fileSearchInput) { fileSearchInput.value = ''; fileSearchInput.focus(); }
          if (s) s.filter = '';
          fileActions.classList.add('hidden');
          return;
        }
        if (action === 'cut' || action === 'copy') {
          await api.files.clipboardSet(meta.path, action);
          setStatus(`${action === 'cut' ? 'Cut' : 'Copied'} · ${meta.path}`);
          await refreshMenuState();
          fileActions.classList.add('hidden');
          return;
        }
        if (action === 'paste') {
          const destination = meta.type === 'directory' ? meta.path : (s?.currentDir || '.');
          const result = await api.files.clipboardPaste(destination);
          if (typeof loadDirectory === 'function') await loadDirectory(s?.currentDir || '.', true);
          setStatus(`Pasted · ${result.path}`);
          fileActions.classList.add('hidden');
          return;
        }
        if (action === 'copy-path' || action === 'copy-relative') {
          const kind = action === 'copy-relative' ? 'relative' : 'absolute';
          await api.files.copyPath(meta.path, kind);
          setStatus(`${kind === 'relative' ? 'Relative path' : 'Path'} copied · ${meta.path}`);
          fileActions.classList.add('hidden');
        }
      } catch (error) {
        setStatus(`Explorer: ${error.message}`);
      }
    });
  }

  if (fileTree) {
    fileTree.addEventListener('contextmenu', () => requestAnimationFrame(refreshMenuState));
    fileTree.addEventListener('click', (event) => {
      if (event.target.closest('.file-row-more')) requestAnimationFrame(refreshMenuState);
    }, true);

    const enrichRows = () => {
      for (const row of fileTree.querySelectorAll('.file-row[data-path]')) {
        const name = row.querySelector('.file-name');
        if (name) name.title = row.dataset.path || name.textContent || '';
        row.title = row.dataset.path || '';
      }
    };
    enrichRows();
    new MutationObserver(enrichRows).observe(fileTree, { childList: true, subtree: true });
  }

  const deviceIcons = {
    desktop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="1.5"></rect><path d="M8 21h8M12 17v4"></path></svg>',
    tablet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2"></rect><path d="M10 18.5h4"></path></svg>',
    mobile: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M10.5 18.5h3"></path></svg>',
  };
  for (const button of document.querySelectorAll('.device-button[data-device]')) {
    const device = button.dataset.device;
    button.innerHTML = deviceIcons[device] || button.innerHTML;
    button.title = `${device.charAt(0).toUpperCase()}${device.slice(1)} preview`;
  }

  function exposeFullInspectorText() {
    for (const value of document.querySelectorAll('.inspector-card b')) value.title = value.textContent.trim();
    if (rootPath) rootPath.title = rootPath.textContent.trim();
    if (securityChip) securityChip.title = 'Workspace is locked to the canonical local root';
  }
  exposeFullInspectorText();
  const inspector = document.getElementById('inspectorContent');
  if (inspector) new MutationObserver(exposeFullInspectorText).observe(inspector, { childList: true, subtree: true, characterData: true });

  // Re-run bounds after device switches and resizes so native Preview follows the centered shell rectangle exactly.
  for (const button of document.querySelectorAll('.device-button[data-device]')) {
    button.addEventListener('click', () => requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))));
  }
})();
