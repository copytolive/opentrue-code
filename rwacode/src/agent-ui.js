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
    .rw-agent-source{height:32px;display:flex;align-items:center;padding:0 10px;border:1px solid rgba(85,216,146,.28);border-radius:8px;background:rgba(18,58,45,.46);color:#a9efca;font-weight:700;white-space:nowrap}
    .rw-agent-input{height:34px;min-width:120px;flex:1;border:1px solid #2a3a4d;border-radius:9px;background:#070e16;color:#e7eef7;padding:0 11px;outline:none}
    .rw-agent-input:focus{border-color:#4775a4;box-shadow:0 0 0 2px rgba(77,143,255,.08)}
    .rw-agent-mode,.rw-agent-button{height:34px;border:1px solid #2a394b;border-radius:8px;background:#0e1824;color:#cfd9e5;padding:0 10px}
    .rw-agent-button.primary{border-color:#3567a0;background:#10213a;color:#edf5ff;font-weight:700}.rw-agent-button:disabled{opacity:.42;cursor:default}
    .rw-agent-meta{display:flex;align-items:center;gap:8px;min-width:0;color:#8393a7;font-size:10px}.rw-agent-meta b{color:#cfd9e5;font-weight:600}.rw-agent-meta .grow{flex:1}
    .rw-agent-review{display:grid;grid-template-rows:auto minmax(80px,190px);gap:6px}.rw-agent-review.hidden{display:none!important}
    .rw-agent-review-head{display:flex;align-items:center;gap:8px;color:#9eacbd;font-size:10px}.rw-agent-review-head strong{color:#e7eef6}
    .rw-agent-diff{margin:0;max-height:190px;overflow:auto;border:1px solid #28384a;border-radius:8px;background:#060b11;color:#b9c6d5;padding:10px 12px;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
  `;
  document.head.appendChild(style);

  const host = document.createElement('section');
  host.id = 'agentCommandBar';
  host.className = 'rw-agent';
  host.setAttribute('aria-label', 'RWACode Workspace Agent');
  host.innerHTML = `
    <div class="rw-agent-row">
      <span id="agentWorkspaceTag" class="rw-agent-source">@Local</span>
      <input id="agentTaskInput" class="rw-agent-input" autocomplete="off" spellcheck="false" placeholder="Describe a change, e.g. ubah VALUE menjadi 22222" />
      <select id="agentMode" class="rw-agent-mode" aria-label="Agent apply mode"><option value="normal">Normal</option><option value="auto">Auto</option></select>
      <button id="agentRunButton" class="rw-agent-button primary">Run</button>
      <button id="agentUndoButton" class="rw-agent-button" disabled>Undo</button>
    </div>
    <div class="rw-agent-meta"><b id="agentState">READY</b><span id="agentStatus">Checking local runners…</span><span class="grow"></span><span id="agentScope">root locked</span></div>
    <div id="agentReview" class="rw-agent-review hidden">
      <div class="rw-agent-review-head"><strong id="agentSummary">ChangeSet</strong><span id="agentTouched"></span><span class="grow"></span><button id="agentCancelButton" class="rw-agent-button">Cancel</button><button id="agentApplyButton" class="rw-agent-button primary">Apply</button></div>
      <pre id="agentDiff" class="rw-agent-diff"></pre>
    </div>
  `;
  surface.parentNode.insertBefore(host, surface);

  const el = (id) => document.getElementById(id);
  let preparedId = null;
  let appliedId = null;
  let busy = false;

  function shellStatus(message) {
    const node = document.getElementById('statusMessage');
    if (node) node.textContent = message;
  }
  function resizeViews() {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  function setBusy(value) {
    busy = Boolean(value);
    el('agentRunButton').disabled = busy;
    el('agentApplyButton').disabled = busy || !preparedId;
    el('agentTaskInput').disabled = busy;
  }
  function setState(label, message) {
    el('agentState').textContent = label;
    el('agentStatus').textContent = message;
    shellStatus(`Workspace Agent · ${message}`);
  }
  function refreshWorkspace() {
    document.getElementById('fileRefreshButton')?.click();
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
  function showReview(tx) {
    preparedId = tx.id;
    el('agentSummary').textContent = tx.changeSet?.summary || 'ChangeSet';
    el('agentTouched').textContent = `${tx.touched?.length || 0} file(s) · ${tx.runner || 'agent'}`;
    el('agentDiff').textContent = tx.diff || '(no textual diff)';
    el('agentReview').classList.remove('hidden');
    el('agentApplyButton').disabled = false;
    resizeViews();
  }
  function runnerLabel(status) {
    const names = [];
    if (status?.runners?.localLiteral?.available) names.push('local-safe');
    if (status?.runners?.claude?.available) names.push('Claude Code');
    if (status?.runners?.gemini?.available) names.push('Gemini CLI');
    return names.length ? names.join(' · ') : 'no runner';
  }
  async function refreshStatus() {
    try {
      const status = await api.agent.status();
      el('agentScope').textContent = `root locked · ${status.workspace?.type || 'local'}`;
      el('agentStatus').textContent = runnerLabel(status);
      appliedId = status.transaction?.lastTransaction?.id || appliedId;
      el('agentUndoButton').disabled = !status.transaction?.undoAvailable;
    } catch (error) { setState('ERROR', error.message); }
  }
  async function runTask() {
    const task = el('agentTaskInput').value.trim();
    if (!task || busy) return;
    hideReview();
    setBusy(true);
    setState('PLANNING', 'finding relevant project files…');
    try {
      const tx = await api.agent.plan(task, { mode:el('agentMode').value });
      if (tx.status === 'APPLIED') {
        appliedId = tx.id;
        el('agentUndoButton').disabled = false;
        setState('APPLIED', `${tx.runner} · ${tx.touched.length} file(s) changed · Undo available`);
        refreshWorkspace();
      } else {
        showReview(tx);
        setState('REVIEW', `${tx.runner} prepared ${tx.touched.length} file(s); review diff then Apply`);
      }
    } catch (error) {
      setState('ERROR', error.message);
    } finally { setBusy(false); await refreshStatus(); }
  }
  async function applyPrepared() {
    if (!preparedId || busy) return;
    const id = preparedId;
    setBusy(true);
    setState('APPLYING', 'writing root-locked transaction…');
    try {
      const tx = await api.agent.apply(id);
      appliedId = tx.id;
      hideReview();
      el('agentUndoButton').disabled = false;
      setState('APPLIED', `${tx.touched.length} file(s) changed on disk · Undo available`);
      refreshWorkspace();
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); await refreshStatus(); }
  }
  async function undoLast() {
    if (busy) return;
    setBusy(true);
    setState('UNDO', 'restoring exact BEFORE snapshot…');
    try {
      const tx = await api.agent.undo(appliedId || undefined);
      appliedId = null;
      el('agentUndoButton').disabled = true;
      setState('UNDONE', `${tx.touched.length} file(s) restored to BEFORE state`);
      refreshWorkspace();
    } catch (error) { setState('ERROR', error.message); }
    finally { setBusy(false); await refreshStatus(); }
  }

  el('agentRunButton').onclick = runTask;
  el('agentApplyButton').onclick = applyPrepared;
  el('agentUndoButton').onclick = undoLast;
  el('agentCancelButton').onclick = () => { hideReview(); setState('READY', 'prepared ChangeSet discarded; no files changed'); };
  el('agentTaskInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); runTask(); }
  });
  api.agent.onChanged((tx) => {
    if (tx?.status === 'APPLIED') { appliedId = tx.id; el('agentUndoButton').disabled = false; }
    if (tx?.status === 'UNDONE' && appliedId === tx.id) { appliedId = null; el('agentUndoButton').disabled = true; }
  });

  refreshStatus().finally(resizeViews);
})();
