'use strict';

(() => {
  const api = window.rwacode;
  const tree = document.getElementById('fileTree');
  const legacyMenu = document.getElementById('fileActions');
  if (!api?.explorer?.showContextMenu || !tree || !legacyMenu) return;

  // Legacy DOM menu remains only as the tested action backend used by
  // real-mac-ui.js. It is never opened or observed. This avoids the previous
  // re-entrant MutationObserver path that could starve the renderer after a
  // right-click/action changed legacy menu attributes.
  legacyMenu.classList.add('hidden');
  legacyMenu.setAttribute('aria-hidden', 'true');

  function selectRow(row) {
    for (const candidate of tree.querySelectorAll('.file-row.selected')) candidate.classList.remove('selected');
    row.classList.add('selected');
    try {
      if (typeof state !== 'undefined') state.selectedPath = row.dataset.path || null;
    } catch {}
  }

  function setStatus(message) {
    try { if (typeof status === 'function') status(message); } catch {}
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

  // Sole authoritative invocation: right-click a real Explorer file/folder.
  // The menu itself is native Electron/Menu UI in the main process, so there is
  // no renderer overlay, no async clipboard wait before paint, and no DOM menu
  // lifecycle capable of freezing the shell.
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
