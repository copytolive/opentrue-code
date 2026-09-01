'use strict';

(() => {
  const api = window.rwacode;
  const root = document.documentElement;
  const files = document.getElementById('filesPanel');
  const right = document.getElementById('rightPanel');
  const fileActions = document.getElementById('fileActions');
  const fileTree = document.getElementById('fileTree');
  const fileMoreButton = document.getElementById('fileMoreButton');
  const previewSurface = document.getElementById('previewSurface');
  const previewContent = document.getElementById('previewContent');
  const inspectorContent = document.getElementById('inspectorContent');
  const previewTabButton = document.getElementById('previewTabButton');
  const inspectorTabButton = document.getElementById('inspectorTabButton');
  const syncStatusFile = document.getElementById('syncStatusFile');
  const syncStatusPreview = document.getElementById('syncStatusPreview');
  const syncStatusPreviewMeta = document.getElementById('syncStatusPreviewMeta');
  const inspectorPreviewState = document.getElementById('inspectorPreviewState');
  const workspaceChip = document.getElementById('workspaceChip');
  let rightMode = 'preview';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function currentPx(variable, fallback) {
    const raw = getComputedStyle(root).getPropertyValue(variable).trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function persistWidth(side, value) {
    try { localStorage.setItem(`rwacode:${side}-width`, String(Math.round(value))); } catch {}
  }

  function applyWidth(side, value) {
    const variable = side === 'files' ? '--files-w' : '--right-w';
    root.style.setProperty(variable, `${Math.round(value)}px`, 'important');
  }

  function restoreWidths() {
    try {
      const filesWidth = Number.parseFloat(localStorage.getItem('rwacode:files-width'));
      const rightWidth = Number.parseFloat(localStorage.getItem('rwacode:right-width'));
      if (Number.isFinite(filesWidth)) applyWidth('files', clamp(filesWidth, 250, 500));
      if (Number.isFinite(rightWidth)) applyWidth('right', clamp(rightWidth, 300, 620));
    } catch {}
  }

  function installResizer(host, side) {
    if (!host || host.querySelector(':scope > .shell-resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'shell-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', side === 'files' ? 'Resize Explorer' : 'Resize Preview');
    handle.tabIndex = 0;
    host.appendChild(handle);

    const variable = side === 'files' ? '--files-w' : '--right-w';
    const min = side === 'files' ? 250 : 300;
    const max = side === 'files' ? 500 : 620;
    const fallback = side === 'files' ? 328 : 392;

    function setWidth(next) {
      const value = Math.round(clamp(next, min, max));
      applyWidth(side, value);
      persistWidth(side, value);
      window.dispatchEvent(new Event('resize'));
    }

    handle.addEventListener('pointerdown', (event) => {
      if (document.body.classList.contains(side === 'files' ? 'files-collapsed' : 'right-collapsed')) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('dragging');
      document.body.classList.add('shell-resizing');
      const startX = event.clientX;
      const start = currentPx(variable, fallback);
      const move = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        setWidth(side === 'files' ? start + delta : start - delta);
      };
      const end = () => {
        handle.classList.remove('dragging');
        document.body.classList.remove('shell-resizing');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });

    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = currentPx(variable, fallback);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      setWidth(current + (side === 'files' ? direction : -direction) * 20);
    });
  }

  restoreWidths();
  installResizer(files, 'files');
  installResizer(right, 'right');

  function placeMenuAt(x, y) {
    if (!fileActions) return;
    requestAnimationFrame(() => {
      const width = 250;
      const height = Math.min(430, fileActions.scrollHeight || 330);
      fileActions.style.left = `${clamp(x, 8, window.innerWidth - width - 8)}px`;
      fileActions.style.top = `${clamp(y, 66, window.innerHeight - height - 12)}px`;
    });
  }

  if (fileTree && fileActions) {
    fileTree.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.file-row');
      if (!row) return;
      placeMenuAt(event.clientX, event.clientY);
    });
    fileTree.addEventListener('click', (event) => {
      const more = event.target.closest('.file-row-more');
      if (!more) return;
      const rect = more.getBoundingClientRect();
      placeMenuAt(rect.right + 4, rect.top);
    });
    document.addEventListener('pointerdown', (event) => {
      if (fileActions.classList.contains('hidden')) return;
      if (event.target.closest('#fileActions') || event.target.closest('.file-row-more')) return;
      fileActions.classList.add('hidden');
    });
  }

  if (fileMoreButton && fileActions) {
    fileMoreButton.addEventListener('click', () => {
      const rect = fileMoreButton.getBoundingClientRect();
      placeMenuAt(rect.right - 250, rect.bottom + 6);
    });
  }

  function setPreviewNativeVisible(visible) {
    if (!visible || document.body.classList.contains('right-collapsed')) {
      api.preview.setBounds({ x:0, y:0, width:1, height:1 }).catch(() => {});
      return;
    }
    requestAnimationFrame(() => {
      const rect = previewSurface?.getBoundingClientRect();
      if (!rect || rect.width < 2 || rect.height < 2) return;
      api.preview.setBounds({ x:rect.x, y:rect.y, width:rect.width, height:rect.height }).catch(() => {});
    });
  }

  function selectRightTab(name) {
    rightMode = name === 'inspector' ? 'inspector' : 'preview';
    const preview = rightMode === 'preview';
    previewTabButton?.classList.toggle('active', preview);
    inspectorTabButton?.classList.toggle('active', !preview);
    previewTabButton?.setAttribute('aria-selected', String(preview));
    inspectorTabButton?.setAttribute('aria-selected', String(!preview));
    previewContent?.classList.toggle('hidden', !preview);
    inspectorContent?.classList.toggle('hidden', preview);
    setPreviewNativeVisible(preview);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  if (previewTabButton) {
    previewTabButton.setAttribute('role', 'tab');
    previewTabButton.onclick = () => selectRightTab('preview');
  }
  if (inspectorTabButton) {
    inspectorTabButton.setAttribute('role', 'tab');
    inspectorTabButton.onclick = () => selectRightTab('inspector');
  }

  function syncVisibleStatus() {
    const fileState = document.getElementById('signalFileSync')?.textContent?.trim() || 'LIVE';
    const previewState = document.getElementById('signalPreview')?.textContent?.trim() || 'IDLE';
    if (syncStatusFile) syncStatusFile.textContent = fileState === 'ERROR' ? 'Sync issue' : fileState === 'SYNC' ? 'Syncing…' : 'Sync ready';
    if (syncStatusPreview) syncStatusPreview.textContent = previewState === 'LIVE' ? 'Preview live' : previewState === 'ERROR' ? 'Preview error' : previewState === 'LOADING' ? 'Preview loading' : 'Preview idle';
    if (syncStatusPreviewMeta) syncStatusPreviewMeta.textContent = previewState === 'LIVE' ? 'Local project is rendering' : previewState === 'ERROR' ? 'Preview could not be loaded' : previewState === 'LOADING' ? 'Connecting to local project' : 'No active preview';
    if (inspectorPreviewState) inspectorPreviewState.textContent = previewState.charAt(0) + previewState.slice(1).toLowerCase();
  }

  for (const id of ['signalFileSync', 'signalPreview']) {
    const node = document.getElementById(id);
    if (node) new MutationObserver(syncVisibleStatus).observe(node, { childList:true, characterData:true, subtree:true });
  }
  syncVisibleStatus();

  api.preview.onState((preview) => {
    const next = preview.state || (preview.loading ? 'LOADING' : 'IDLE');
    if (next === 'IDLE' || next === 'ERROR' || rightMode !== 'preview') setPreviewNativeVisible(false);
    else if (next === 'LIVE' || next === 'LOADING') setPreviewNativeVisible(true);
    syncVisibleStatus();
  });

  if (workspaceChip) {
    const normalizeWorkspaceChip = () => {
      const current = workspaceChip.textContent || '';
      const name = current.replace(/^\s*[⌁~\/]+\s*/, '').trim().split('/').filter(Boolean).at(-1) || 'chat-local-online';
      const desired = `~/${name}`;
      if (workspaceChip.textContent !== desired) workspaceChip.textContent = desired;
    };
    normalizeWorkspaceChip();
    new MutationObserver(normalizeWorkspaceChip).observe(workspaceChip, { childList:true, characterData:true, subtree:true });
  }

  document.querySelector('.profile-wrap')?.setAttribute('aria-hidden', 'true');
  document.querySelector('.signals-panel')?.setAttribute('aria-hidden', 'true');

  const relabelBrowserMenu = () => {
    for (const button of document.querySelectorAll('.rw-browser-menu button')) {
      if (button.textContent.includes('Clear Profile Site Data')) button.innerHTML = '⌫ Clear browser site data';
    }
  };
  relabelBrowserMenu();
  requestAnimationFrame(relabelBrowserMenu);
})();
