'use strict';

(() => {
  const api = window.rwacode;
  const filesPanel = document.getElementById('filesPanel');
  const rightPanel = document.getElementById('rightPanel');
  if (!filesPanel || !rightPanel) return;

  document.body.dataset.proShell = 'v2';
  if (!document.getElementById('professionalShellV21Style')) {
    const refinement = document.createElement('link');
    refinement.id = 'professionalShellV21Style';
    refinement.rel = 'stylesheet';
    refinement.href = './professional-shell-v21.css';
    document.head.appendChild(refinement);
  }

  // Provider-neutral browser home. RWACode does not enumerate, automate, or
  // integrate specific AI providers; the user opens any web chat manually.
  const newTabPage = document.getElementById('newTabPage');
  if (newTabPage) {
    newTabPage.innerHTML = `
      <section class="browser-chat-home" aria-label="Provider-neutral browser chat">
        <div class="browser-chat-mark" aria-hidden="true">R//</div>
        <h1>Browser Chat</h1>
        <p>Open any AI or conversational website from the address bar above. Sign in, type, send, and copy responses manually like a normal browser.</p>
        <div class="browser-chat-hint"><span class="browser-chat-kbd">⌘L</span><span>focus address bar · enter any HTTPS web chat URL</span></div>
        <div class="browser-chat-safety">Human-controlled · NO_AI_API · no automated send or response scraping</div>
      </section>`;
  }
  for (const card of document.querySelectorAll('.inspector-card')) {
    const key = card.querySelector('span')?.textContent?.trim();
    const value = card.querySelector('b');
    if (key === 'Browser' && value) value.textContent = 'Native web chat';
  }

  const topbar = document.querySelector('.topbar');
  const workspaceChip = document.getElementById('workspaceChip');
  if (topbar && workspaceChip && !document.querySelector('.pro-workspace-label')) {
    const label = document.createElement('span');
    label.className = 'pro-workspace-label';
    label.textContent = 'Workspace';
    workspaceChip.before(label);
  }

  const filesHead = filesPanel.querySelector('.files-head');
  const rootLock = document.getElementById('rootLock');
  const fileBreadcrumb = document.getElementById('fileBreadcrumb');
  const fileSearch = document.getElementById('fileSearch');
  const fileActions = document.getElementById('fileActions');
  const fileTree = document.getElementById('fileTree');
  const explorerFoot = filesPanel.querySelector('.explorer-foot');

  function card(className, title) {
    const section = document.createElement('section');
    section.className = `pro-sidebar-card ${className}`;
    if (title) {
      const head = document.createElement('div');
      head.className = 'pro-sidebar-title';
      head.textContent = title;
      section.appendChild(head);
    }
    return section;
  }

  if (!document.getElementById('proWorkspaceCard')) {
    const workspaceCard = card('pro-workspace-card', 'Workspace');
    workspaceCard.id = 'proWorkspaceCard';
    if (rootLock) workspaceCard.appendChild(rootLock);

    const explorerCard = card('pro-explorer-card', '');
    explorerCard.id = 'proExplorerCard';
    for (const node of [filesHead, fileBreadcrumb, fileSearch, fileActions, fileTree, explorerFoot]) {
      if (node) explorerCard.appendChild(node);
    }

    const sources = card('pro-context-card', 'Context Sources');
    sources.id = 'proContextSources';
    const list = document.createElement('div');
    list.className = 'pro-source-list';
    list.innerHTML = `
      <div class="pro-source-row" data-source="local">
        <span class="pro-source-icon">L</span>
        <span class="pro-source-copy"><b>Local</b><small id="proLocalMeta">This workspace</small></span>
        <span class="pro-source-state good" id="proLocalState">✓</span>
      </div>
      <div class="pro-source-row" data-source="github">
        <span class="pro-source-icon">GH</span>
        <span class="pro-source-copy"><b>GitHub</b><small id="proGithubMeta">Checking Git…</small></span>
        <span class="pro-source-state" id="proGithubState">·</span>
      </div>
      <div class="pro-source-row" data-source="googledrive">
        <span class="pro-source-icon">D</span>
        <span class="pro-source-copy"><b>Google Drive</b><small id="proDriveMeta">Checking Drive…</small></span>
        <span class="pro-source-state" id="proDriveState">·</span>
      </div>`;
    sources.appendChild(list);

    const recent = card('pro-recent-card', 'Recent Task');
    recent.id = 'proRecentCard';
    const recentBody = document.createElement('div');
    recentBody.className = 'pro-recent-body';
    recentBody.innerHTML = `
      <div class="pro-recent-task">
        <span><b id="proRecentTitle">No applied transaction yet</b><small id="proRecentMeta">Paste ChangeSet → Review → Apply</small></span>
        <span class="pro-recent-badge" id="proRecentBadge">READY</span>
      </div>`;
    recent.appendChild(recentBody);

    const foot = document.createElement('div');
    foot.className = 'pro-sidebar-foot';
    foot.textContent = 'RWACode · NO_AI_API · provider-neutral browser chat';

    filesPanel.replaceChildren(workspaceCard, explorerCard, sources, recent, foot);
  }

  const syncCard = rightPanel.querySelector('.sync-card');
  if (syncCard) {
    const heading = syncCard.querySelector('h3');
    if (heading) heading.textContent = 'Activity';
    syncCard.setAttribute('aria-label', 'Workspace activity');
  }

  function setSourceState(id, good, meta) {
    const node = document.getElementById(id);
    if (node) {
      node.classList.toggle('good', Boolean(good));
      node.textContent = good ? '✓' : '·';
    }
    const metaId = id.replace('State', 'Meta');
    const metaNode = document.getElementById(metaId);
    if (metaNode && meta) metaNode.textContent = meta;
  }

  function selectedSource() {
    const tag = document.getElementById('agentWorkspaceTag');
    const locator = document.getElementById('agentSourceLocator');
    const type = String(tag?.value || 'local').toLowerCase();
    if ((type === 'github' || type === 'googledrive') && locator?.value?.trim()) {
      return { type, locator: locator.value.trim() };
    }
    return { type: 'local' };
  }

  async function refreshProfessionalStatus() {
    if (!api?.agent?.status) return;
    try {
      const base = await api.agent.status({ type:'local' });
      const gitAvailable = Boolean(base?.sources?.github?.git?.available);
      const driveAvailable = Boolean(base?.sources?.googledrive?.available);
      setSourceState('proGithubState', gitAvailable, gitAvailable ? 'Git available' : 'Git unavailable');
      setSourceState('proDriveState', driveAvailable, driveAvailable ? 'Drive Desktop mounted' : 'Drive Desktop not mounted');

      let current = base;
      const source = selectedSource();
      if (source.type !== 'local') {
        try { current = await api.agent.status(source); } catch {}
      }
      const last = current?.transaction?.lastTransaction || base?.transaction?.lastTransaction || null;
      const title = document.getElementById('proRecentTitle');
      const meta = document.getElementById('proRecentMeta');
      const badge = document.getElementById('proRecentBadge');
      if (last) {
        const summary = String(last?.changeSet?.summary || last?.task || 'Workspace transaction').trim();
        if (title) title.textContent = summary || 'Workspace transaction';
        if (meta) meta.textContent = `${last.touched?.length || 0} file(s) · ${String(last.status || '').toLowerCase()}`;
        if (badge) badge.textContent = String(last.status || 'READY').replaceAll('_',' ');
      } else {
        if (title) title.textContent = 'No applied transaction yet';
        if (meta) meta.textContent = 'Paste ChangeSet → Review → Apply';
        if (badge) badge.textContent = 'READY';
      }
    } catch {}
  }

  document.addEventListener('change', (event) => {
    if (event.target?.id === 'agentWorkspaceTag' || event.target?.id === 'agentSourceLocator') refreshProfessionalStatus();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('#agentApplyButton,#agentUndoButton,#agentCommitButton,#agentPushButton,#agentDriveSyncButton')) {
      setTimeout(refreshProfessionalStatus, 500);
      setTimeout(refreshProfessionalStatus, 1800);
    }
  });

  refreshProfessionalStatus();
  const timer = setInterval(refreshProfessionalStatus, 5000);
  window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
})();
