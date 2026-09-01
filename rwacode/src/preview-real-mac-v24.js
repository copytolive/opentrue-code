'use strict';

(() => {
  const api = window.rwacode;
  const $ = (id) => document.getElementById(id);
  if (!api?.preview) return;

  const surface = $('previewSurface');
  const content = $('previewContent');
  const goButton = $('previewGoButton');
  const urlInput = $('previewUrlInput');
  const reloadButton = $('previewReloadButton');
  const externalButton = $('previewExternalButton');
  const previewTab = $('previewTabButton');
  const inspectorTab = $('inspectorTabButton');
  if (!surface || !content || !goButton || !urlInput || !previewTab) return;

  let previewState = 'IDLE';
  let requestedUrl = '';
  let lastViewport = { width:0, height:0 };

  function setStatus(message) {
    const node = $('statusMessage');
    if (node) node.textContent = message;
  }

  function cleanUrl(value) {
    const raw = String(value || '').trim();
    return raw && raw !== 'about:blank' ? raw : '';
  }

  function captureViewport() {
    const rect = surface.getBoundingClientRect();
    if (rect.width >= 40 && rect.height >= 40) {
      lastViewport = { width:Math.round(rect.width), height:Math.round(rect.height) };
    }
    return lastViewport;
  }

  function setPlaceholder(mode, detail = '') {
    const placeholder = $('previewPlaceholder');
    if (!placeholder) return;
    const icon = placeholder.querySelector('.preview-placeholder-icon');
    const title = placeholder.querySelector('strong');
    const copy = placeholder.querySelector('span');
    placeholder.classList.remove('preview-error-state', 'preview-loading-state');
    if (mode === 'live') {
      placeholder.classList.add('hidden');
      return;
    }
    placeholder.classList.remove('hidden');
    if (mode === 'loading') {
      placeholder.classList.add('preview-loading-state');
      if (icon) icon.textContent = '↻';
      if (title) title.textContent = 'Loading preview…';
      if (copy) copy.textContent = detail || 'Connecting to the preview URL';
      return;
    }
    if (mode === 'error') {
      placeholder.classList.add('preview-error-state');
      if (icon) icon.textContent = '!';
      if (title) title.textContent = 'Preview unavailable';
      if (copy) copy.textContent = detail || 'Check that the preview server is running, then reload.';
      return;
    }
    if (icon) icon.textContent = '✦';
    if (title) title.textContent = 'Preview idle';
    if (copy) copy.textContent = 'Enter a URL above and click Load to start previewing';
  }

  function twoFrames() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function showPreviewTool() {
    if (content.classList.contains('hidden')) previewTab.click();
    await twoFrames();
  }

  async function syncVisibleBounds() {
    captureViewport();
    const rect = surface.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) {
      throw new Error('Preview viewport is not visible yet. Open the Preview tab and try again.');
    }
    const bounds = {
      x:Math.round(rect.x),
      y:Math.round(rect.y),
      width:Math.round(rect.width),
      height:Math.round(rect.height),
    };
    await api.preview.setBounds(bounds);
    lastViewport = { width:bounds.width, height:bounds.height };
    return bounds;
  }

  async function loadPreview() {
    const value = cleanUrl(urlInput.value);
    if (!value) {
      setPlaceholder('error', 'Enter an HTTP(S) or local preview URL first.');
      urlInput.focus();
      return;
    }
    requestedUrl = value;
    goButton.disabled = true;
    goButton.textContent = 'Loading…';
    try {
      await showPreviewTool();
      // Critical ordering: set the real visible WebContentsView bounds BEFORE load.
      await syncVisibleBounds();
      previewState = 'LOADING';
      setPlaceholder('loading', value);
      setStatus(`Preview loading · ${value}`);
      await api.preview.load(value);
      await twoFrames();
      await syncVisibleBounds();
    } catch (error) {
      previewState = 'ERROR';
      setPlaceholder('error', error?.message || 'Preview failed to load.');
      setStatus(`Preview error · ${error?.message || 'load failed'}`);
    } finally {
      goButton.disabled = false;
      goButton.textContent = 'Load';
    }
  }

  goButton.onclick = loadPreview;
  urlInput.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadPreview();
    }
  };

  if (reloadButton) {
    reloadButton.onclick = async () => {
      try {
        await showPreviewTool();
        await syncVisibleBounds();
        if (previewState === 'LIVE' || previewState === 'LOADING') {
          previewState = 'LOADING';
          setPlaceholder('loading', requestedUrl || cleanUrl(urlInput.value));
          await api.preview.reload();
        } else {
          await loadPreview();
        }
      } catch (error) {
        previewState = 'ERROR';
        setPlaceholder('error', error?.message || 'Preview reload failed.');
      }
    };
  }

  function styleExternalButton() {
    if (!externalButton) return;
    externalButton.classList.remove('runtime-only');
    externalButton.classList.add('preview-external-live');
    externalButton.innerHTML = '<span aria-hidden="true">↗</span><span class="preview-external-label">Open</span>';
    externalButton.title = 'Open preview in the default browser';
    externalButton.disabled = previewState !== 'LIVE';
    externalButton.onclick = async () => {
      if (previewState !== 'LIVE') return;
      await api.preview.openExternal();
    };
  }

  function normalizeDeviceControls() {
    const bar = content.querySelector('.preview-devicebar');
    const grow = bar?.querySelector('.grow');
    const full = $('previewFullScreenButton');
    if (!bar) return;
    styleExternalButton();
    if (full) {
      full.classList.add('preview-fullscreen-live');
      if (!document.body.classList.contains('preview-focus')) full.innerHTML = '<span aria-hidden="true">⛶</span><span>Full Screen</span>';
    }
    if (grow && externalButton) grow.after(externalButton);
    if (externalButton && full) externalButton.after(full);
    if (full && reloadButton) full.after(reloadButton);
  }

  function refreshInspectorFromLastViewport() {
    const panel = $('inspectorContent');
    if (!panel) return;
    const cards = [...panel.querySelectorAll('.runtime-inspector-card')];
    const find = (label) => cards.find((card) => card.querySelector('span')?.textContent?.trim() === label)?.querySelector('b');
    const viewport = find('Viewport');
    const url = find('Preview URL');
    const stateNode = find('Preview state');
    captureViewport();
    if (viewport && lastViewport.width && lastViewport.height) viewport.textContent = `${lastViewport.width} × ${lastViewport.height}`;
    if (url) url.textContent = requestedUrl || cleanUrl(urlInput.value) || '—';
    if (stateNode) stateNode.textContent = previewState;
  }

  const observer = new ResizeObserver(() => captureViewport());
  observer.observe(surface);
  window.addEventListener('beforeunload', () => observer.disconnect(), { once:true });

  inspectorTab?.addEventListener('click', () => captureViewport(), true);
  inspectorTab?.addEventListener('click', () => setTimeout(refreshInspectorFromLastViewport, 0));
  previewTab.addEventListener('click', () => setTimeout(() => {
    captureViewport();
    if (previewState === 'LIVE' || previewState === 'LOADING') syncVisibleBounds().catch(() => {});
  }, 0));

  const full = $('previewFullScreenButton');
  full?.addEventListener('click', () => setTimeout(() => {
    normalizeDeviceControls();
    if (previewState === 'LIVE' || previewState === 'LOADING') syncVisibleBounds().catch(() => {});
  }, 0));
  document.querySelectorAll('.device-button').forEach((button) => button.addEventListener('click', () => setTimeout(() => {
    captureViewport();
    if (previewState === 'LIVE' || previewState === 'LOADING') syncVisibleBounds().catch(() => {});
  }, 0)));

  api.preview.onState((next = {}) => {
    previewState = String(next.state || (next.loading ? 'LOADING' : 'IDLE')).toUpperCase();
    const eventUrl = cleanUrl(next.url);
    if (eventUrl) {
      requestedUrl = eventUrl;
      urlInput.value = eventUrl;
    }
    if (previewState === 'LIVE') {
      setPlaceholder('live');
      captureViewport();
      setStatus(`Preview live · ${requestedUrl || cleanUrl(urlInput.value)}`);
    } else if (previewState === 'LOADING') {
      setPlaceholder('loading', requestedUrl || cleanUrl(urlInput.value));
    } else if (previewState === 'ERROR') {
      setPlaceholder('error', next.description || next.error || 'Preview server could not be loaded.');
    } else {
      setPlaceholder('idle');
    }
    styleExternalButton();
    if ($('inspectorTabButton')?.classList.contains('active')) setTimeout(refreshInspectorFromLastViewport, 0);
  });

  normalizeDeviceControls();
  captureViewport();
})();
