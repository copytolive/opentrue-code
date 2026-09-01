'use strict';

(() => {
  const api = window.rwacode;
  const style = document.createElement('style');
  style.id = 'rw-agent-responsive-fix';
  style.textContent = `
    .rw-agent-row{flex-wrap:wrap!important;align-content:flex-start}
    .rw-agent-source,.rw-agent-mode,.rw-agent-button{flex:0 0 auto}
    .rw-agent-locator{flex:0 1 190px;min-width:140px;max-width:190px}
    .rw-agent-input{flex:1 1 220px;min-width:180px}
    #agentUndoButton{visibility:visible!important;display:inline-flex!important;align-items:center;justify-content:center}
    .rw-agent-git-actions,.rw-agent-drive-actions{flex-wrap:wrap}
    .rw-agent-git-actions .rw-agent-small-input{flex:1 1 180px;min-width:150px}
    .security-caret,.sync-chevron{display:none!important}
    #fileActions [data-real-action="add-chat"],#fileActions [data-action="ai-send"],#fileActions [data-action="ai-import"],#editorSendAiButton,#editorImportAiButton{display:none!important}
    .rw-preview-fullscreen-button{height:36px;padding:0 11px;border:1px solid #303948;border-radius:9px;background:#0c1118;color:#c7ced8;font-size:11px;white-space:nowrap}
    .rw-preview-fullscreen-button:hover{background:#171e29;color:#fff}
    body.preview-fullscreen #rightPanel{position:fixed!important;inset:0!important;z-index:29000!important;width:auto!important;height:auto!important;border:0!important;background:#090d13!important}
    body.preview-fullscreen #rightPanel .preview-panel{height:100vh!important;grid-template-rows:58px minmax(0,1fr)!important}
    body.preview-fullscreen #rightPanel .preview-content{grid-template-rows:52px 50px minmax(0,1fr)!important;padding:0 12px 12px!important}
    body.preview-fullscreen #rightPanel .sync-card{display:none!important}
    body.preview-fullscreen #rightPanel .preview-surface{margin:0!important;border-radius:8px!important}
    body.preview-fullscreen #rightPanel .inspector-content{height:calc(100vh - 58px)!important}
    @media (max-width:900px){
      .rw-agent-locator{flex-basis:160px;max-width:160px}
      .rw-agent-input{flex-basis:200px;min-width:160px}
    }
  `;
  document.head.appendChild(style);

  function removeProviderDomActions() {
    for (const selector of [
      '#fileActions [data-real-action="add-chat"]',
      '#fileActions [data-action="ai-send"]',
      '#fileActions [data-action="ai-import"]',
      '#editorSendAiButton',
      '#editorImportAiButton',
    ]) document.querySelectorAll(selector).forEach((node) => node.remove());
  }
  removeProviderDomActions();
  requestAnimationFrame(removeProviderDomActions);

  function restoreRailWidths() {
    try {
      const files = Number.parseFloat(localStorage.getItem('rwacode:files-width'));
      const right = Number.parseFloat(localStorage.getItem('rwacode:right-width'));
      if (Number.isFinite(files)) document.documentElement.style.setProperty('--files-w', `${Math.min(500, Math.max(250, files))}px`, 'important');
      if (Number.isFinite(right)) document.documentElement.style.setProperty('--right-w', `${Math.min(620, Math.max(300, right))}px`, 'important');
    } catch {}
  }

  function enforcePreviewNativeBounds() {
    const stateText = document.getElementById('signalPreview')?.textContent?.trim().toUpperCase() || 'IDLE';
    const previewContent = document.getElementById('previewContent');
    const previewTabActive = !previewContent?.classList.contains('hidden');
    const rightCollapsed = document.body.classList.contains('right-collapsed');
    const allowed = previewTabActive && !rightCollapsed && (stateText === 'LIVE' || stateText === 'LOADING');
    if (!allowed) api.preview.setBounds({ x:0, y:0, width:1, height:1 }).catch(() => {});
  }

  restoreRailWidths();
  window.addEventListener('resize', () => requestAnimationFrame(() => {
    restoreRailWidths();
    enforcePreviewNativeBounds();
  }));
  api.preview.onState(() => requestAnimationFrame(enforcePreviewNativeBounds));

  for (const button of document.querySelectorAll('.device-button[data-device]')) {
    button.addEventListener('click', () => requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))));
  }

  const reload = document.getElementById('previewReloadButton');
  const go = document.getElementById('previewGoButton');
  const placeholder = document.getElementById('previewPlaceholder');
  if (reload && go) {
    reload.onclick = () => {
      if (!placeholder?.classList.contains('hidden')) go.click();
      else api.preview.reload().catch(() => {});
    };
  }

  const deviceBar = document.querySelector('.preview-devicebar');
  const previewSurface = document.getElementById('previewSurface');
  const previewTab = document.getElementById('previewTabButton');
  const inspectorTab = document.getElementById('inspectorTabButton');
  let fullscreen = false;
  let fullscreenButton = document.getElementById('previewFullscreenButton');
  if (deviceBar && !fullscreenButton) {
    fullscreenButton = document.createElement('button');
    fullscreenButton.id = 'previewFullscreenButton';
    fullscreenButton.className = 'rw-preview-fullscreen-button';
    fullscreenButton.type = 'button';
    fullscreenButton.textContent = '⛶ Full Screen';
    fullscreenButton.title = 'Full Screen Preview';
    const reloadButton = document.getElementById('previewReloadButton');
    deviceBar.insertBefore(fullscreenButton, reloadButton || null);
  }

  async function setFullscreen(next) {
    fullscreen = Boolean(next);
    document.body.classList.toggle('preview-fullscreen', fullscreen);
    if (fullscreenButton) {
      fullscreenButton.textContent = fullscreen ? 'Esc Exit Full Screen' : '⛶ Full Screen';
      fullscreenButton.setAttribute('aria-pressed', String(fullscreen));
    }
    if (fullscreen) {
      previewTab?.click();
      await api.browser.setVisible(false).catch(() => {});
    } else {
      const address = document.getElementById('addressInput')?.value || '';
      const editorHidden = document.getElementById('editorPanel')?.classList.contains('hidden') !== false;
      const proposalHidden = document.getElementById('proposalPanel')?.classList.contains('hidden') !== false;
      if (address !== 'rwacode://newtab' && editorHidden && proposalHidden) await api.browser.setVisible(true).catch(() => {});
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  if (fullscreenButton) fullscreenButton.onclick = () => setFullscreen(!fullscreen);
  inspectorTab?.addEventListener('click', () => { if (fullscreen) setFullscreen(false); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && fullscreen) {
      event.preventDefault();
      setFullscreen(false);
    }
  });

  if (previewSurface && typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => window.dispatchEvent(new Event('resize')));
    observer.observe(previewSurface);
  }
})();
