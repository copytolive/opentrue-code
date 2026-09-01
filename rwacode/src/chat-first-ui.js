'use strict';

(() => {
  const api = window.rwacode;
  if (!api?.agent || !api?.files || !api?.preview) return;

  const state = {
    provider: 'chatgpt',
    source: { type:'local' },
    prepared: null,
    applied: null,
    busy: false,
    gitCommitted: false,
    gitPushed: false,
    driveSynced: false,
    explorerPath: '.',
    previewUrl: 'http://127.0.0.1:3000',
  };

  const providers = {
    chatgpt:{label:'ChatGPT',icon:'✺'},
    claude:{label:'Claude',icon:'C'},
    gemini:{label:'Gemini',icon:'✦'},
    deepseek:{label:'DeepSeek',icon:'D'},
    auto:{label:'Auto',icon:'◎'},
  };

  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const esc = (value='') => String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const host = document.createElement('div');
  host.id = 'chatFirstRoot';
  host.className = 'cf-app';
  host.innerHTML = `
    <header class="cf-topbar">
      <div class="cf-top-left">
        <div class="cf-brand"><span class="cf-brandmark">R//</span><strong>RWACode</strong></div>
        <span class="cf-top-label">Workspace</span><button class="cf-workspace-pill">chat-local-online⌄</button><span class="cf-root-pill">▣ Root locked</span>
      </div>
      <div class="cf-provider-wrap">
        <button id="cfProviderButton" class="cf-provider-pill"><span id="cfProviderIcon">✺</span><strong id="cfProviderName">ChatGPT</strong><small>Chat mode</small><span>⌄</span></button>
        <div id="cfProviderMenu" class="cf-provider-menu cf-hidden">
          ${Object.entries(providers).map(([id,p]) => `<button data-provider="${id}"><span>${p.icon}</span><b>${p.label}</b><small id="cf-provider-state-${id}">checking…</small></button>`).join('')}
        </div>
      </div>
      <div class="cf-top-right"><button class="cf-icon">⌕</button><button class="cf-icon">◔</button><button class="cf-icon">?</button><button class="cf-icon">♧</button><span class="cf-avatar">HN</span></div>
    </header>

    <main class="cf-layout">
      <aside class="cf-column cf-left">
        <section class="cf-panel cf-workspace-panel"><div class="cf-section-title">Workspace</div><div class="cf-root-card"><span class="cf-root-badge">▣ Root locked</span><div class="cf-root-path">/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online</div><span class="cf-root-arrow">›</span></div></section>
        <section class="cf-panel cf-explorer">
          <div class="cf-row-between"><div class="cf-section-title cf-no-margin">Explorer</div><div class="cf-explorer-tools"><button id="cfExplorerRefresh">↻</button><button id="cfExplorerUp">↑</button></div></div>
          <div id="cfExplorerBreadcrumb" class="cf-breadcrumb">./</div><div id="cfTree" class="cf-tree"><div class="cf-empty">Loading workspace…</div></div><div class="cf-outline">› OUTLINE</div>
        </section>
        <section class="cf-panel cf-sources">
          <div class="cf-section-title">Context / Target Source</div>
          <button class="cf-source-row active" data-source="local"><span class="cf-source-icon">◈</span><span class="cf-source-name"><b>Local</b><small>This workspace</small></span><span class="cf-source-state">✓</span></button>
          <button class="cf-source-row" data-source="github"><span class="cf-source-icon github">●</span><span class="cf-source-name"><b>GitHub</b><small id="cfGitHubSub">copytolive/chart#main</small></span><span class="cf-source-state off">+</span></button>
          <button class="cf-source-row" data-source="googledrive"><span class="cf-source-icon drive">▲</span><span class="cf-source-name"><b>Google Drive</b><small id="cfDriveSub">Choose Drive path</small></span><span class="cf-source-state off">+</span></button>
          <button class="cf-source-row" data-source="web" disabled><span class="cf-source-icon web">◎</span><span class="cf-source-name"><b>Web</b><small>Manual provider browser only</small></span><span class="cf-source-state off">—</span></button>
        </section>
        <section class="cf-panel cf-recent"><div class="cf-section-title">Recent Tasks</div><div id="cfRecentTasks"><div class="cf-recent-row"><span>No task yet</span><span>—</span></div></div></section><div class="cf-version">v1.1.0 · chat-first</div>
      </aside>

      <section class="cf-column cf-center">
        <div class="cf-chat-head"><div class="cf-chat-title"><span id="cfChatProviderIcon">✺</span><span id="cfChatProviderName">ChatGPT</span></div><div class="cf-chat-head-state"><span id="cfAgentState">READY</span><small id="cfAgentRunner">checking provider…</small></div></div>
        <div id="cfChatScroll" class="cf-chat-scroll"><div class="cf-today">Hari ini</div><div class="cf-welcome"><strong>Chat-first workspace agent</strong><span>Ketik pekerjaan biasa. RWACode mencari file, menyiapkan ChangeSet, lalu Anda tetap memegang Apply / Undo / Git / Drive.</span></div></div>
        <div class="cf-composer-wrap"><div class="cf-composer"><div class="cf-composer-top"><button id="cfAddContext" class="cf-plus">+</button><textarea id="cfComposerInput" class="cf-composer-input" rows="1" placeholder="Kirim pesan ke ChatGPT"></textarea><button class="cf-mic">♩</button><button id="cfSendButton" class="cf-send">↑</button></div><div class="cf-composer-bottom"><span class="cf-mode-small on">◉ Review before Apply</span><span id="cfSourceChip" class="cf-source-chip">@Local</span></div></div><div class="cf-disclaimer">Provider web pages stay manual. Automated edits use only approved agent routes and root-locked transactions.</div></div>
      </section>

      <aside class="cf-column cf-right">
        <div class="cf-right-top"><div class="cf-tabs"><button class="cf-tab active" data-tab="preview">Preview</button><button class="cf-tab" data-tab="inspector">Inspector</button><button class="cf-tab" data-tab="console">Console</button><button class="cf-tab" data-tab="network">Network</button></div></div>
        <div id="cfPreviewPane" class="cf-pane"><div class="cf-preview-toolbar"><input id="cfPreviewUrl" value="http://127.0.0.1:3000"/><button id="cfPreviewLoad">Load</button></div><div class="cf-device-row"><div><button class="cf-device active">▱</button><button class="cf-device">▯</button><button class="cf-device">▯</button></div><button id="cfPreviewReload" class="cf-fullscreen">↻ Reload</button></div><div id="cfPreviewHost" class="cf-preview-host"><div class="cf-preview-placeholder"><span>✦</span><strong>Preview</strong><small>Load your local app here</small></div></div><section class="cf-subcard"><div class="cf-subcard-title">ACTIVITY</div><div id="cfActivity"><div class="cf-activity-line"><span class="idle">●</span>Waiting for a task</div></div></section><section class="cf-subcard"><div class="cf-subcard-title">GIT / DRIVE STATUS</div><div class="cf-git-head"><span id="cfWorkspaceStatus">Local workspace</span><span id="cfWorkspaceClean">Ready</span></div><div class="cf-git-row"><span>Changed files</span><span id="cfChangedFiles">0</span></div><div class="cf-git-row"><span>Transaction</span><span id="cfTransactionState">None</span></div><div id="cfExternalActions"></div></section></div>
        <div id="cfInspectorPane" class="cf-pane cf-hidden"><div class="cf-subcard"><div class="cf-subcard-title">SELECTED WORKSPACE</div><div class="cf-kv"><span>Provider</span><b id="cfInspectorProvider">ChatGPT</b></div><div class="cf-kv"><span>Source</span><b id="cfInspectorSource">Local</b></div><div class="cf-kv"><span>Safety</span><b>Root locked · Review/Apply</b></div></div></div>
        <div id="cfConsolePane" class="cf-pane cf-hidden"><div id="cfConsole" class="cf-console"><div class="cf-console-line ok">✓ RWACode chat-first shell ready</div></div></div>
        <div id="cfNetworkPane" class="cf-pane cf-hidden"><div class="cf-network-note">Provider network calls are made only by approved agent adapters. Native provider browser pages are not scraped or automated.</div></div>
      </aside>
    </main>

    <div id="cfDiffModal" class="cf-modal"><div class="cf-modal-card"><div class="cf-modal-head"><strong id="cfDiffTitle">Review changes</strong><button data-cf-close>×</button></div><pre id="cfDiff" class="cf-diff"></pre><div class="cf-modal-actions"><button data-cf-close class="cf-btn">Close</button><button id="cfApplyButton" class="cf-btn primary">Apply</button></div></div></div>
    <div id="cfSourceModal" class="cf-modal"><div class="cf-modal-card small"><div class="cf-modal-head"><strong id="cfSourceModalTitle">Source</strong><button data-cf-close>×</button></div><label id="cfSourceLabel" class="cf-field-label">Locator</label><input id="cfSourceInput" class="cf-field"/><div class="cf-modal-actions"><button data-cf-close class="cf-btn">Cancel</button><button id="cfSourceSave" class="cf-btn primary">Use source</button></div></div></div>
    <div id="cfGitModal" class="cf-modal"><div class="cf-modal-card small"><div class="cf-modal-head"><strong>Explicit Git action</strong><button data-cf-close>×</button></div><label class="cf-field-label">Commit message</label><input id="cfCommitMessage" class="cf-field" placeholder="Describe the change"/><label class="cf-field-label">Pull request title</label><input id="cfPrTitle" class="cf-field" placeholder="Optional until after Push"/><div class="cf-modal-actions"><button data-cf-close class="cf-btn">Cancel</button><button id="cfCommitAction" class="cf-btn primary">Commit</button><button id="cfPushAction" class="cf-btn" disabled>Push</button><button id="cfPrAction" class="cf-btn" disabled>Open PR</button></div></div></div>
    <div id="cfToast" class="cf-toast"></div>`;

  document.body.appendChild(host);
  document.body.classList.add('chat-first-active');
  api.browser?.setVisible?.(false).catch(() => {});

  function toast(message){const n=$('#cfToast');n.textContent=message;n.classList.add('show');clearTimeout(window.__cfToast);window.__cfToast=setTimeout(()=>n.classList.remove('show'),2300)}
  function log(message,ok=true){const n=document.createElement('div');n.className=`cf-console-line${ok?' ok':''}`;n.textContent=`${ok?'✓':'•'} ${message}`;$('#cfConsole').appendChild(n)}
  function setAgentState(label,detail=''){ $('#cfAgentState').textContent=label; $('#cfAgentRunner').textContent=detail; }
  function setBusy(value){state.busy=Boolean(value);$('#cfSendButton').disabled=state.busy;$('#cfComposerInput').disabled=state.busy}
  function closeModals(){ $$('.cf-modal').forEach((m)=>m.classList.remove('open')) }
  $$('[data-cf-close]').forEach((b)=>b.onclick=closeModals); $$('.cf-modal').forEach((m)=>m.onclick=(e)=>{if(e.target===m)closeModals()});
  function activity(items=[]){$('#cfActivity').innerHTML=items.map((i)=>`<div class="cf-activity-line"><span class="${i.done?'done':i.busy?'busy':'idle'}">${i.done?'✓':i.busy?'◌':'●'}</span>${esc(i.label)}</div>`).join('')}

  function providerDisplay(){const p=providers[state.provider]||providers.auto;['cfProviderName','cfChatProviderName'].forEach((id)=>$(`#${id}`).textContent=p.label);['cfProviderIcon','cfChatProviderIcon'].forEach((id)=>$(`#${id}`).textContent=p.icon);$('#cfInspectorProvider').textContent=p.label;$('#cfComposerInput').placeholder=`Kirim pesan ke ${p.label}`}
  function sourceLabel(){if(state.source.type==='github')return state.source.locator||'GitHub';if(state.source.type==='googledrive')return state.source.locator?state.source.locator.split('/').filter(Boolean).slice(-2).join('/'):'Google Drive';return'This workspace'}
  function sourceDisplay(){ $$('.cf-source-row[data-source]').forEach((row)=>{const active=row.dataset.source===state.source.type;row.classList.toggle('active',active);const mark=$('.cf-source-state',row);if(mark&&row.dataset.source!=='web'){mark.textContent=active?'✓':'+';mark.classList.toggle('off',!active)}});$('#cfSourceChip').textContent=state.source.type==='github'?'@GitHub':state.source.type==='googledrive'?'@GoogleDrive':'@Local';$('#cfInspectorSource').textContent=`${state.source.type} · ${sourceLabel()}`;$('#cfWorkspaceStatus').textContent=state.source.type==='github'?`GitHub · ${sourceLabel()}`:state.source.type==='googledrive'?'Google Drive managed mirror':'Local workspace'}

  async function refreshProviderStatus(){try{const status=await api.agent.status({type:'local'});const p=status.runners?.providers||{};const legacy=status.runners||{};const labels={chatgpt:p.chatgpt?.available?'automation ready':legacy.codex?.available?'approved OpenAI fallback':'setup required',claude:p.claude?.available||legacy.claude?.available?'automation ready':'setup required',gemini:p.gemini?.available?'automation ready':'setup required',deepseek:p.deepseek?.available?'automation ready':'setup required',auto:'best approved route'};Object.entries(labels).forEach(([id,text])=>{const n=$(`#cf-provider-state-${id}`);if(n)n.textContent=text});setAgentState('READY','chat-first · provider-safe')}catch(error){setAgentState('ERROR',error.message);log(error.message,false)}}
  $('#cfProviderButton').onclick=()=>$('#cfProviderMenu').classList.toggle('cf-hidden'); $$('#cfProviderMenu [data-provider]').forEach((b)=>b.onclick=()=>{state.provider=b.dataset.provider;providerDisplay();$('#cfProviderMenu').classList.add('cf-hidden');refreshProviderStatus();toast(`Provider: ${providers[state.provider].label}`)});

  $$('.cf-source-row[data-source]').forEach((row)=>row.onclick=()=>{const type=row.dataset.source;if(type==='web')return;if(type==='local'){state.source={type:'local'};sourceDisplay();return}$('#cfSourceModalTitle').textContent=type==='github'?'GitHub workspace':'Google Drive source';$('#cfSourceLabel').textContent=type==='github'?'owner/repository#branch':'Mounted Google Drive file/folder path';$('#cfSourceInput').value=type==='github'?(state.source.type==='github'?state.source.locator:'copytolive/chart#main'):(state.source.type==='googledrive'?state.source.locator:'');$('#cfSourceSave').dataset.type=type;$('#cfSourceModal').classList.add('open');setTimeout(()=>$('#cfSourceInput').focus(),0)});
  $('#cfSourceSave').onclick=()=>{const type=$('#cfSourceSave').dataset.type;const locator=$('#cfSourceInput').value.trim();if(!locator)return toast('Source locator wajib diisi');state.source={type,locator};if(type==='github')$('#cfGitHubSub').textContent=locator;if(type==='googledrive')$('#cfDriveSub').textContent=locator.split('/').filter(Boolean).slice(-2).join('/');closeModals();sourceDisplay();toast(`Target source: ${type}`)};

  async function renderExplorer(relativePath='.') {try{const result=await api.files.list(relativePath);state.explorerPath=result.relativePath||relativePath||'.';$('#cfExplorerBreadcrumb').textContent=state.explorerPath==='.'?'./':`./${state.explorerPath}`;const entries=result.entries||result.items||[];$('#cfTree').innerHTML=entries.length?entries.slice(0,80).map((entry)=>{const rel=entry.relativePath||entry.path||entry.name;const isDir=entry.type==='directory'||entry.kind==='directory'||entry.isDirectory;return`<button class="cf-tree-row" data-path="${esc(rel)}" data-dir="${isDir?'1':'0'}"><span class="chev">${isDir?'›':''}</span><span class="fileicon">${isDir?'□':'▧'}</span><span class="name">${esc(entry.name||rel.split('/').pop())}</span></button>`}).join(''):'<div class="cf-empty">No files</div>';$$('#cfTree .cf-tree-row').forEach((row)=>row.onclick=async()=>{if(row.dataset.dir==='1')return renderExplorer(row.dataset.path);try{const file=await api.files.read(row.dataset.path);toast(`${row.dataset.path} · ${file?.size||''}`)}catch(error){toast(error.message)}})}catch(error){$('#cfTree').innerHTML=`<div class="cf-empty">${esc(error.message)}</div>`}}
  $('#cfExplorerRefresh').onclick=()=>renderExplorer(state.explorerPath);$('#cfExplorerUp').onclick=()=>{const parts=String(state.explorerPath||'.').split('/').filter((p)=>p&&p!=='.');parts.pop();renderExplorer(parts.join('/')||'.')};

  function appendUser(text){const n=document.createElement('div');n.className='cf-message';n.innerHTML=`<div class="cf-user-wrap"><div class="cf-user-bubble">${esc(text)}<span class="cf-time">sekarang</span></div><span class="cf-user-mini">HN</span></div>`;$('#cfChatScroll').appendChild(n);$('#cfChatScroll').scrollTop=$('#cfChatScroll').scrollHeight}
  function appendPlanning(text){const n=document.createElement('div');n.className='cf-assistant';n.innerHTML=`<div class="cf-assistant-avatar">${esc(providers[state.provider]?.icon||'◎')}</div><div class="cf-assistant-body"><p>Saya akan mengerjakan: <b>${esc(text)}</b></p><div class="cf-progress-card"><div class="cf-step"><span class="cf-dot done">✓</span>Mengambil context workspace</div><div class="cf-step"><span class="cf-dot progress"></span>Menyiapkan ChangeSet</div><div class="cf-step muted"><span class="cf-dot"></span>Menunggu review</div></div></div>`;$('#cfChatScroll').appendChild(n);$('#cfChatScroll').scrollTop=$('#cfChatScroll').scrollHeight;return n}
  function showReview(node,tx){const body=$('.cf-assistant-body',node);body.innerHTML=`<p>${esc(tx.changeSet?.summary||'ChangeSet siap direview.')}</p><div class="cf-success-card review"><div class="cf-success-title"><span class="cf-success-check">✓</span>Review siap</div><div class="cf-stats">${tx.touched?.length||0} file akan diubah · ${esc(tx.runner||'agent')}</div><div class="cf-action-row"><button class="cf-btn primary" data-action="diff">Lihat Perubahan</button><button class="cf-btn" data-action="apply">Apply</button><button class="cf-btn" data-action="cancel">Batal</button></div></div><div class="cf-result-text">Belum ada file yang ditulis. Apply tetap melalui Transaction Engine root-locked.</div>`;$('[data-action="diff"]',body).onclick=()=>showDiff(tx);$('[data-action="apply"]',body).onclick=()=>applyPrepared(node);$('[data-action="cancel"]',body).onclick=()=>{state.prepared=null;body.insertAdjacentHTML('beforeend','<p class="cf-muted">ChangeSet dibatalkan.</p>')}}
  function showApplied(node,tx){const body=$('.cf-assistant-body',node);body.innerHTML=`<p>${esc(tx.changeSet?.summary||'Perubahan diterapkan.')}</p><div class="cf-success-card"><div class="cf-success-title"><span class="cf-success-check">✓</span>Applied</div><div class="cf-stats">${tx.touched?.length||0} file diubah · exact Undo tersedia</div><div class="cf-action-row"><button class="cf-btn primary" data-action="diff">Lihat Perubahan</button><button class="cf-btn" data-action="preview">Buka Preview</button><button class="cf-btn" data-action="undo">Undo</button></div></div><div class="cf-chips"><span><i></i>Root-locked transaction</span><span><i></i>Undo available</span></div>`;$('[data-action="diff"]',body).onclick=()=>showDiff(tx);$('[data-action="preview"]',body).onclick=loadPreview;$('[data-action="undo"]',body).onclick=()=>undoApplied(node);renderExternalActions(tx)}
  function showDiff(tx=state.prepared||state.applied){if(!tx)return;$('#cfDiffTitle').textContent=`${tx.changeSet?.summary||'Changes'} · ${tx.touched?.length||0} file(s)`;$('#cfDiff').textContent=tx.diff||tx.sourceState?.gitDiff||'(no textual diff)';$('#cfApplyButton').classList.toggle('cf-hidden',tx.status!=='PREPARED');$('#cfDiffModal').classList.add('open')}

  async function runTask(){const input=$('#cfComposerInput');const text=input.value.trim();if(!text||state.busy)return;appendUser(text);input.value='';const assistant=appendPlanning(text);setBusy(true);setAgentState('PLANNING',`${providers[state.provider]?.label||'AI'} · ${state.source.type}`);activity([{label:'Read project context',busy:true},{label:'Prepare structured ChangeSet'},{label:'Review before Apply'}]);try{const tx=await api.agent.plan(text,{mode:'normal',source:state.source,provider:state.provider});state.prepared=tx;state.applied=null;showReview(assistant,tx);setAgentState('REVIEW',`${tx.runner||'agent'} · ${tx.touched?.length||0} file(s)`);$('#cfChangedFiles').textContent=String(tx.touched?.length||0);$('#cfTransactionState').textContent='Prepared';activity([{label:`Read ${tx.evidence?.contextFiles?.length||'project'} context files`,done:true},{label:'Prepared ChangeSet',done:true},{label:'Waiting for Apply',busy:true}]);addRecent(text,'REVIEW');log(`ChangeSet prepared by ${tx.runner||'agent'}`)}catch(error){$('.cf-assistant-body',assistant).innerHTML=`<p class="cf-error"><b>Belum bisa menjalankan otomatis.</b><br>${esc(error.message)}</p><p>Provider web tetap dapat dipakai manual; RWACode tidak akan scrape atau menekan tombol provider.</p>`;setAgentState('ERROR',error.message);activity([{label:'Planning failed'}]);log(error.message,false)}finally{setBusy(false)}}
  async function applyPrepared(node=null){if(!state.prepared||state.busy)return;setBusy(true);setAgentState('APPLYING','root-locked transaction');try{const tx=await api.agent.apply(state.prepared.id);state.applied=tx;state.prepared=null;const target=node||$$('.cf-assistant').slice(-1)[0];if(target)showApplied(target,tx);$('#cfTransactionState').textContent='Applied';$('#cfChangedFiles').textContent=String(tx.touched?.length||0);activity([{label:'Context retrieved',done:true},{label:`Edit ${tx.touched?.length||0} file(s)`,done:true},{label:'Preview ready to reload',done:true}]);setAgentState('APPLIED','Undo available');api.preview.reload().catch(()=>{});renderExplorer(state.explorerPath);closeModals();log('Transaction applied')}catch(error){setAgentState('ERROR',error.message);log(error.message,false)}finally{setBusy(false)}}
  async function undoApplied(node=null){if(!state.applied||state.busy)return;setBusy(true);setAgentState('UNDO','restoring exact BEFORE');try{await api.agent.undo(state.applied.id);state.applied=null;state.prepared=null;state.gitCommitted=false;state.gitPushed=false;state.driveSynced=false;$('#cfChangedFiles').textContent='0';$('#cfTransactionState').textContent='Undone';$('#cfExternalActions').innerHTML='';const target=node||$$('.cf-assistant').slice(-1)[0];if(target)$('.cf-assistant-body',target).insertAdjacentHTML('beforeend','<p class="cf-undone">↶ UNDONE · exact BEFORE restored.</p>');setAgentState('UNDONE','exact BEFORE restored');activity([{label:'Exact BEFORE restored',done:true}]);api.preview.reload().catch(()=>{});renderExplorer(state.explorerPath);log('Undo restored BEFORE bytes')}catch(error){setAgentState('ERROR',error.message);log(error.message,false)}finally{setBusy(false)}}
  $('#cfApplyButton').onclick=()=>applyPrepared();

  function renderExternalActions(tx){const h=$('#cfExternalActions');h.innerHTML='';if(tx.workspace?.type==='github'){h.innerHTML='<button id="cfGitButton" class="cf-commit">Commit / Push / PR…</button>';$('#cfGitButton').onclick=()=>$('#cfGitModal').classList.add('open')}else if(tx.workspace?.type==='googledrive'){h.innerHTML='<button id="cfDriveSync" class="cf-commit">Sync to Drive</button><small class="cf-external-note">mirror only until explicit Sync</small>';$('#cfDriveSync').onclick=syncDrive}}
  $('#cfCommitAction').onclick=async()=>{if(!state.applied||state.gitCommitted)return;const message=$('#cfCommitMessage').value.trim();if(!message)return toast('Commit message wajib diisi');try{await api.agent.githubAction(state.applied.id,'commit',{message});state.gitCommitted=true;$('#cfCommitAction').disabled=true;$('#cfPushAction').disabled=false;toast('Commit dibuat di managed branch');log('Git commit created')}catch(error){toast(error.message);log(error.message,false)}};
  $('#cfPushAction').onclick=async()=>{if(!state.applied||!state.gitCommitted||state.gitPushed)return;try{await api.agent.githubAction(state.applied.id,'push',{});state.gitPushed=true;$('#cfPushAction').disabled=true;$('#cfPrAction').disabled=false;toast('Branch pushed');log('Git branch pushed')}catch(error){toast(error.message);log(error.message,false)}};
  $('#cfPrAction').onclick=async()=>{if(!state.applied||!state.gitPushed)return;const title=$('#cfPrTitle').value.trim();if(!title)return toast('PR title wajib diisi');try{const result=await api.agent.githubAction(state.applied.id,'pr',{title,body:'Created explicitly from RWACode chat-first workflow.'});toast(`PR opened${result?.number?` #${result.number}`:''}`);log('Pull request opened');closeModals()}catch(error){toast(error.message);log(error.message,false)}};
  async function syncDrive(){if(!state.applied||state.driveSynced)return;try{await api.agent.driveAction(state.applied.id,'sync',{});state.driveSynced=true;$('#cfDriveSync').disabled=true;$('#cfDriveSync').textContent='Synced to Drive';toast('Google Drive sync complete');log('Drive sync complete')}catch(error){toast(error.message);log(error.message,false)}}
  function addRecent(text,status){const root=$('#cfRecentTasks');const first=$('.cf-recent-row',root);if(first?.textContent.includes('No task yet'))root.innerHTML='';const row=document.createElement('div');row.className='cf-recent-row';row.innerHTML=`<span>${esc(text.slice(0,34))}</span><span>${esc(status)} · ✓</span>`;root.prepend(row);while(root.children.length>4)root.lastElementChild.remove()}

  $('#cfSendButton').onclick=runTask;$('#cfComposerInput').addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();runTask()}});$('#cfAddContext').onclick=()=>toast('Pilih Local / GitHub / Google Drive dari Context Sources');
  async function layoutPreview(){const rect=$('#cfPreviewHost').getBoundingClientRect();if(!rect.width||!rect.height)return;try{await api.preview.setBounds({x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)})}catch{}}
  async function loadPreview(){state.previewUrl=$('#cfPreviewUrl').value.trim()||state.previewUrl;try{await api.preview.load(state.previewUrl);await layoutPreview();toast(`Preview: ${state.previewUrl}`);log(`Preview loaded ${state.previewUrl}`)}catch(error){toast(error.message);log(error.message,false)}}
  $('#cfPreviewLoad').onclick=loadPreview;$('#cfPreviewReload').onclick=()=>api.preview.reload().then(()=>toast('Preview reloaded')).catch((error)=>toast(error.message));window.addEventListener('resize',layoutPreview);api.preview.onState?.((p)=>{if(p?.url)$('#cfPreviewUrl').value=p.url});
  $$('.cf-tab').forEach((tab)=>tab.onclick=()=>{$$('.cf-tab').forEach((item)=>item.classList.toggle('active',item===tab));const name=tab.dataset.tab;['preview','inspector','console','network'].forEach((id)=>$(`#cf${id[0].toUpperCase()+id.slice(1)}Pane`).classList.toggle('cf-hidden',id!==name));if(name==='preview')layoutPreview();else api.preview.setBounds({x:0,y:0,width:0,height:0}).catch(()=>{})});
  $$('.cf-device').forEach((button)=>button.onclick=()=>{$$('.cf-device').forEach((item)=>item.classList.toggle('active',item===button));toast('Preview viewport preference changed')});
  api.agent.onChanged?.((tx)=>{if(tx?.touched){$('#cfChangedFiles').textContent=String(tx.touched.length);renderExplorer(state.explorerPath)}});api.files.onChanged?.(()=>renderExplorer(state.explorerPath));

  providerDisplay();sourceDisplay();renderExplorer('.');refreshProviderStatus();requestAnimationFrame(layoutPreview);
})();
