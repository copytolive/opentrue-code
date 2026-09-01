'use strict';

(() => {
  const api = window.rwacode;
  const tree = document.getElementById('fileTree');
  const legacyMenu = document.getElementById('fileActions');
  if (!api?.explorer?.showContextMenu || !tree || !legacyMenu) return;

  legacyMenu.classList.add('hidden');
  legacyMenu.setAttribute('aria-hidden', 'true');

  function setStatus(message) {
    try { if (typeof status === 'function') status(message); } catch {}
  }

  function selectRow(row) {
    for (const candidate of tree.querySelectorAll('.file-row.selected')) candidate.classList.remove('selected');
    row.classList.add('selected');
    try {
      if (typeof state !== 'undefined') state.selectedPath = row.dataset.path || null;
    } catch {}
  }

  function proxyAction(action, row) {
    if (!action || !row?.isConnected) return;
    selectRow(row);
    const source = legacyMenu.querySelector(`[data-real-action="${action}"]`);
    if (!source) {
      setStatus(`Explorer action unavailable: ${action}`);
      return;
    }
    source.disabled = false;
    source.click();
  }

  // Provider pages stay native/manual. Explorer focus never writes project context
  // into a provider composer; chat-first context is resolved by the agent bridge.
  tree.addEventListener('click', (event) => {
    if (event.button !== 0 || event.target.closest('.file-row-more')) return;
    const row = event.target.closest('.file-row[data-path]');
    if (!row) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    selectRow(row);

    if (row.dataset.type === 'directory') {
      try {
        if (typeof loadDirectory === 'function') loadDirectory(row.dataset.path).catch((error) => setStatus(`Files: ${error.message}`));
      } catch (error) {
        setStatus(`Files: ${error?.message || String(error)}`);
      }
    }
  }, true);

  tree.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.file-row[data-path][data-type="file"]');
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectRow(row);
    try {
      if (typeof openEditor === 'function') openEditor(row.dataset.path).catch((error) => setStatus(`Open file: ${error.message}`));
    } catch (error) {
      setStatus(`Open file: ${error?.message || String(error)}`);
    }
  }, true);

  // Native macOS context menu only on a real file/folder row.
  tree.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.file-row[data-path]');
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!row) return;

    selectRow(row);
    const relativePath = row.dataset.path || '';
    api.explorer.showContextMenu(relativePath)
      .then((result) => {
        if (result?.action) proxyAction(result.action, row);
      })
      .catch((error) => {
        setStatus(`Explorer menu: ${error?.message || String(error)}`);
      });
  }, true);

  // Chat-first Explorer follows the selected Editable Target. The old filesystem
  // methods remain untouched outside chat-first mode; GitHub/Drive reads go only
  // through the narrow target-aware agent IPC and never become write operations.
  if (api?.files && api?.agent?.browse && api?.agent?.readTarget) {
    const localList = api.files.list.bind(api.files);
    const localRead = api.files.read.bind(api.files);
    let lastTargetIdentity = '';

    function selectedTarget() {
      try {
        const saved = JSON.parse(localStorage.getItem('rwacode.chat-first.v2') || '{}');
        const target = saved?.target && typeof saved.target === 'object' ? saved.target : { type:'local' };
        const type = String(target.type || 'local').toLowerCase();
        if (type === 'local') return { type:'local' };
        const locator = String(target.locator || saved?.locators?.[type] || '').trim();
        return { type, locator };
      } catch {
        return { type:'local' };
      }
    }

    function targetIdentity(target) {
      return `${target.type}::${target.locator || ''}`;
    }

    api.files.list = async (relativePath = '.') => {
      if (!document.body.classList.contains('chat-first-active')) return localList(relativePath);
      const target = selectedTarget();
      const identity = targetIdentity(target);
      const requestedPath = identity === lastTargetIdentity ? (relativePath || '.') : '.';
      lastTargetIdentity = identity;
      if (target.type === 'local') return localList(requestedPath);
      if (!target.locator) throw new Error(`Configure ${target.type} Editable Target first`);
      return api.agent.browse(target, requestedPath);
    };

    api.files.read = async (relativePath) => {
      if (!document.body.classList.contains('chat-first-active')) return localRead(relativePath);
      const target = selectedTarget();
      if (target.type === 'local') return localRead(relativePath);
      if (!target.locator) throw new Error(`Configure ${target.type} Editable Target first`);
      return api.agent.readTarget(target, relativePath);
    };

    // Direct chat-first target/source handlers persist their new selection before
    // this bubbling listener runs. Refresh on the next tick so Explorer remounts
    // from the new target root instead of carrying a path from the previous source.
    document.addEventListener('click', (event) => {
      const control = event.target?.closest?.('.cf-target-row, #cfSourceSave');
      if (!control) return;
      setTimeout(() => document.getElementById('cfExplorerRefresh')?.click(), 0);
    });
  }
})();
