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
    .rw-agent-source,.rw-agent-locator,.rw-agent-input,.rw-agent-button,.rw-agent-small-input{height:34px;border:1px solid #2a394b;border-radius:8px;background:#0e1824;color:#cfd9e5;padding:0 10px}
    .rw-agent-source{border-color:rgba(85,216,146,.28);background:rgba(18,58,45,.46);color:#a9efca;font-weight:700}
    .rw-agent-locator{width:210px;background:#070e16}.rw-agent-locator.hidden{display:none}.rw-agent-input{min-width:220px;flex:1;background:#070e16;color:#e7eef7;outline:none}
    .rw-agent-input:focus,.rw-agent-locator:focus,.rw-agent-small-input:focus,.rw-agent-manual-input:focus{border-color:#4775a4;box-shadow:0 0 0 2px rgba(77,143,255,.08)}
    .rw-agent-small-input{height:30px;min-width:150px;flex:1;background:#070e16;color:#e7eef7;outline:none;font-size:11px}
    .rw-agent-button.primary{border-color:#3567a0;background:#10213a;color:#edf5ff;font-weight:700}.rw-agent-button:disabled{opacity:.42;cursor:default}
    .rw-agent-meta{display:flex;align-items:center;gap:8px;min-width:0;color:#8393a7;font-size:10px;flex-wrap:wrap}.rw-agent-meta b{color:#cfd9e5;font-weight:600}.rw-agent-meta .grow{flex:1}
    .rw-agent-manual{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:stretch}.rw-agent-manual.hidden{display:none!important}
    .rw-agent-manual-input{min-height:104px;max-height:220px;resize:vertical;border:1px solid #2a394b;border-radius:8px;background:#060b11;color:#d6e1ee;padding:9px 10px;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;outline:none}
    .rw-agent-manual-actions{display:flex;flex-direction:column;gap:7px;min-width:132px}.rw-agent-manual-hint{font-size:9px;line-height:1.35;color:#8393a7;max-width:190px}
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
      <input id="agentTaskInput" class="rw-agent-input" autocomplete="off" spellcheck="false" placeholder="Deterministic local task, e.g. VALUE menjadi 20" />
      <button id="agentRunButton" class="rw-agent-button primary">Run Local</button>
      <button id="agentManualToggleButton" class="rw-agent-button">Paste ChangeSet</button>
      <button id="agentUndoButton" class="rw-agent-button" disabled>Undo</button>
    </div>
    <div class="rw-agent-meta"><b id="agentState">READY</b><span id="agentStatus">NO_AI_API · native provider pages are manual</span><span class="grow"></span><span id="agentScope">root locked · local</span></div>
    <div id="agentManualPanel" class="rw-agent-manual hidden">
      <textarea id="agentManualInput" class="rw-agent-manual-input" spellcheck="false" aria-label="Manual ChangeSet JSON" placeholder='Paste ChangeSet JSON copied manually from the provider page. Example: {"version":1,"summary":"...","operations":[...]}'></textarea>
      <div class="rw-agent-manual-actions"><button id="agentReviewChangeSetButton" class="rw-agent-button primary">Review ChangeSet</button><button id="agentManualClearButton" class="rw-agent-button">Clear</button><span class="rw-agent-manual-hint">Explicit user handoff only. RWACode never reads, scrapes, injects, clicks, or sends inside provider pages.</span></div>
    </div>
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
  function setBusy(value){busy=Boolean(value);for(const id of ['agentRunButton','agentManualToggleButton','agentReviewChangeSetButton','agentTaskInput','agentWorkspaceTag','agentSourceLocator','agentManualInput'])if(el(id))el(id).disabled=busy;el('agentApplyButton').disabled=busy||!preparedId;el('agentCommitButton').disabled=busy||gitCommitted;el('agentPushButton').disabled=busy||!gitCommitted||gitPushed;el('agentPrButton').disabled=busy||!gitPushed;el('agentDriveSyncButton').disabled=busy||driveSynced||!currentAppliedId();syncUndoButton();}
  function setState(label,message){el('agentState').textContent=label;el('agentStatus').textContent=message;shellStatus(`Workspace Agent · ${message}`);}
  function resetSourceActions(){gitCommitted=false;gitPushed=false;driveSynced=false;el('agentGitActions').classList.add('hidden');el('agentDriveActions').classList.add('hidden');el('agentCommitButton').disabled=false;el('agentPushButton').disabled=true;el('agentPrButton').disabled=true;el('agentDriveSyncButton').disabled=true;el('agentCommitMessage').value='';el('agentPrTitle').value='';el('agentDriveHint').textContent='mirror only until Sync to Drive';}
  function refreshWorkspace(){notifySourceChanged();api.preview.reload().catch(()=>{});resizeViews();}
  function hideReview(){preparedId=null;preparedIdentity=null;el('agentReview').classList.add('hidden');el('agentDiff').textContent='';el('agentApplyButton').disabled=true;resizeViews();}
  function sourceScope(tx){if(tx?.workspace?.type==='github'){const s=tx.sourceState||{};return`root locked · GitHub ${s.repository||tx.workspace?.source?.repository||''} · ${s.branch||''}`.trim();}if(tx?.workspace?.type==='googledrive'){const s=tx.sourceState||{};return`root locked · Google Drive mirror · ${s.sourcePath||tx.workspace?.source?.sourcePath||''}`.trim();}return'root locked · local';}
  function showReview(tx,identity){preparedId=tx.id;preparedIdentity=identity;activeWorkspace=tx.workspace||activeWorkspace;transactionSourceById.set(tx.id,identity);el('agentSummary').textContent=tx.changeSet?.summary||'ChangeSet';el('agentTouched').textContent=`${tx.touched?.length||0} file(s) · ${tx.runner||'agent'}`;el('agentDiff').textContent=tx.diff||'(no textual diff)';el('agentScope').textContent=sourceScope(tx);el('agentReview').classList.remove('hidden');el('agentCancelButton').style.display='';el('agentApplyButton').style.display='';el('agentApplyButton').disabled=false;resizeViews();}
  function rememberApplied(tx,identity){if(!tx?.id)return;transactionSourceById.set(tx.id,identity);appliedBySource.set(identity,tx.id);syncUndoButton();}
  function showSourceApplied(tx){preparedId=null;preparedIdentity=null;el('agentCancelButton').style.display='none';el('agentApplyButton').style.display='none';if(tx?.workspace?.type==='github'){el('agentSummary').textContent=`Git diff · ${tx.sourceState?.branch||'managed branch'}`;el('agentTouched').textContent=`${tx.touched?.length||0} file(s) · no commit/push performed`;el('agentDiff').textContent=tx.sourceState?.gitDiff||tx.diff||'(clean Git worktree)';el('agentReview').classList.remove('hidden');el('agentScope').textContent=sourceScope(tx);el('agentGitActions').classList.toggle('hidden',tx.status!=='APPLIED');el('agentDriveActions').classList.add('hidden');gitCommitted=false;gitPushed=false;return resizeViews();}if(tx?.workspace?.type==='googledrive'){el('agentSummary').textContent=`Drive mirror diff · ${tx.sourceState?.sourcePath||'managed mirror'}`;el('agentTouched').textContent=`${tx.touched?.length||0} file(s) · ${driveSynced?'synced to Drive':'not synced to Drive'}`;el('agentDiff').textContent=tx.diff||'(no textual diff)';el('agentReview').classList.remove('hidden');el('agentScope').textContent=sourceScope(tx);el('agentGitActions').classList.add('hidden');el('agentDriveActions').classList.toggle('hidden',tx.status!=='APPLIED');el('agentDriveSyncButton').disabled=tx.status!=='APPLIED'||driveSynced;return resizeViews();}hideReview();}
  function runnerLabel(status){const names=['NO_AI_API'];if(status?.runners?.localLiteral?.available)names.push('local-safe');if(status?.runners?.manualChangeSet?.available)names.push('manual ChangeSet review');if(status?.sources?.github?.git?.available)names.push('GitHub worktree');if(status?.sources?.googledrive?.available)names.push('Google Drive Desktop');return names.join(' · ');}
  async function refreshStatus(){const source=selectedSource();try{if((source.type==='github'||source.type==='googledrive')&&!source.locator){const base=await api.agent.status({type:'local'});el('agentStatus').textContent=runnerLabel(base);syncUndoButton();return;}const status=await api.agent.status(source);el('agentStatus').textContent=runnerLabel(status);if(status?.transaction?.undoAvailable&&status.transaction.lastTransaction?.id){const id=status.transaction.lastTransaction.id;const identity=sourceIdentity(source);transactionSourceById.set(id,identity);appliedBySource.set(identity,id);}el('agentScope').textContent=sourceScope({workspace:status.workspace,sourceState:status.sourceState});syncUndoButton();}catch(error){setState('ERROR',error.message);syncUndoButton();}}
  function validateTarget(source){if(source.type==='github'&&!source.locator){setState('READY','Enter owner/repository#branch for @GitHub');return false;}if(source.type==='googledrive'&&!source.locator){setState('READY','Enter a mounted Google Drive file/folder path');return false;}return true;}
  async function runTask(){const task=el('agentTaskInput').value.trim();const source=selectedSource();const identity=sourceIdentity(source);if(busy)return;if(!task)return setState('READY','Enter a deterministic local task before Run Local');if(!validateTarget(source))return;hideReview();resetSourceActions();setBusy(true);setState('PLANNING','running deterministic local transform only · NO_AI_API');try{const tx=await api.agent.plan(task,{source});activeWorkspace=tx.workspace||source;if(tx.status==='NO_CHANGE'){hideReview();setState('NO_CHANGE',tx.changeSet?.summary||'No safe change required');return;}transactionSourceById.set(tx.id,identity);showReview(tx,identity);setState('REVIEW',`${tx.runner} prepared ${tx.touched.length} file(s); review diff then Apply`);}catch(error){setState(error.message?.startsWith('NO_AI_API:')?'NO_AI_API':'ERROR',error.message);}finally{setBusy(false);await refreshStatus();}}
  async function prepareManualChangeSet(){const input=el('agentManualInput').value.trim();const source=selectedSource();const identity=sourceIdentity(source);if(busy)return;if(!input)return setState('READY','Paste a ChangeSet JSON before Review ChangeSet');if(!validateTarget(source))return;hideReview();resetSourceActions();setBusy(true);setState('VALIDATING','validating user-supplied ChangeSet under root lock…');try{const tx=await api.agent.prepareChangeSet(input,{source,task:'Manual ChangeSet pasted by user'});activeWorkspace=tx.workspace||source;transactionSourceById.set(tx.id,identity);showReview(tx,identity);setState('REVIEW',`manual ChangeSet validated · ${tx.touched.length} file(s); review diff then Apply`);}catch(error){setState('ERROR',error.message);}finally{setBusy(false);await refreshStatus();}}
  async function applyPrepared(){if(!preparedId||busy)return;if(preparedIdentity!==currentIdentity()){hideReview();return setState('READY','Target changed; discarded stale prepared ChangeSet');}const id=preparedId;const identity=preparedIdentity;setBusy(true);setState('APPLYING','writing durable root-locked transaction…');try{const tx=await api.agent.apply(id);activeWorkspace=tx.workspace||activeWorkspace;rememberApplied(tx,identity);showSourceApplied(tx);setState('APPLIED',`${tx.touched.length} file(s) changed · durable Undo available`);refreshWorkspace();}catch(error){setState('ERROR',error.message);}finally{setBusy(false);await refreshStatus();}}
  async function undoLast(){if(busy)return;const identity=currentIdentity();const id=appliedBySource.get(identity);if(!id)return setState('READY','No applied transaction for this target');setBusy(true);setState('UNDO',driveSynced?'restoring exact BEFORE snapshot in mirror and Google Drive…':'restoring exact durable BEFORE snapshot…');try{const tx=await api.agent.undo(id);appliedBySource.delete(identity);transactionSourceById.delete(id);resetSourceActions();hideReview();setState('UNDONE',`${tx.touched.length} file(s) restored to exact BEFORE state`);refreshWorkspace();}catch(error){setState('ERROR',error.message);}finally{setBusy(false);await refreshStatus();}}
  async function commitGitHub(){const id=currentAppliedId();if(!id||busy)return;const message=el('agentCommitMessage').value.trim();if(!message)return setState('APPLIED','Enter a commit message; no Git action performed');setBusy(true);setState('COMMITTING','explicit commit on managed rwacode/* branch…');try{const result=await api.agent.githubAction(id,'commit',{message});gitCommitted=true;setState('COMMITTED',result?.commit?`commit ${String(result.commit).slice(0,12)} created · Push remains explicit`:'commit created · Push remains explicit');}catch(error){setState('ERROR',error.message);}finally{setBusy(false);}}
  async function pushGitHub(){const id=currentAppliedId();if(!id||busy||!gitCommitted)return;setBusy(true);setState('PUSHING','explicit GitHub push…');try{await api.agent.githubAction(id,'push',{});gitPushed=true;setState('PUSHED','branch pushed · Open PR remains explicit');}catch(error){setState('ERROR',error.message);}finally{setBusy(false);}}
  async function openGitHubPr(){const id=currentAppliedId();if(!id||busy||!gitPushed)return;const title=el('agentPrTitle').value.trim();if(!title)return setState('PUSHED','Enter a pull request title; no PR action performed');setBusy(true);setState('OPENING_PR','explicit pull request creation…');try{const result=await api.agent.githubAction(id,'pr',{title,body:'Created explicitly from RWACode after reviewed Apply.'});setState('PR_OPEN',result?.url||'pull request opened');}catch(error){setState('ERROR',error.message);}finally{setBusy(false);}}
  async function syncGoogleDrive(){const id=currentAppliedId();if(!id||busy)return;setBusy(true);setState('SYNCING','explicit Sync to Drive with conflict checks…');try{await api.agent.driveAction(id,'sync',{});driveSynced=true;el('agentDriveHint').textContent='synced explicitly to Drive';setState('SYNCED','Google Drive sync complete');}catch(error){setState('ERROR',error.message);}finally{setBusy(false);}}
  function updateSourceUi(){const source=selectedSource();const locator=el('agentSourceLocator');locator.classList.toggle('hidden',source.type==='local');locator.placeholder=source.type==='github'?'owner/repository#branch':source.type==='googledrive'?'/Google Drive/path':'workspace';hideReview();resetSourceActions();notifySourceChanged();refreshStatus();resizeViews();}

  el('agentRunButton').onclick=runTask;
  el('agentTaskInput').addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();runTask();}});
  el('agentManualToggleButton').onclick=()=>{el('agentManualPanel').classList.toggle('hidden');resizeViews();};
  el('agentReviewChangeSetButton').onclick=prepareManualChangeSet;
  el('agentManualClearButton').onclick=()=>{el('agentManualInput').value='';setState('READY','Manual ChangeSet cleared');};
  el('agentApplyButton').onclick=applyPrepared;
  el('agentCancelButton').onclick=()=>{hideReview();setState('READY','Prepared ChangeSet discarded; no file changed');};
  el('agentUndoButton').onclick=undoLast;
  el('agentCommitButton').onclick=commitGitHub;
  el('agentPushButton').onclick=pushGitHub;
  el('agentPrButton').onclick=openGitHubPr;
  el('agentDriveSyncButton').onclick=syncGoogleDrive;
  el('agentWorkspaceTag').onchange=updateSourceUi;
  el('agentSourceLocator').addEventListener('change',updateSourceUi);
  api.agent.onChanged(()=>refreshStatus());
  refreshStatus();
})();
