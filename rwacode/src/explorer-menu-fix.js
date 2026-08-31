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

  // Codex/Claude-Code style workflow: Explorer selection only establishes focus.
  // It never writes project context into a provider composer. Project context is
  // resolved when the user actually sends a task in ChatGPT/Claude/Gemini/DeepSeek.
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
})();
