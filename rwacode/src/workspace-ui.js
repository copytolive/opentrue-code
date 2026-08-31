'use strict';

(() => {
  const api = window.rwacode;
  const root = document.documentElement;
  const files = document.getElementById('filesPanel');
  const right = document.getElementById('rightPanel');
  const fileActions = document.getElementById('fileActions');
  const fileTree = document.getElementById('fileTree');
  const address = document.getElementById('addressInput');
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

  function restoreWidths() {
    try {
      const filesWidth = Number.parseFloat(localStorage.getItem('rwacode:files-width'));
      const rightWidth = Number.parseFloat(localStorage.getItem('rwacode:right-width'));
      if (Number.isFinite(filesWidth)) root.style.setProperty('--files-w', `${Math.round(clamp(filesWidth, 250, 500))}px`);
      if (Number.isFinite(rightWidth)) root.style.setProperty('--right-w', `${Math.round(clamp(rightWidth, 300, 620))}px`);
    } catch {}
  }

  function installResizer(host, side) {
    if (!host || host.querySelector(':scope > .shell-resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'shell-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.tabIndex = 0;
    host.appendChild(handle);

    const variable = side === 'files' ? '--files-w' : '--right-w';
    const min = side === 'files' ? 250 : 300;
    const max = side === 'files' ? 500 : 620;
    const fallback = side === 'files' ? 370 : 416;

    function setWidth(next) {
      const value = Math.round(clamp(next, min, max));
      root.style.setProperty(variable, `${value}px`);
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

  /* VS Code-like Explorer menu follows the pointer, but all operations still use the root-locked IPC. */
  if (fileTree && fileActions) {
    fileTree.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.file-row');
      if (!row) return;
      requestAnimationFrame(() => {
        const width = 250;
        const height = Math.min(330, fileActions.scrollHeight || 300);
        fileActions.style.left = `${clamp(event.clientX, 8, window.innerWidth - width - 8)}px`;
        fileActions.style.top = `${clamp(event.clientY, 66, window.innerHeight - height - 12)}px`;
      });
    });
    document.addEventListener('pointerdown', (event) => {
      if (fileActions.classList.contains('hidden')) return;
      if (event.target.closest('#fileActions') || event.target.closest('.file-row-more')) return;
      fileActions.classList.add('hidden');
    });
  }

  function providerFromUrl(value) {
    try {
      const host = new URL(String(value || '')).hostname.toLowerCase();
      if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') return 'ChatGPT';
      if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'Claude';
      if (host === 'gemini.google.com') return 'Gemini';
    } catch {}
    return null;
  }

  async function routeToAiProvider() {
    const currentProvider = providerFromUrl(address?.value);
    if (currentProvider) {
      await api.browser.setVisible(true);
      return currentProvider;
    }

    const s = typeof state !== 'undefined' ? state : null;
    const existing = [...(s?.tabs || [])].reverse().find((tab) => providerFromUrl(tab.url));
    if (existing) {
      await api.browser.switchTab(existing.id);
      await api.browser.setVisible(true);
      return providerFromUrl(existing.url);
    }

    await api.browser.newTab('https://chatgpt.com/');
    await api.browser.setVisible(true);
    return 'ChatGPT';
  }

  /* Screenshot target flow: no modal between Explorer and the real AI composer. */
  async function directSendSelectedFile() {
    const s = typeof state !== 'undefined' ? state : null;
    const selectedRow = document.querySelector('.file-row.selected');
    const target = s?.editorPath || s?.selectedPath || selectedRow?.dataset.path || null;
    if (!target) {
      if (typeof status === 'function') status('Select a local file first');
      return;
    }

    try {
      await api.files.read(target); // validates that the selection is a root-locked text file, not a folder.
      if (s?.editorPath === target && s?.editorDirty && typeof saveEditor === 'function') await saveEditor();
      if (s?.editorPath && typeof closeEditor === 'function') await closeEditor(false);
      if (s?.proposalPath && typeof cancelProposal === 'function') await cancelProposal();

      const provider = await routeToAiProvider();
      if (typeof status === 'function') status(`Adding ${target} to ${provider}…`);
      const instruction = 'Review this selected local file in the context of the current conversation. Explain it clearly. If I ask for a change, return the complete replacement file in exactly one fenced code block.';
      const result = await api.ai.sendFile(target, instruction);
      fileActions?.classList.add('hidden');
      const signal = document.getElementById('signalAiBridge');
      if (signal) signal.textContent = 'COMPOSER';
      if (typeof status === 'function') status(`${result.provider}: local file added directly to the composer`);
    } catch (error) {
      if (typeof status === 'function') status(`Add to Chat: ${error.message}`);
    }
  }

  const aiAction = document.querySelector('#fileActions [data-action="ai-send"]');
  if (aiAction) {
    aiAction.textContent = 'Add selected file to Chat';
    aiAction.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      directSendSelectedFile();
    }, true);
  }

  const patchEditorAiButton = () => {
    const editorSend = document.getElementById('editorSendAiButton');
    if (!editorSend || editorSend.dataset.directWired === 'true') return;
    editorSend.dataset.directWired = 'true';
    editorSend.textContent = 'Add to Chat';
    editorSend.title = 'Add this local file directly to the active ChatGPT, Claude, or Gemini composer.';
    editorSend.onclick = directSendSelectedFile;
  };
  patchEditorAiButton();
  requestAnimationFrame(patchEditorAiButton);

  /* Preview and Inspector use the same right rail rather than creating another permanent panel. */
  function selectRightTab(name) {
    const preview = name === 'preview';
    previewTabButton?.classList.toggle('active', preview);
    inspectorTabButton?.classList.toggle('active', !preview);
    previewContent?.classList.toggle('hidden', !preview);
    inspectorContent?.classList.toggle('hidden', preview);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  if (previewTabButton) previewTabButton.onclick = () => selectRightTab('preview');
  if (inspectorTabButton) inspectorTabButton.onclick = () => selectRightTab('inspector');

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
    if (node) new MutationObserver(syncVisibleStatus).observe(node, { childList: true, characterData: true, subtree: true });
  }
  syncVisibleStatus();

  /* A failed or idle preview must never leave a white WebContentsView covering the dark placeholder. */
  api.preview.onState((preview) => {
    const next = preview.state || (preview.loading ? 'LOADING' : 'IDLE');
    if (next === 'IDLE' || next === 'ERROR') {
      api.preview.setBounds({ x: 0, y: 0, width: 1, height: 1 }).catch(() => {});
    } else if (next === 'LIVE' || next === 'LOADING') {
      requestAnimationFrame(() => {
        if (!previewSurface || document.body.classList.contains('right-collapsed')) return;
        const rect = previewSurface.getBoundingClientRect();
        if (rect.width > 2 && rect.height > 2) api.preview.setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }).catch(() => {});
      });
    }
    syncVisibleStatus();
  });

  /* Keep the screenshot's compact workspace-chip text even when renderer refreshes the root. */
  if (workspaceChip) {
    const normalizeWorkspaceChip = () => {
      const current = workspaceChip.textContent || '';
      const name = current.replace(/^\s*[⌁~\/]+\s*/, '').trim().split('/').filter(Boolean).at(-1) || 'chat-local-online';
      const desired = `~/${name}`;
      if (workspaceChip.textContent !== desired) workspaceChip.textContent = desired;
    };
    normalizeWorkspaceChip();
    new MutationObserver(normalizeWorkspaceChip).observe(workspaceChip, { childList: true, characterData: true, subtree: true });
  }

  /* Internal profile plumbing remains available but is no longer user-facing. */
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
