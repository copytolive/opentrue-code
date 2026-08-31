'use strict';

(() => {
  const root = document.documentElement;
  const files = document.getElementById('filesPanel');
  const right = document.getElementById('rightPanel');
  const fileActions = document.getElementById('fileActions');
  const fileTree = document.getElementById('fileTree');
  const fileHead = document.querySelector('.files-head b');
  const previewHead = document.querySelector('.preview-head b');
  const previewPlaceholder = document.getElementById('previewPlaceholder');

  if (fileHead) fileHead.textContent = 'Explorer';
  if (previewHead) previewHead.textContent = 'Preview';
  if (previewPlaceholder) previewPlaceholder.setAttribute('aria-label', 'Preview not loaded');

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function currentPx(variable, fallback) {
    const raw = getComputedStyle(root).getPropertyValue(variable).trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
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
    const min = side === 'files' ? 180 : 260;
    const max = side === 'files' ? 440 : 620;

    function setWidth(next) {
      root.style.setProperty(variable, `${Math.round(clamp(next, min, max))}px`);
      window.dispatchEvent(new Event('resize'));
    }

    handle.addEventListener('pointerdown', (event) => {
      if (document.body.classList.contains(side === 'files' ? 'files-collapsed' : 'right-collapsed')) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('dragging');
      document.body.classList.add('shell-resizing');
      const startX = event.clientX;
      const start = currentPx(variable, side === 'files' ? 260 : 360);

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
      const current = currentPx(variable, side === 'files' ? 260 : 360);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      setWidth(current + (side === 'files' ? direction : -direction) * 20);
    });
  }

  installResizer(files, 'files');
  installResizer(right, 'right');

  // Position the existing operational file actions as a native-feeling Explorer context menu.
  if (fileTree && fileActions) {
    fileTree.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.file-row');
      if (!row) return;
      requestAnimationFrame(() => {
        const width = 230;
        const height = Math.min(360, fileActions.scrollHeight || 320);
        const left = clamp(event.clientX, 8, window.innerWidth - width - 8);
        const top = clamp(event.clientY, 44, window.innerHeight - height - 28);
        fileActions.style.left = `${left}px`;
        fileActions.style.top = `${top}px`;
      });
    });

    document.addEventListener('pointerdown', (event) => {
      if (fileActions.classList.contains('hidden')) return;
      if (event.target.closest('#fileActions') || event.target.closest('.file-row-more')) return;
      fileActions.classList.add('hidden');
    });
  }

  // Hide debug/profile surfaces without deleting their runtime nodes. Core session logic stays intact.
  const profileWrap = document.querySelector('.profile-wrap');
  if (profileWrap) profileWrap.setAttribute('aria-hidden', 'true');
  const signals = document.querySelector('.signals-panel');
  if (signals) signals.setAttribute('aria-hidden', 'true');

  // Browser menu language should no longer expose the internal profile architecture.
  const relabelBrowserMenu = () => {
    for (const button of document.querySelectorAll('.rw-browser-menu button')) {
      if (button.textContent.includes('Clear Profile Site Data')) button.innerHTML = '⌫ Clear browser site data';
    }
  };
  relabelBrowserMenu();
  requestAnimationFrame(relabelBrowserMenu);
})();
