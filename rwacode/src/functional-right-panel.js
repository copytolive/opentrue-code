'use strict';

(() => {
  const api = window.rwacode;
  const rightPanel = document.getElementById('rightPanel');
  const previewPanel = rightPanel?.querySelector('.preview-panel');
  const previewTabs = previewPanel?.querySelector('.preview-tabs');
  const previewContent = document.getElementById('previewContent');
  const inspectorContent = document.getElementById('inspectorContent');
  if (!api || !rightPanel || !previewPanel || !previewTabs || !previewContent || !inspectorContent) return;

  const $ = (id) => document.getElementById(id);
  const MAX_ROWS = 220;
  const consoleRows = [];
  const networkRows = new Map();
  const activityRows = [];
  let previewState = { state:'IDLE', url:'' };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function clock(at = Date.now()) {
    return new Date(at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  function selectedSource() {
    const type = String($('agentWorkspaceTag')?.value || 'local').toLowerCase();
    const locator = $('agentSourceLocator')?.value?.trim() || '';
    return type === 'local' ? { type:'local' } : { type, locator };
  }
  function selectedDevice() {
    return document.querySelector('.device-button.active')?.dataset.device || 'desktop';
  }
  function dispatchResize() {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function createTab(id, label) {
    let button = $(id);
    if (button) return button;
    button = document.createElement('button');
    button.id = id;
    button.className = 'preview-tab';
    button.type = 'button';
    button.textContent = label;
    previewTabs.appendChild(button);
    return button;
  }
  const consoleTab = createTab('consoleTabButton', 'Console');
  const networkTab = createTab('networkTabButton', 'Network');

  function createPanel(id, className) {
    let panel = $(id);
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = id;
    panel.className = `${className} panel-content hidden`;
    previewPanel.appendChild(panel);
    return panel;
  }
  const consoleContent = createPanel('consoleContent', 'runtime-tool-content');
  const networkContent = createPanel('networkContent', 'runtime-tool-content');

  consoleContent.innerHTML = `
    <div class="runtime-tool-head"><div><b>Preview Console</b><small>Real console messages from the isolated Preview session only.</small></div><button id="clearConsoleButton" type="button">Clear</button></div>
    <div id="consoleRows" class="runtime-log-list"><div class="runtime-empty">Load a preview to capture console output.</div></div>`;
  networkContent.innerHTML = `
    <div class="runtime-tool-head"><div><b>Preview Network</b><small>Real HTTP(S) requests from the isolated Preview session. No Browser Chat traffic is observed.</small></div><button id="clearNetworkButton" type="button">Clear</button></div>
    <div class="runtime-network-head"><span>Status</span><span>Method</span><span>Type</span><span>Request</span><span>Time</span></div>
    <div id="networkRows" class="runtime-network-list"><div class="runtime-empty">Load a preview to capture network requests.</div></div>`;

  function activateTool(name) {
    const map = {
      preview:[$('previewTabButton'), previewContent],
      inspector:[$('inspectorTabButton'), inspectorContent],
      console:[consoleTab, consoleContent],
      network:[networkTab, networkContent],
    };
    for (const [key, [button, panel]] of Object.entries(map)) {
      button?.classList.toggle('active', key === name);
      panel?.classList.toggle('hidden', key !== name);
    }
    if (name === 'inspector') refreshInspector();
    dispatchResize();
  }
  $('previewTabButton')?.addEventListener('click', () => requestAnimationFrame(() => activateTool('preview')));
  $('inspectorTabButton')?.addEventListener('click', () => requestAnimationFrame(() => activateTool('inspector')));
  consoleTab.onclick = () => activateTool('console');
  networkTab.onclick = () => activateTool('network');

  const devicebar = previewContent.querySelector('.preview-devicebar');
  let fullButton = $('previewFullScreenButton');
  if (devicebar && !fullButton) {
    fullButton = document.createElement('button');
    fullButton.id = 'previewFullScreenButton';
    fullButton.className = 'preview-fullscreen-button';
    fullButton.type = 'button';
    fullButton.innerHTML = '<span>↗</span> Full Screen';
    const grow = devicebar.querySelector('.grow');
    if (grow) grow.after(fullButton); else devicebar.appendChild(fullButton);
  }
  fullButton?.addEventListener('click', () => {
    const enabled = !document.body.classList.contains('preview-focus');
    document.body.classList.toggle('preview-focus', enabled);
    fullButton.innerHTML = enabled ? '<span>↙</span> Exit Full Screen' : '<span>↗</span> Full Screen';
    activateTool('preview');
    dispatchResize();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('preview-focus')) {
      document.body.classList.remove('preview-focus');
      if (fullButton) fullButton.innerHTML = '<span>↗</span> Full Screen';
      dispatchResize();
    }
  });

  const external = $('previewExternalButton');
  if (external) {
    external.classList.remove('runtime-only');
    external.classList.add('preview-external-live');
    external.title = 'Open preview in the default browser';
  }

  const syncCard = previewContent.querySelector('.sync-card');
  if (syncCard) {
    syncCard.classList.add('runtime-activity-card');
    const heading = syncCard.querySelector('h3');
    if (heading) heading.textContent = 'Activity';
    if (!$('runtimeActivityList')) {
      const list = document.createElement('div');
      list.id = 'runtimeActivityList';
      list.className = 'runtime-activity-list';
      syncCard.appendChild(list);
    }
    const signals = rightPanel.querySelector('.signals-panel');
    previewPanel.after(syncCard);
    if (signals) signals.before(syncCard);
  }

  let gitCard = $('runtimeGitCard');
  if (!gitCard) {
    gitCard = document.createElement('section');
    gitCard.id = 'runtimeGitCard';
    gitCard.className = 'runtime-git-card';
    gitCard.innerHTML = `
      <div class="runtime-card-title"><span>Git Status</span><button id="refreshGitStatusButton" type="button" title="Refresh Git status">↻</button></div>
      <div class="runtime-git-main"><span class="runtime-git-branch">⌘ <b id="runtimeGitBranch">—</b></span><span id="runtimeGitSync" class="runtime-git-sync">Select @GitHub</span></div>
      <div class="runtime-git-counts"><span>Changed files <b id="runtimeGitChanged">—</b></span><span>Staged changes <b id="runtimeGitStaged">—</b></span></div>
      <button id="runtimeGitActionsButton" class="runtime-git-action" type="button">Git actions</button>`;
    const signals = rightPanel.querySelector('.signals-panel');
    if (signals) signals.before(gitCard); else rightPanel.appendChild(gitCard);
  }

  function pushActivity(label, detail = '', kind = 'good') {
    activityRows.unshift({ at:Date.now(), label:String(label), detail:String(detail), kind });
    if (activityRows.length > 10) activityRows.length = 10;
    const host = $('runtimeActivityList');
    if (!host) return;
    host.innerHTML = activityRows.map((row) => `
      <div class="runtime-activity-row"><span class="runtime-activity-icon ${esc(row.kind)}">${row.kind === 'error' ? '!' : row.kind === 'idle' ? '•' : '✓'}</span><span><b>${esc(row.label)}</b><small>${esc(row.detail || clock(row.at))}</small></span><time>${esc(clock(row.at))}</time></div>`).join('');
  }
  pushActivity('Workspace ready', 'Root-locked workspace loaded');

  function renderConsole() {
    const host = $('consoleRows');
    if (!host) return;
    if (!consoleRows.length) return host.innerHTML = '<div class="runtime-empty">No preview console messages yet.</div>';
    host.innerHTML = consoleRows.map((row) => `
      <div class="runtime-console-row level-${esc(row.level)}"><time>${esc(clock(row.at))}</time><span class="runtime-level">${esc(row.level)}</span><code>${esc(row.message)}</code><small>${esc(row.sourceId ? `${row.sourceId}${row.line ? `:${row.line}` : ''}` : '')}</small></div>`).join('');
  }
  function addConsole(row) {
    consoleRows.push({ at:Number(row?.at || Date.now()), level:String(row?.level || 'info').toLowerCase(), message:String(row?.message || ''), line:Number(row?.line || 0), sourceId:String(row?.sourceId || '') });
    if (consoleRows.length > MAX_ROWS) consoleRows.splice(0, consoleRows.length - MAX_ROWS);
    renderConsole();
    if (String(row?.level).toLowerCase() === 'error') pushActivity('Preview console error', String(row?.message || '').slice(0, 120), 'error');
  }

  function renderNetwork() {
    const host = $('networkRows');
    if (!host) return;
    const rows = [...networkRows.values()].sort((a,b) => b.at - a.at).slice(0, MAX_ROWS);
    if (!rows.length) return host.innerHTML = '<div class="runtime-empty">No preview network requests yet.</div>';
    host.innerHTML = rows.map((row) => {
      const status = row.phase === 'error' ? 'ERR' : row.statusCode || (row.phase === 'request' ? '…' : 'OK');
      let request = row.url;
      try { const parsed = new URL(row.url); request = `${parsed.host}${parsed.pathname}${parsed.search}`; } catch {}
      return `<div class="runtime-network-row phase-${esc(row.phase)}"><b>${esc(status)}</b><span>${esc(row.method)}</span><span>${esc(row.resourceType)}</span><code title="${esc(row.url)}">${esc(request)}</code><time>${esc(clock(row.at))}</time></div>`;
    }).join('');
  }
  function addNetwork(row) {
    const id = String(row?.id || `${Date.now()}-${Math.random()}`);
    const previous = networkRows.get(id) || {};
    networkRows.set(id, { ...previous, ...row, id, at:Number(row?.at || Date.now()) });
    if (networkRows.size > MAX_ROWS * 2) {
      for (const key of [...networkRows.keys()].slice(0, networkRows.size - MAX_ROWS)) networkRows.delete(key);
    }
    renderNetwork();
  }

  function refreshInspector() {
    const rect = $('previewSurface')?.getBoundingClientRect();
    const source = selectedSource();
    inspectorContent.innerHTML = `
      <div class="runtime-inspector-grid">
        <div class="runtime-inspector-card"><span>Preview state</span><b>${esc(previewState.state || 'IDLE')}</b></div>
        <div class="runtime-inspector-card wide"><span>Preview URL</span><b title="${esc(previewState.url || $('previewUrlInput')?.value || '')}">${esc(previewState.url || $('previewUrlInput')?.value || '—')}</b></div>
        <div class="runtime-inspector-card"><span>Device</span><b>${esc(selectedDevice())}</b></div>
        <div class="runtime-inspector-card"><span>Viewport</span><b>${rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)}` : '—'}</b></div>
        <div class="runtime-inspector-card"><span>Workspace source</span><b>${esc(source.type)}</b></div>
        <div class="runtime-inspector-card"><span>Root protection</span><b>Locked</b></div>
        <div class="runtime-inspector-note">Inspector reports RWACode/Preview metadata only. Browser Chat pages remain isolated and are not inspected or scraped.</div>
      </div>`;
  }

  async function refreshGitStatus() {
    const source = selectedSource();
    const branch = $('runtimeGitBranch');
    const sync = $('runtimeGitSync');
    const changed = $('runtimeGitChanged');
    const staged = $('runtimeGitStaged');
    const action = $('runtimeGitActionsButton');
    if (source.type !== 'github' || !source.locator) {
      if (branch) branch.textContent = source.type === 'github' ? 'Enter repository' : '—';
      if (sync) sync.textContent = source.type === 'github' ? 'Repository required' : 'Select @GitHub';
      if (changed) changed.textContent = '—';
      if (staged) staged.textContent = '—';
      if (action) action.disabled = true;
      return;
    }
    try {
      const status = await api.agent.status(source);
      const s = status?.sourceState || {};
      const lines = String(s.status || '').split(/\r?\n/).filter(Boolean);
      const stagedCount = lines.filter((line) => line[0] && line[0] !== ' ' && line[0] !== '?').length;
      if (branch) branch.textContent = s.branch || status?.workspace?.source?.branch || 'managed branch';
      if (sync) sync.textContent = s.behind ? `${s.behind} behind` : s.ahead ? `${s.ahead} ahead` : 'Up to date';
      if (changed) changed.textContent = String(lines.length);
      if (staged) staged.textContent = String(stagedCount);
      if (action) action.disabled = false;
    } catch (error) {
      if (sync) sync.textContent = 'Unavailable';
      if (action) action.disabled = true;
      pushActivity('Git status unavailable', error.message, 'error');
    }
  }

  $('refreshGitStatusButton')?.addEventListener('click', refreshGitStatus);
  $('runtimeGitActionsButton')?.addEventListener('click', () => {
    const actions = $('agentGitActions');
    const bar = $('agentCommandBar');
    if (actions && !actions.classList.contains('hidden')) {
      actions.scrollIntoView({ behavior:'smooth', block:'center' });
      $('agentCommitMessage')?.focus();
      return;
    }
    bar?.scrollIntoView({ behavior:'smooth', block:'center' });
    $('agentTaskInput')?.focus();
    pushActivity('Git actions require Apply', 'Review and Apply a GitHub ChangeSet first', 'idle');
  });

  $('clearConsoleButton')?.addEventListener('click', () => { consoleRows.length = 0; renderConsole(); });
  $('clearNetworkButton')?.addEventListener('click', () => { networkRows.clear(); renderNetwork(); });

  if (api.preview?.onConsole) api.preview.onConsole(addConsole);
  if (api.preview?.onNetwork) api.preview.onNetwork(addNetwork);
  api.preview?.onState?.((next) => {
    previewState = { ...previewState, ...next };
    const label = String(next?.state || 'IDLE');
    pushActivity(`Preview ${label.toLowerCase()}`, next?.url || $('previewUrlInput')?.value || '', label === 'ERROR' ? 'error' : label === 'IDLE' ? 'idle' : 'good');
    refreshInspector();
  });
  api.files?.onChanged?.((change) => pushActivity('Workspace changed', change?.path || change?.eventType || 'filesystem event'));
  api.files?.onWatchError?.((error) => pushActivity('Workspace watcher error', error?.message || 'watch error', 'error'));
  api.agent?.onChanged?.(() => { pushActivity('Workspace transaction changed', 'Agent transaction state updated'); refreshGitStatus(); });

  document.addEventListener('click', (event) => {
    const file = event.target.closest?.('.file-row[data-path]');
    if (file && file.dataset.type === 'file') pushActivity('Read file', file.dataset.path || 'file');
    if (event.target.closest?.('#editorSaveButton')) pushActivity('Edit file', $('editorTitle')?.textContent || 'file');
    if (event.target.closest?.('#previewGoButton')) pushActivity('Open preview', $('previewUrlInput')?.value || '');
    if (event.target.closest?.('#previewReloadButton')) pushActivity('Reload preview', $('previewUrlInput')?.value || '');
    if (event.target.closest?.('#agentApplyButton')) pushActivity('Apply ChangeSet', $('agentSummary')?.textContent || 'reviewed change');
    if (event.target.closest?.('#agentUndoButton')) pushActivity('Undo transaction', 'durable restore requested');
    if (event.target.closest?.('#agentCommitButton')) pushActivity('Git commit requested', $('agentCommitMessage')?.value || '');
    if (event.target.closest?.('#agentPushButton')) pushActivity('Git push requested', 'managed branch');
    if (event.target.closest?.('#agentDriveSyncButton')) pushActivity('Drive sync requested', 'explicit sync');
    if (event.target.closest?.('.device-button')) setTimeout(refreshInspector, 0);
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'agentWorkspaceTag' || event.target?.id === 'agentSourceLocator') setTimeout(refreshGitStatus, 0);
  });
  window.addEventListener('error', (event) => addConsole({ at:Date.now(), level:'error', message:event.message || 'Renderer error', sourceId:event.filename || '', line:event.lineno || 0 }));
  window.addEventListener('unhandledrejection', (event) => addConsole({ at:Date.now(), level:'error', message:`Unhandled rejection: ${String(event.reason?.message || event.reason || 'unknown')}`, sourceId:'rwacode://renderer', line:0 }));

  refreshInspector();
  refreshGitStatus();
  const refreshTimer = setInterval(refreshGitStatus, 5000);
  window.addEventListener('beforeunload', () => clearInterval(refreshTimer), { once:true });
})();
