'use strict';

(() => {
  const api=window.rwacode;
  const tree=document.getElementById('fileTree');
  const legacyMenu=document.getElementById('fileActions');
  if(!api?.explorer?.showContextMenu||!tree||!legacyMenu)return;

  legacyMenu.classList.add('hidden');legacyMenu.setAttribute('aria-hidden','true');
  function setStatus(message){const node=document.getElementById('statusMessage');if(node)node.textContent=message;}
  function selectedTarget(){
    const type=String(document.getElementById('agentWorkspaceTag')?.value||'local').toLowerCase();
    if(type==='local')return{type:'local'};
    return{type,locator:String(document.getElementById('agentSourceLocator')?.value||'').trim()};
  }
  function targetIdentity(target){return`${target.type}::${target.locator||''}`;}
  function selectRow(row){for(const candidate of tree.querySelectorAll('.file-row.selected'))candidate.classList.remove('selected');row.classList.add('selected');try{if(typeof state!=='undefined')state.selectedPath=row.dataset.path||null;}catch{}}
  function proxyAction(action,row){if(!action||!row?.isConnected)return;selectRow(row);const source=legacyMenu.querySelector(`[data-real-action="${action}"]`);if(!source){setStatus(`Explorer action unavailable: ${action}`);return;}source.disabled=false;source.click();}

  tree.addEventListener('click',(event)=>{
    if(event.button!==0||event.target.closest('.file-row-more'))return;
    const row=event.target.closest('.file-row[data-path]');if(!row)return;
    event.preventDefault();event.stopImmediatePropagation();selectRow(row);
    if(row.dataset.type==='directory'){try{if(typeof loadDirectory==='function')loadDirectory(row.dataset.path).catch((error)=>setStatus(`Files: ${error.message}`));}catch(error){setStatus(`Files: ${error?.message||String(error)}`);}}
  },true);

  tree.addEventListener('dblclick',(event)=>{
    const row=event.target.closest('.file-row[data-path][data-type="file"]');if(!row)return;
    event.preventDefault();event.stopImmediatePropagation();selectRow(row);
    try{if(typeof openEditor==='function')openEditor(row.dataset.path).catch((error)=>setStatus(`Open file: ${error.message}`));}catch(error){setStatus(`Open file: ${error?.message||String(error)}`);}
  },true);

  tree.addEventListener('contextmenu',(event)=>{
    const row=event.target.closest('.file-row[data-path]');event.preventDefault();event.stopImmediatePropagation();if(!row)return;selectRow(row);
    const target=selectedTarget();
    if(target.type!=='local'){setStatus(`@${target.type==='github'?'GitHub':'GoogleDrive'} Explorer is read-only; edit through Workspace Agent Review → Apply.`);return;}
    api.explorer.showContextMenu(row.dataset.path||'').then((result)=>{if(result?.action)proxyAction(result.action,row);}).catch((error)=>setStatus(`Explorer menu: ${error?.message||String(error)}`));
  },true);

  if(api?.files&&api?.agent?.browse&&api?.agent?.readTarget){
    const localList=api.files.list.bind(api.files);const localRead=api.files.read.bind(api.files);let lastTargetIdentity='local::';
    api.files.list=async(relativePath='.')=>{
      const target=selectedTarget();const identity=targetIdentity(target);const requestedPath=identity===lastTargetIdentity?(relativePath||'.'):'.';lastTargetIdentity=identity;
      if(target.type==='local')return localList(requestedPath);
      if(!target.locator)throw new Error(`Configure @${target.type==='github'?'GitHub':'GoogleDrive'} target first`);
      return api.agent.browse(target,requestedPath);
    };
    api.files.read=async(relativePath)=>{const target=selectedTarget();if(target.type==='local')return localRead(relativePath);if(!target.locator)throw new Error(`Configure @${target.type==='github'?'GitHub':'GoogleDrive'} target first`);return api.agent.readTarget(target,relativePath);};

    function notifySourceChanged(){lastTargetIdentity='';window.dispatchEvent(new CustomEvent('rwacode:agent-source-changed',{detail:selectedTarget()}));}
    document.addEventListener('change',(event)=>{if(event.target?.id==='agentWorkspaceTag')setTimeout(notifySourceChanged,0);});
    document.addEventListener('keydown',(event)=>{if(event.target?.id==='agentSourceLocator'&&event.key==='Enter')setTimeout(notifySourceChanged,0);});
    document.addEventListener('blur',(event)=>{if(event.target?.id==='agentSourceLocator')setTimeout(notifySourceChanged,0);},true);
    window.addEventListener('rwacode:agent-source-notify',notifySourceChanged);
  }
})();
