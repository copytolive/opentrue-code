'use strict';

(() => {
  const api = window.rwacode;
  const toolbar = document.getElementById('browserMenuButton')?.closest('.browser-toolbar');
  const surface = document.getElementById('browserSurface');
  if (!api?.agent || !toolbar || !surface) return;

  const style = document.createElement('style');
  style.textContent = `
    .browser-panel{grid-template-rows:var(--tab-h) var(--toolbar-h) auto minmax(0,1fr)!important}
    .rw-agent{border-bottom:1px solid #1c2937;background:#09121c;padding:8px 12px;display:grid;gap:7px;position:relative;z-index:20}
    .rw-agent-row{display:flex;align-items:center;gap:8px;min-width:0}
    .rw-agent-source,.rw-agent-locator,.rw-agent-input,.rw-agent-mode,.rw-agent-button,.rw-agent-small-input{height:34px;border:1px solid #2a394b;border-radius:8px;background:#0e1824;color:#cfd9e5;padding:0 10px}
    .rw-agent-source{border-color:rgba(85,216,146,.28);background:rgba(18,58,45,.46);color:#a9efca;font-weight:700}
    .rw-agent-locator{width:190px;background:#070e16}.rw-agent-locator.hidden{display:none}
    .rw-agent-input{min-width:120px;flex:1;background:#070e16;color:#e7eef7;outline:none}.rw-agent-input:focus,.rw-agent-locator:focus,.rw-agent-small-input:focus{border-color:#4775a4;box-shadow:0 0 0 2px rgba(77,143,255,.08)}
    .rw-agent-small-input{height:30px;min-width:150px;flex:1;background:#070e16;color:#e7eef7;outline:none;font-size:11px}
    .rw-agent-button.primary{border-color:#3567a0;background:#10213a;color:#edf5ff;font-weight:700}.rw-agent-button:disabled{opacity:.42;cursor:default}
    .rw-agent-meta{display:flex;align-items:center;gap:8px;min-width:0;color:#8393a7;font-size:10px}.rw-agent-meta b{color:#cfd9e5;font-weight:600}.rw-agent-meta .grow{flex:1}
    .rw-agent-review{display:grid;grid-template-rows:auto minmax(80px,190px);gap:6px}.rw-agent-review.hidden,.rw-agent-git-actions.hidden,.rw-agent-drive-actions.hidden{display:none!important}
    .rw-agent-review-head,.rw-agent-git-actions,.rw-agent-drive-actions{display:flex;align-items:center;gap:8px;color:#9eacbd;font-size:10px}.rw-agent-review-head strong{color:#e7eef6}
    .rw-agent-git-actions,.rw-agent-drive-actions{padding-top:1px}.rw-agent-git-actions .rw-agent-button,.rw-agent-drive-actions .rw-agent-button{height:30px}
    .rw-agent-diff{margin:0;max-height:190px;overflow:auto;border:1px solid #28384a;border-radius:8px;background:#060b11;color:#b9c6d5;padding:10px 12px;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
  `;
  document.head.appendChild(style);

  const host = document.createElement('section');
  host.id = 'agentCommandBar';
  host.className = 'rw-agent';
  host.setAttribute('aria-label', 'RWACode Workspace Agent');
  host.innerHTML = `
    <div class="rw-agent-row">
      <select id="agentWorkspaceTag" class="rw-agent-source" aria-label="Workspace source"><option value="local">@Local</option><option value="github">@GitHub</option><option value="googledrive">@GoogleDrive</option></select>
      <input id="agentSourceLocator" class="rw-agent-locator hidden" autocomplete="off" spellcheck="false" placeholder="owner/repository#branch" />
      <input id="agentTaskInput" class="rw-agent-input" autocomplete="off" spellcheck="false" placeholder="Describe a change, e.g. ubah VALUE menjadi 22222" />
      <select id="agentMode" class="rw-agent-mode" aria-label="Agent apply mode"><option value="normal">Normal</option><option value="auto">Auto</option></select>
      <button id="agentRunButton" class="rw-agent-button primary">Run</button>
      <button id="agentUndoButton" class="rw-agent-button" disabled>Undo</button>
    </div>
    <div class="rw-agent-meta"><b id="agentState">READY</b><span id="agentStatus">Checking local runners…</span><span class="grow"></span><span id="agentScope">root locked · local</span></div>
    <div id="agentReview" class="rw-agent-review hidden">
      <div class="rw-agent-review-head"><strong id="agentSummary">ChangeSet</strong><span id="agentTouched"></span><span class="grow"></span><button id="agentCancelButton" class="rw-agent-button">Cancel</button><button id="agentApplyButton" class="rw-agent-button primary">Apply</button></div>
      <pre id="agentDiff" class="rw-agent-diff"></pre>
    </div>
    <div id="agentGitActions" class="rw-agent-git-actions hidden" aria-label="Explicit GitHub actions">
      <strong>Explicit Git:</strong>
      <input id="agentCommitMessage" class="rw-agent-small-input" autocomplete="off" spellcheck="false" placeholder="Commit message" />
      <button id="agentCommitButton" class="rw-agent-button">Commit</button>
      <button id="agentPushButton" class="rw-agent-button" disabled>Push</button>
      <input id="agentPrTitle" class="rw-agent-small-input" autocomplete="off" spellcheck="false" placeholder="Pull request title" />
      <button id="agentPrButton" class="rw-agent-button" disabled>Open PR</button>
    </div>
    <div id="agentDriveActions" class="rw-agent-drive-actions hidden" aria-label="Explicit Google Drive actions">
      <strong>Explicit Drive:</strong>
      <button id="agentDriveSyncButton" class="rw-agent-button primary">Sync to Drive</button>
      <span id="agentDriveHint">mirror only until Sync to Drive</span>
    </div>
  `;
  surface.parentNode.insertBefore(host, surface);

  const el = (id) => document.getElementById(id);
  let preparedId = null;
  let appliedId = null;
  let busy = false;
  let activeWorkspace = { type:'local' };
  let gitCommitted = false;
  let gitPushed = false;
  let driveSynced = false;

  function shellStatus(message) { const node = document.getElementById('statusMessage'); if (node) node.textContent = message; }
  function resizeViews() { requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }
  function setBusy(value) {
    busy = Boolean(value);
    el('agentRunButton').disabled = busy;
    el('agentApplyButton').disabled = busy || !preparedId;
    el('agentTaskInput').disabled = busy;
    el('agentWorkspaceTag').disabled = busy;
    el('agentSourceLocator').disabled = busy;
    el('agentCommitButton').disabled = busy || gitCommitted;
    el('agentPushButton').disabled = busy || !gitCommitted || gitPushed;
    el('agentPrButton').disabled = busy || !gitPushed;
    el('agentDriveSyncButton').disabled = busy || driveSynced || !appliedId;
  }
  function setState(label, message) { el('agentState').textContent = label; el('agentStatus').textContent = message; shellStatus(`Workspace Agent · ${message}`); }
  function selectedSource() {
    const type = el('agentWorkspaceTag').value;
    if (type === 'github' || type === 'googledrive') return { type, locator:el('agentSourceLocator').value.trim() };
    return { type:'local' };
  }
  function resetSourceActions() {
    gitCommitted = false;
    gitPushed = false;
    driveSynced = false;
    el('agentGitActions').classList.add('hidden');
    el('agentDriveActions').classList.add('hidden');
    el('agentCommitButton').disabled = false;
    el('agentPushButton').disabled = true;
    el('agentPrButton').disabled = true;
    el('agentDriveSyncButton').disabled = true;
    el('agentCommitMessage').value = '';
    el('agentPrTitle').value = '';
    el('agentDriveHint').textContent = 'mirror only until Sync to Drive';
  }
  function refreshWorkspace(tx = null) {
    if ((tx?.workspace?.type || activeWorkspace.type) === 'local') document.getElementById('fileRefreshButton')?.click();
    api.preview.reload().catch(() => {});
    resizeViews();
  }
  function hideReview() {
    preparedId = null;
    el('agentReview').classList.add('hidden');
    el('agentDiff').textContent = '';
    el('agentApplyButton').disabled = true;
    resizeViews();
  }
  function sourceScope(tx) {
    if (tx?.workspace?.type === 'github') {
      const state = tx.sourceState || {};
      return `root locked · GitHub ${state.repository || tx.workspace?.source?.repository || ''} · ${state.branch || ''}`.trim();
    }
    if (tx?.workspace?.type === 'googledrive') {
      const state = tx.sourceState || {};
      return `root locked · Google Drive mirror · ${state.sourcePath || tx.workspace?.source?.sourcePath || ''}`.trim();
    }
    return 'root locked · local';
  }
  function showReview(tx) {
    preparedId = tx.id;
    activeWorkspace = tx.workspace || activeWorkspace;
    el('agentSummary').textContent = tx.changeSet?.summary || 'ChangeSet';
    el('agentTouched').textContent = `${tx.touched?.length || 0} file(s) · ${tx.runner || 'agent'}`;
    el('agentDiff').textContent = tx.diff || '(no textual diff)';
    el('agentScope').textContent = sourceScope(tx);
    el('agentReview').classList.remove('hidden');
    el('agentApplyButton').disabled = false;
    resizeViews();
  }
  function showSourceApplied(tx) {
    if (tx?.workspace?.type === 'github') {
      preparedId = null;
      el('agentSummary').textContent = `Git diff · ${tx.sourceState?.branch || 'managed branch'}`;
      el('agentTouched').textContent = `${tx.touched?.length || 0} file(s) · no commit/push performed`;
      el('agentDiff').textContent = tx.sourceState?.gitDiff || '(clean Git worktree)';
      el('agentCancelButton').style.display = 'none';
      el('agentApplyButton').style.display = 'none';
      el('agentReview').classList.remove('hidden');
      el('agentScope').textContent = sourceScope(tx);
      el('agentGitActions').classList.toggle('hidden', tx.status !== 'APPLIED');
      el('agentDriveActions').classList.add('hidden');
      if (tx.status === 'APPLIED') {
        gitCommitted = false;
        gitPushed = false;
        el('agentCommitButton').disabled = false;
        el('agentPushButton').disabled = true;
        el('agentPrButton').disabled = true;
      }
      return resizeViews();
    }
    if (tx?.workspace?.type === 'googledrive') {
      preparedId = null;
      el('agentSummary').textContent = `Drive mirror diff · ${tx.sourceState?.sourcePath || 'managed mirror'}`;
      el('agentTouched').textContent = `${tx.touched?.length || 0} file(s) · ${driveSynced ? 'synced to Drive' : 'not synced to Drive'}`;
      el('agentDiff').textContent = tx.diff || '(no textual diff)';
      el('agentCancelButton').style.display = 'none';
      el('agentApplyButton').style.display = 'none';
      el('agentReview').classList.remove('hidden');
      el('agentScope').textContent = sourceScope(tx);
      el('agentGitActions').classList.add('hidden');
      el('agentDriveActions').classList.toggle('hidden', tx.status !== 'APPLIED');
      el('agentDriveSyncButton').disabled = tx.status !== 'APPLIED' || driveSynced;
      return resizeViews();
    }
    hideReview();
  }
  function runnerLabel(status) {
    const names = [];
    if (status?.runners?.localLiteral?.available) names.push('local-safe');
    if (status?.runners?.claude?.available) names.push('Claude Code');
    if (status?.sources?.github?.git?.available) names.push('GitHub worktree');
    if (status?.sources?.googledrive?.available) names.push('Google Drive Desktop');
    return names.length ? names.join(' · ') : 'no runner';
  }
  async function refreshStatus() {
    try {
      const status = await api.agent.status({ type:'local' });
      if (activeWorkspace.type === 'local') el('agentScope').textContent = 'root locked · local';
      el('agentStatus').textContent = runnerLabel(status);
      if (activeWorkspace.type === 'local') {
        appliedId = status.transaction?.lastTransaction?.id || appliedId;
        el('agentUndoButton').disabled = !status.transaction?.undoAvailable;
      }
    } catch (error) { setState('ERROR', error.message); }
  }
  async function runTask() {
    const task = el('agentTaskInput').value.trim();
    const source = selectedSource();
    if (busy) return;
    if (!task) return setState('READY', 'Enter a task before Run');
    if (source.type === 'github' && !source.locator) return setState('READY', 'Enter owner/repository for @GitHub');
    if (source.type === 'googledrive' && !source.locator) return setState('READY', 'Enter a mounted Google Drive file/folder path');
    hideReview();
    resetSourceActions();
    el('agentCancelButton').style.display = '';
    el('agentApplyButton').style.display = '';
    setBusy(true);
    const planning = source.type === 'github'
      ? 'mounting managed GitHub worktree and finding files…'
      : source.type === 'googledrive'
        ? 'materializing Google Drive source into a managed mirror…'
        : 'finding relevant project files…';
    setState('PLANNING', planning);
    try {
      const tx = await api.agent.plan(task, { mode:el('agentMode').value, source });
      activeWorkspace = tx.workspace || source;
      if (tx.status === 'APPLIED') {
        appliedId = tx.id;
        el('agentUndoButton').disabled = false;
        setState('APPLIED', `${tx.runner} · ${tx.touched.length} file(s) changed · Undo available`);
        showSourceApplied(tx);
        refreshWorkspace(tx);
      } else {
        showReview(tx);
        setState('REVIEW', `${tx.runner} prepared ${tx.touched.length} file(s); review diff then Apply`);
      }
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); await refreshStatus(); }
  }
  async function applyPrepared() {
    if (!preparedId || busy) return;
    const id = preparedId;
    setBusy(true);
    setState('APPLYING', 'writing root-locked transaction…');
    try {
      const tx = await api.agent.apply(id);
      appliedId = tx.id;
      activeWorkspace = tx.workspace || activeWorkspace;
      el('agentUndoButton').disabled = false;
      showSourceApplied(tx);
      setState('APPLIED', `${tx.touched.length} file(s) changed in managed workspace · Undo available`);
      refreshWorkspace(tx);
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); await refreshStatus(); }
  }
  async function undoLast() {
    if (busy) return;
    setBusy(true);
    setState('UNDO', driveSynced ? 'restoring exact BEFORE snapshot in mirror and Google Drive…' : 'restoring exact BEFORE snapshot…');
    try {
      const tx = await api.agent.undo(appliedId || undefined);
      appliedId = null;
      el('agentUndoButton').disabled = true;
      resetSourceActions();
      hideReview();
      setState('UNDONE', `${tx.touched.length} file(s) restored to BEFORE state`);
      refreshWorkspace(tx);
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); await refreshStatus(); }
  }
  async function commitGitHub() {
    if (!appliedId || busy) return;
    const message = el('agentCommitMessage').value.trim();
    if (!message) return setState('APPLIED', 'Enter a commit message; no Git action performed');
    setBusy(true);
    setState('COMMITTING', 'explicit commit on managed rwacode/* branch…');
    try {
      const state = await api.agent.githubAction(appliedId, 'commit', { message });
      gitCommitted = true;
      el('agentUndoButton').disabled = true;
      el('agentCommitButton').disabled = true;
      el('agentPushButton').disabled = false;
      el('agentDiff').textContent = state.gitDiff || '(clean Git worktree after commit)';
      el('agentTouched').textContent = `commit local only · ahead ${state.ahead || 0}`;
      setState('COMMITTED', `${state.branch} committed locally; Push remains explicit`);
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); }
  }
  async function pushGitHub() {
    if (!appliedId || !gitCommitted || busy) return;
    setBusy(true);
    setState('PUSHING', 'explicit push of managed rwacode/* branch…');
    try {
      const state = await api.agent.githubAction(appliedId, 'push', {});
      gitPushed = true;
      el('agentPushButton').disabled = true;
      el('agentPrButton').disabled = false;
      setState('PUSHED', `${state.branch} pushed; base branch unchanged; PR remains explicit`);
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); }
  }
  async function openGitHubPr() {
    if (!appliedId || !gitPushed || busy) return;
    const title = el('agentPrTitle').value.trim();
    if (!title) return setState('PUSHED', 'Enter a pull request title; no PR created');
    setBusy(true);
    setState('OPENING_PR', 'opening explicit GitHub pull request…');
    try {
      const state = await api.agent.githubAction(appliedId, 'pr', { title, body:`Created explicitly from RWACode managed workspace.\n\nTask: ${el('agentTaskInput').value.trim()}` });
      el('agentPrButton').disabled = true;
      setState('PR_OPENED', state.pullRequestUrl || 'pull request created');
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); }
  }
  async function syncGoogleDrive() {
    if (!appliedId || driveSynced || busy) return;
    setBusy(true);
    setState('SYNCING', 'checking Drive version and syncing explicit transaction…');
    try {
      const state = await api.agent.driveAction(appliedId, 'sync', {});
      driveSynced = true;
      el('agentDriveSyncButton').disabled = true;
      el('agentDriveHint').textContent = 'synced · Undo restores Drive BEFORE if unchanged externally';
      el('agentTouched').textContent = `${state.touched?.length || 0} file(s) · synced to Drive`;
      setState('SYNCED', 'Google Drive sync complete; Undo remains available');
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); }
  }

  el('agentWorkspaceTag').onchange = () => {
    const type = el('agentWorkspaceTag').value;
    const remote = type === 'github' || type === 'googledrive';
    el('agentSourceLocator').classList.toggle('hidden', !remote);
    el('agentSourceLocator').placeholder = type === 'github' ? 'owner/repository#branch' : type === 'googledrive' ? 'Drive file/folder path' : '';
    activeWorkspace = type === 'github' ? { type:'github' } : type === 'googledrive' ? { type:'googledrive' } : { type:'local' };
    hideReview();
    resetSourceActions();
    if (type === 'github') {
      setState('READY', 'GitHub source selected; enter owner/repository');
      el('agentScope').textContent = 'managed GitHub worktree · not mounted';
    } else if (type === 'googledrive') {
      setState('READY', 'Google Drive source selected; enter a Drive for desktop path');
      el('agentScope').textContent = 'managed Google Drive mirror · not mounted';
    } else {
      setState('READY', 'local-safe');
      el('agentScope').textContent = 'root locked · local';
    }
  };
  el('agentRunButton').onclick = runTask;
  el('agentApplyButton').onclick = applyPrepared;
  el('agentUndoButton').onclick = undoLast;
  el('agentCommitButton').onclick = commitGitHub;
  el('agentPushButton').onclick = pushGitHub;
  el('agentPrButton').onclick = openGitHubPr;
  el('agentDriveSyncButton').onclick = syncGoogleDrive;
  el('agentCancelButton').onclick = () => { hideReview(); resetSourceActions(); setState('READY', 'prepared ChangeSet discarded; no files changed'); };
  el('agentTaskInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); runTask(); }
  });
  api.agent.onChanged((tx) => {
    if (tx?.status === 'APPLIED') { appliedId = tx.id; el('agentUndoButton').disabled = false; }
    if (tx?.status === 'UNDONE' && appliedId === tx.id) { appliedId = null; el('agentUndoButton').disabled = true; }
  });

  refreshStatus().finally(resizeViews);
})();
