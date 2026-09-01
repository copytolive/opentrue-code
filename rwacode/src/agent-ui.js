'use strict';

(() => {
  const api=window.rwacode;
  const surface=document.getElementById('browserSurface');
  if(!api?.agent||!surface)return;

  const style=document.createElement('style');
  style.textContent=`
    .browser-panel{grid-template-rows:var(--tab-h) var(--toolbar-h) auto minmax(0,1fr)!important}
    .rw-agent{border-bottom:1px solid #1c2937;background:#09121c;padding:8px 12px;display:grid;gap:7px;position:relative;z-index:20}
    .rw-agent-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
    .rw-agent-source,.rw-agent-provider,.rw-agent-locator,.rw-agent-input,.rw-agent-mode,.rw-agent-button,.rw-agent-small-input{height:34px;border:1px solid #2a394b;border-radius:8px;background:#0e1824;color:#cfd9e5;padding:0 10px}
    .rw-agent-source{border-color:rgba(85,216,146,.28);background:rgba(18,58,45,.46);color:#a9efca;font-weight:700}.rw-agent-provider{max-width:130px}
    .rw-agent-locator{width:210px;background:#070e16}.rw-agent-locator.hidden{display:none}.rw-agent-input{min-width:220px;flex:1;background:#070e16;color:#e7eef7;outline:none}
    .rw-agent-input:focus,.rw-agent-locator:focus,.rw-agent-small-input:focus{border-color:#4775a4;box-shadow:0 0 0 2px rgba(77,143,255,.08)}
    .rw-agent-small-input{height:30px;min-width:150px;flex:1;background:#070e16;color:#e7eef7;outline:none;font-size:11px}
    .rw-agent-button.primary{border-color:#3567a0;background:#10213a;color:#edf5ff;font-weight:700}.rw-agent-button:disabled{opacity:.42;cursor:default}
    .rw-agent-meta{display:flex;align-items:center;gap:8px;min-width:0;color:#8393a7;font-size:10px;flex-wrap:wrap}.rw-agent-meta b{color:#cfd9e5;font-weight:600}.rw-agent-meta .grow{flex:1}
    .rw-agent-review{display:grid;grid-template-rows:auto minmax(80px,190px);gap:6px}.rw-agent-review.hidden,.rw-agent-git-actions.hidden,.rw-agent-drive-actions.hidden{display:none!important}
    .rw-agent-review-head,.rw-agent-git-actions,.rw-agent-drive-actions{display:flex;align-items:center;gap:8px;color:#9eacbd;font-size:10px;flex-wrap:wrap}.rw-agent-review-head strong{color:#e7eef6}
    .rw-agent-git-actions,.rw-agent-drive-actions{padding-top:1px}.rw-agent-git-actions .rw-agent-button,.rw-agent-drive-actions .rw-agent-button{height:30px}
    .rw-agent-diff{margin:0;max-height:190px;overflow:auto;border:1px solid #28384a;border-radius:8px;background:#060b11;color:#b9c6d5;padding:10px 12px;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
  `;
  document.head.appendChild(style);

  const host=document.createElement('section');host.id='agentCommandBar';host.className='rw-agent';host.setAttribute('aria-label','RWACode Workspace Agent');
  host.innerHTML=`
    <div class="rw-agent-row">
      <select id="agentWorkspaceTag" class="rw-agent-source" aria-label="Editable workspace target"><option value="local">@Local</option><option value="github">@GitHub</option><option value="googledrive">@GoogleDrive</option></select>
      <input id="agentSourceLocator" class="rw-agent-locator hidden" autocomplete="off" spellcheck="false" placeholder="owner/repository#branch" />
      <select id="agentProvider" class="rw-agent-provider" aria-label="Planning provider"><option value="auto">AI: Auto</option><option value="chatgpt">ChatGPT API</option><option value="claude">Claude API</option><option value="gemini">Gemini API</option><option value="deepseek">DeepSeek API</option></select>
      <input id="agentTaskInput" class="rw-agent-input" autocomplete="off" spellcheck="false" placeholder="Describe the project change; no file selection required" />
      <select id="agentMode" class="rw-agent-mode" aria-label="Agent apply mode"><option value="normal">Normal</option><option value="auto">Auto</option></select>
      <button id="agentRunButton" class="rw-agent-button primary">Run</button><button id="agentUndoButton" class="rw-agent-button" disabled>Undo</button>
    </div>
    <div class="rw-agent-meta"><b id="agentState">READY</b><span id="agentStatus">Checking safe routes…</span><span class="grow"></span><span id="agentScope">root locked · local</span></div>
    <div id="agentReview" class="rw-agent-review hidden"><div class="rw-agent-review-head"><strong id="agentSummary">ChangeSet</strong><span id="agentTouched"></span><span class="grow"></span><button id="agentCancelButton" class="rw-agent-button">Cancel</button><button id="agentApplyButton" class="rw-agent-button primary">Apply</button></div><pre id="agentDiff" class="rw-agent-diff"></pre></div>
    <div id="agentGitActions" class="rw-agent-git-actions hidden" aria-label="Explicit GitHub actions"><strong>Explicit Git:</strong><input id="agentCommitMessage" class="rw-agent-small-input" autocomplete="off" spellcheck="false" placeholder="Commit message" /><button id="agentCommitButton" class="rw-agent-button">Commit</button><button id="agentPushButton" class="rw-agent-button" disabled>Push</button><input id="agentPrTitle" class="rw-agent-small-input" autocomplete="off" spellcheck="false" placeholder="Pull request title" /><button id="agentPrButton" class="rw-agent-button" disabled>Open PR</button></div>
    <div id="agentDriveActions" class="rw-agent-drive-actions hidden" aria-label="Explicit Google Drive actions"><strong>Explicit Drive:</strong><button id="agentDriveSyncButton" class="rw-agent-button primary">Sync to Drive</button><span id="agentDriveHint">mirror only until Sync to Drive</span></div>
  `;
  surface.parentNode.insertBefore(host,surface);

  const el=(id)=>document.getElementById(id);
  let preparedId=null;let preparedIdentity=null;let busy=false;let activeWorkspace={type:'local'};let gitCommitted=false;let gitPushed=false;let driveSynced=false;
  const appliedBySource=new Map();const transactionSourceById=new Map();

  function sourceIdentity(source={type:'local'}){const type=String(source?.type||'local').toLowerCase();return`${type}::${type==='local'?'':String(source?.locator||'').trim()}`;}
  function selectedSource(){const type=el('agentWorkspaceTag').value;if(type==='github'||type==='googledrive')return{type,locator:el('agentSourceLocator').value.trim()};return{type:'local'};}
  function currentIdentity(){return sourceIdentity(selectedSource());}
  function currentAppliedId(){return appliedBySource.get(currentIdentity())||null;}
  function shellStatus(message){const node=document.getElementById('statusMessage');if(node)node.textContent=message;}
  function resizeViews(){requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}
  function notifySourceChanged(){window.dispatchEvent(new CustomEvent('rwacode:agent-source-notify',{detail:selectedSource()}));}
  function syncUndoButton(){el('agentUndoButton').disabled=busy||!currentAppliedId()||gitCommitted;}
  function setBusy(value){busy=Boolean(value);el('agentRunButton').disabled=busy;el('agentApplyButton').disabled=busy||!preparedId;el('agentTaskInput').disabled=busy;el('agentWorkspaceTag').disabled=busy;el('agentSourceLocator').disabled=busy;el('agentProvider').disabled=busy;el('agentCommitButton').disabled=busy||gitCommitted;el('agentPushButton').disabled=busy||!gitCommitted||gitPushed;el('agentPrButton').disabled=busy||!gitPushed;el('agentDriveSyncButton').disabled=busy||driveSynced||!currentAppliedId();syncUndoButton();}
  function setState(label,message){el('agentState').textContent=label;el('agentStatus').textContent=message;shellStatus(`Workspace Agent · ${message}`);}
  function resetSourceActions(){gitCommitted=false;gitPushed=false;driveSynced=false;el('agentGitActions').classList.add('hidden');el('agentDriveActions').classList.add('hidden');el('agentCommitButton').disabled=false;el('agentPushButton').disabled=true;el('agentPrButton').disabled=true;el('agentDriveSyncButton').disabled=true;el('agentCommitMessage').value='';el('agentPrTitle').value='';el('agentDriveHint').textContent='mirror only until Sync to Drive';}
  function refreshWorkspace(){notifySourceChanged();api.preview.reload().catch(()=>{});resizeViews();}
  function hideReview(){preparedId=null;preparedIdentity=null;el('agentReview').classList.add('hidden');el('agentDiff').textContent='';el('agentApplyButton').disabled=true;resizeViews();}
  function sourceScope(tx){if(tx?.workspace?.type==='github'){const s=tx.sourceState||{};return`root locked · GitHub ${s.repository||tx.workspace?.source?.repository||''} · ${s.branch||''}`.trim();}if(tx?.workspace?.type==='googledrive'){const s=tx.sourceState||{};return`root locked · Google Drive mirror · ${s.sourcePath||tx.workspace?.source?.sourcePath||''}`.trim();}return'root locked · local';}
  function showReview(tx,identity){preparedId=tx.id;preparedIdentity=identity;activeWorkspace=tx.workspace||activeWorkspace;transactionSourceById.set(tx.id,identity);el('agentSummary').textContent=tx.changeSet?.summary||'ChangeSet';el('agentTouched').textContent=`${tx.touched?.length||0} file(s) · ${tx.runner||'agent'}`;el('agentDiff').textContent=tx.diff||'(no textual diff)';el('agentScope').textContent=sourceScope(tx);el('agentReview').classList.remove('hidden');el('agentCancelButton').style.display='';el('agentApplyButton').style.display='';el('agentApplyButton').disabled=false;resizeViews();}
  function rememberApplied(tx,identity){if(!tx?.id)return;transactionSourceById.set(tx.id,identity);appliedBySource.set(identity,tx.id);syncUndoButton();}
  function showSourceApplied(tx){
    preparedId=null;preparedIdentity=null;el('agentCancelButton').style.display='none';el('agentApplyButton').style.display='none';
    if(tx?.workspace?.type==='github'){el('agentSummary').textContent=`Git diff · ${tx.sourceState?.branch||'managed branch'}`;el('agentTouched').textContent=`${tx.touched?.length||0} file(s) · no commit/push performed`;el('agentDiff').textContent=tx.sourceState?.gitDiff||tx.diff||'(clean Git worktree)';el('agentReview').classList.remove('hidden');el('agentScope').textContent=sourceScope(tx);el('agentGitActions').classList.toggle('hidden',tx.status!=='APPLIED');el('agentDriveActions').classList.add('hidden');gitCommitted=false;gitPushed=false;return resizeViews();}
    if(tx?.workspace?.type==='googledrive'){el('agentSummary').textContent=`Drive mirror diff · ${tx.sourceState?.sourcePath||'managed mirror'}`;el('agentTouched').textContent=`${tx.touched?.length||0} file(s) · ${driveSynced?'synced to Drive':'not synced to Drive'}`;el('agentDiff').textContent=tx.diff||'(no textual diff)';el('agentReview').classList.remove('hidden');el('agentScope').textContent=sourceScope(tx);el('agentGitActions').classList.add('hidden');el('agentDriveActions').classList.toggle('hidden',tx.status!=='APPLIED');el('agentDriveSyncButton').disabled=tx.status!=='APPLIED'||driveSynced;return resizeViews();}
    hideReview();
  }
  function runnerLabel(status){const names=[];if(status?.runners?.localLiteral?.available)names.push('local-safe');const labels={chatgpt:'ChatGPT API',claude:'Claude API',gemini:'Gemini API',deepseek:'DeepSeek API'};for(const [id,info] of Object.entries(status?.runners?.providers||{}))if(info?.available)names.push(labels[id]||id);if(status?.sources?.github?.git?.available)names.push('GitHub worktree');if(status?.sources?.googledrive?.available)names.push('Google Drive Desktop');return names.length?names.join(' · '):'provider setup required for free-form tasks';}
  async function refreshStatus(){
    const source=selectedSource();
    try{
      if((source.type==='github'||source.type==='googledrive')&&!source.locator){const base=await api.agent.status({type:'local'});el('agentStatus').textContent=runnerLabel(base);syncUndoButton();return;}
      const status=await api.agent.status(source);el('agentStatus').textContent=runnerLabel(status);if(status?.transaction?.undoAvailable&&status.transaction.lastTransaction?.id){const id=status.transaction.lastTransaction.id;const identity=sourceIdentity(source);transactionSourceById.set(id,identity);appliedBySource.set(identity,id);}el('agentScope').textContent=sourceScope({workspace:status.workspace,sourceState:status.sourceState});syncUndoButton();
    }catch(error){setState('ERROR',error.message);syncUndoButton();}
  }
  async function runTask(){
    const task=el('agentTaskInput').value.trim();const source=selectedSource();const identity=sourceIdentity(source);if(busy)return;if(!task)return setState('READY','Enter a task before Run');if(source.type==='github'&&!source.locator)return setState('READY','Enter owner/repository#branch for @GitHub');if(source.type==='googledrive'&&!source.locator)return setState('READY','Enter a mounted Google Drive file/folder path');
    hideReview();resetSourceActions();setBusy(true);setState('PLANNING',source.type==='github'?'mounting managed GitHub worktree and finding files…':source.type==='googledrive'?'materializing Google Drive source into a managed mirror…':'finding relevant project files…');
    try{
      const tx=await api.agent.plan(task,{mode:el('agentMode').value,source,provider:el('agentProvider').value});activeWorkspace=tx.workspace||source;
      if(tx.status==='NO_CHANGE'){hideReview();setState('NO_CHANGE',tx.changeSet?.summary||'No safe change required');return;}
      transactionSourceById.set(tx.id,identity);
      if(tx.status==='APPLIED'){rememberApplied(tx,identity);setState('APPLIED',`${tx.runner} · ${tx.touched.length} file(s) changed · durable Undo available`);showSourceApplied(tx);refreshWorkspace();}else{showReview(tx,identity);setState('REVIEW',`${tx.runner} prepared ${tx.touched.length} file(s); review diff then Apply`);}
    }catch(error){setState('ERROR',error.message);}finally{setBusy(false);await refreshStatus();}
  }
  async function applyPrepared(){if(!preparedId||busy)return;if(preparedIdentity!==currentIdentity()){hideReview();return setState('READY','Target changed; discarded stale prepared ChangeSet');}const id=preparedId;const identity=preparedIdentity;setBusy(true);setState('APPLYING','writing durable root-locked transaction…');try{const tx=await api.agent.apply(id);activeWorkspace=tx.workspace||activeWorkspace;rememberApplied(tx,identity);showSourceApplied(tx);setState('APPLIED',`${tx.touched.length} file(s) changed · durable Undo available`);refreshWorkspace();}catch(error){setState('ERROR',error.message);}finally{setBusy(false);await refreshStatus();}}
  async function undoLast(){if(busy)return;const identity=currentIdentity();const id=appliedBySource.get(identity);if(!id)return setState('READY','No applied transaction for this target');setBusy(true);setState('UNDO',driveSynced?'restoring exact BEFORE snapshot in mirror and Google Drive…':'restoring exact durable BEFORE snapshot…');try{const tx=await api.agent.undo(id);appliedBySource.delete(identity);transactionSourceById.delete(id);resetSourceActions();hideReview();setState('UNDONE',`${tx.touched.length} file(s) restored to exact BEFORE state`);refreshWorkspace();}catch(error){setState('ERROR',error.message);}finally{setBusy(false);await refreshStatus();}}
  async function commitGitHub(){const id=currentAppliedId();if(!id||busy)return;const message=el('agentCommitMessage').value.trim();if(!message)return setState('APPLIED','Enter a commit message; no Git action performed');setBusy(true);setState('COMMITTING','explicit commit on managed rwacode/* branch…');try{const result=await api.agent.githubAction(id,'commit',{message});gitCommitted=true;el('agentCommitButton').disabled=true;el('agentPushButton').disabled=false;el('agentDiff').textContent=result.gitDiff||'(clean Git worktree after commit)';el('agentTouched').textContent=`commit local only · ahead ${result.ahead||0}`;setState('COMMITTED',`${result.branch} committed locally; Push remains explicit`);}catch(error){setState('ERROR',error.message);}finally{setBusy(false);syncUndoButton();}}
  async function pushGitHub(){const id=currentAppliedId();if(!id||!gitCommitted||busy)return;setBusy(true);setState('PUSHING','explicit push of managed rwacode/* branch…');try{const result=await api.agent.githubAction(id,'push',{});gitPushed=true;el('agentPushButton').disabled=true;el('agentPrButton').disabled=false;setState('PUSHED',`${result.branch} pushed; base branch unchanged; PR remains explicit`);}catch(error){setState('ERROR',error.message);}finally{setBusy(false);}}
  async function openGitHubPr(){const id=currentAppliedId();if(!id||!gitPushed||busy)return;const title=el('agentPrTitle').value.trim();if(!title)return setState('PUSHED','Enter a pull request title; no PR created');setBusy(true);setState('OPENING_PR','opening explicit GitHub pull request…');try{const result=await api.agent.githubAction(id,'pr',{title,body:`Created explicitly from RWACode managed workspace.\n\nTask: ${el('agentTaskInput').value.trim()}`});el('agentPrButton').disabled=true;setState('PR_OPENED',result.pullRequestUrl||'pull request created');}catch(error){setState('ERROR',error.message);}finally{setBusy(false);}}
  async function syncGoogleDrive(){const id=currentAppliedId();if(!id||driveSynced||busy)return;setBusy(true);setState('SYNCING','checking Drive version and syncing explicit transaction…');try{const result=await api.agent.driveAction(id,'sync',{});driveSynced=true;el('agentDriveSyncButton').disabled=true;el('agentDriveHint').textContent='synced · Undo restores Drive BEFORE if unchanged externally';el('agentTouched').textContent=`${result.touched?.length||0} file(s) · synced to Drive`;setState('SYNCED','Google Drive sync complete; exact Undo remains available');}catch(error){setState('ERROR',error.message);}finally{setBusy(false);}}

  async function sourceChanged(){const type=el('agentWorkspaceTag').value;const remote=type==='github'||type==='googledrive';el('agentSourceLocator').classList.toggle('hidden',!remote);el('agentSourceLocator').placeholder=type==='github'?'owner/repository#branch':type==='googledrive'?'Drive file/folder path':'';activeWorkspace=selectedSource();hideReview();resetSourceActions();if(type==='github'){setState('READY','GitHub target selected; enter owner/repository#branch');el('agentScope').textContent='managed GitHub worktree · not mounted';}else if(type==='googledrive'){setState('READY','Google Drive target selected; enter a Drive for desktop path');el('agentScope').textContent='managed Google Drive mirror · not mounted';}else{setState('READY','local-safe');el('agentScope').textContent='root locked · local';}syncUndoButton();notifySourceChanged();await refreshStatus();}
  el('agentWorkspaceTag').onchange=sourceChanged;
  el('agentSourceLocator').addEventListener('blur',()=>{notifySourceChanged();refreshStatus();});
  el('agentSourceLocator').addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();notifySourceChanged();refreshStatus();}});
  el('agentRunButton').onclick=runTask;el('agentApplyButton').onclick=applyPrepared;el('agentUndoButton').onclick=undoLast;el('agentCommitButton').onclick=commitGitHub;el('agentPushButton').onclick=pushGitHub;el('agentPrButton').onclick=openGitHubPr;el('agentDriveSyncButton').onclick=syncGoogleDrive;el('agentCancelButton').onclick=()=>{hideReview();resetSourceActions();setState('READY','prepared ChangeSet discarded; no files changed');};
  el('agentTaskInput').addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();runTask();}});
  api.agent.onChanged((tx)=>{if(!tx?.id)return;let identity=transactionSourceById.get(tx.id);if(!identity&&tx.workspace?.type==='local')identity='local::';if(!identity&&tx.workspace?.type===selectedSource().type)identity=currentIdentity();if(!identity)return;transactionSourceById.set(tx.id,identity);if(tx.status==='APPLIED')appliedBySource.set(identity,tx.id);if((tx.status==='UNDONE'||tx.status==='RECOVERED_ROLLBACK')&&appliedBySource.get(identity)===tx.id)appliedBySource.delete(identity);syncUndoButton();});

  refreshStatus().finally(()=>{syncUndoButton();resizeViews();notifySourceChanged();});
})();
