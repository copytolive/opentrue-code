'use strict';

(() => {
  const api=window.rwacode;
  const button=document.getElementById('browserMenuButton');
  const address=document.getElementById('addressInput');
  if(!api||!button||!address)return;

  let activeTabId=null;
  let currentTabs=[];
  let dialogResolver=null;
  api.browser.onTabs((payload)=>{activeTabId=payload.activeTabId;currentTabs=Array.isArray(payload.tabs)?payload.tabs:[];});

  const style=document.createElement('style');
  style.textContent=`
    .rw-browser-menu{position:fixed;z-index:9999;width:230px;padding:8px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#0d1118;box-shadow:0 24px 70px rgba(0,0,0,.6);display:none}
    .rw-browser-menu.open{display:block}.rw-browser-menu button{display:flex;width:100%;height:34px;align-items:center;gap:8px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:#d9e1ec;text-align:left}.rw-browser-menu button:hover{background:rgba(255,255,255,.055)}.rw-browser-menu .sep{height:1px;margin:5px 3px;background:rgba(255,255,255,.08)}.rw-browser-menu small{margin-left:auto;color:#6f7b8e}
    .rw-dialog-backdrop{position:fixed;inset:0;z-index:30000;display:grid;place-items:center;background:rgba(2,5,9,.72);backdrop-filter:blur(8px)}.rw-dialog-backdrop.hidden{display:none}.rw-dialog{width:min(520px,calc(100vw - 48px));border:1px solid rgba(103,232,255,.2);border-radius:16px;background:#0b1017;box-shadow:0 30px 100px rgba(0,0,0,.72);overflow:hidden;color:#e6eef8}.rw-dialog-head{padding:16px 18px 8px;font-size:13px;font-weight:800}.rw-dialog-message{padding:0 18px 12px;color:#8f9bad;font-size:11px;line-height:1.5;white-space:pre-wrap}.rw-dialog-input{box-sizing:border-box;width:calc(100% - 36px);margin:0 18px 14px;min-height:38px;border:1px solid rgba(255,255,255,.12);border-radius:10px;outline:0;background:#070b10;color:#e9f3ff;padding:10px 12px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}.rw-dialog-input:focus{border-color:rgba(103,232,255,.48);box-shadow:0 0 0 2px rgba(103,232,255,.08)}.rw-dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px;border-top:1px solid rgba(255,255,255,.06)}.rw-dialog-actions button{height:34px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#121925;color:#dce7f4;padding:0 14px}.rw-dialog-actions .primary{border-color:rgba(103,232,255,.28);background:rgba(103,232,255,.11);color:#e9fbff;font-weight:700}.rw-dialog-actions .danger{border-color:rgba(255,106,122,.28);background:rgba(255,106,122,.09);color:#ffd9de}
  `;
  document.head.appendChild(style);

  const menu=document.createElement('div');menu.className='rw-browser-menu';menu.innerHTML=`<button data-action="new">＋ New Tab <small>⌘T</small></button><button data-action="duplicate">◫ Duplicate Tab</button><button data-action="reload">↻ Reload</button><button data-action="external">↗ Open Externally</button><div class="sep"></div><button data-action="close">× Close Tab <small>⌘W</small></button><button data-action="clear">⌫ Clear Profile Site Data</button>`;document.body.appendChild(menu);

  const dialog=document.createElement('div');dialog.id='rwacodeDialog';dialog.className='rw-dialog-backdrop hidden';dialog.innerHTML=`<section class="rw-dialog" role="dialog" aria-modal="true" aria-labelledby="rwDialogTitle"><div id="rwDialogTitle" class="rw-dialog-head">RWACode</div><div id="rwDialogMessage" class="rw-dialog-message"></div><input id="rwDialogInput" class="rw-dialog-input" autocomplete="off" spellcheck="false" /><div class="rw-dialog-actions"><button id="rwDialogCancel">Cancel</button><button id="rwDialogConfirm" class="primary">Continue</button></div></section>`;document.body.appendChild(dialog);
  const titleNode=dialog.querySelector('#rwDialogTitle');const messageNode=dialog.querySelector('#rwDialogMessage');const inputNode=dialog.querySelector('#rwDialogInput');const cancelNode=dialog.querySelector('#rwDialogCancel');const confirmNode=dialog.querySelector('#rwDialogConfirm');

  function status(message){const node=document.getElementById('statusMessage');if(node)node.textContent=message;}
  function runtimeState(){try{return state;}catch{return null;}}
  function browserShouldBeVisible(){const editorHidden=document.getElementById('editorPanel')?.classList.contains('hidden')!==false;return editorHidden&&address.value!=='rwacode://newtab';}
  async function setBrowserVisible(visible){try{await api.browser.setVisible(visible);}catch{}}
  function finishDialog(value){if(!dialogResolver)return;const resolve=dialogResolver;dialogResolver=null;dialog.classList.add('hidden');inputNode.value='';resolve(value);}
  async function openDialog({title,message='',value='',input=true,confirmLabel='Continue',danger=false}){
    if(dialogResolver)finishDialog(null);const restoreBrowser=browserShouldBeVisible();await setBrowserVisible(false);titleNode.textContent=title;messageNode.textContent=message;inputNode.classList.toggle('hidden',!input);inputNode.value=value;confirmNode.textContent=confirmLabel;confirmNode.classList.toggle('danger',danger);confirmNode.classList.toggle('primary',!danger);dialog.classList.remove('hidden');
    const result=await new Promise((resolve)=>{dialogResolver=resolve;queueMicrotask(()=>(input?inputNode:confirmNode).focus());});if(restoreBrowser&&browserShouldBeVisible())await setBrowserVisible(true);return result;
  }
  function uiPrompt(title,value='',message=''){return openDialog({title,message,value,input:true,confirmLabel:'Continue'});}
  function uiConfirm(title,message='',confirmLabel='Confirm',danger=false){return openDialog({title,message,input:false,confirmLabel,danger}).then((value)=>value===true);}
  window.rwacodeDialogs={prompt:uiPrompt,confirm:uiConfirm};
  cancelNode.onclick=()=>finishDialog(null);confirmNode.onclick=()=>finishDialog(inputNode.classList.contains('hidden')?true:inputNode.value);dialog.onclick=(event)=>{if(event.target===dialog)finishDialog(null);};dialog.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();finishDialog(null);}else if(event.key==='Enter'&&!inputNode.classList.contains('hidden')){event.preventDefault();finishDialog(inputNode.value);}});

  try{
    const originalCloseEditor=closeEditor;
    closeEditor=async function patchedCloseEditor(confirmDirty=false){const s=runtimeState();if(!s?.editorPath)return true;if(confirmDirty&&s.editorDirty){const discard=await uiConfirm('Discard unsaved changes?',`The local file ${s.editorPath} has unsaved changes.`,'Discard',true);if(!discard)return false;}return originalCloseEditor(false);};
  }catch{}

  try{
    fileAction=async function patchedFileAction(action){const s=runtimeState();try{
      if(String(document.getElementById('agentWorkspaceTag')?.value||'local')!=='local'){status('Remote target Explorer is read-only; use Workspace Agent ChangeSet.');document.getElementById('fileActions')?.classList.add('hidden');return;}
      if(action==='new-file'||action==='new-folder'){const name=await uiPrompt(action==='new-file'?'New file name':'New folder name');if(!name?.trim())return;await api.files.create(s?.currentDir||'.',name.trim(),action==='new-folder'?'directory':'file');if(typeof loadDirectory==='function')await loadDirectory();document.getElementById('fileActions')?.classList.add('hidden');return;}
      if(!s?.selectedPath){status('Select a file or folder first');return;}
      if(action==='reveal')await api.files.reveal(s.selectedPath);
      else if(action==='rename'){const currentName=s.selectedPath.split('/').at(-1);const name=await uiPrompt('Rename local item',currentName,s.selectedPath);if(!name?.trim()||name.trim()===currentName)return;await api.files.rename(s.selectedPath,name.trim());s.selectedPath=null;if(typeof loadDirectory==='function')await loadDirectory();}
      else if(action==='delete'){const confirmed=await api.files.confirmDelete(s.selectedPath);if(!confirmed)return;if(s.editorPath===s.selectedPath&&typeof closeEditor==='function')await closeEditor(false);await api.files.delete(s.selectedPath);s.selectedPath=null;if(typeof loadDirectory==='function')await loadDirectory();}
      document.getElementById('fileActions')?.classList.add('hidden');
    }catch(error){status(`${action}: ${error.message}`);}};
  }catch{}

  const addProfile=document.getElementById('addProfileButton');if(addProfile)addProfile.onclick=async()=>{if(typeof closeEditor==='function'&&!(await closeEditor(true)))return;const name=await uiPrompt('New browser profile name');if(!name?.trim())return;const result=await api.profiles.add(name.trim());const s=runtimeState();if(s){s.profiles=result.profiles;s.activeProfileId=result.activeProfileId;}if(typeof renderProfiles==='function')renderProfiles();};
  const renameProfile=document.getElementById('renameProfileButton');if(renameProfile)renameProfile.onclick=async()=>{const profile=typeof activeProfile==='function'?activeProfile():null;if(!profile)return;const name=await uiPrompt('Rename browser profile',profile.name);if(!name?.trim())return;const result=await api.profiles.rename(profile.id,name.trim());const s=runtimeState();if(s)s.profiles=result.profiles;if(typeof renderProfiles==='function')renderProfiles();};
  const clearProfile=document.getElementById('clearProfileButton');if(clearProfile)clearProfile.onclick=async()=>{if(typeof closeEditor==='function'&&!(await closeEditor(true)))return;const profile=typeof activeProfile==='function'?activeProfile():null;if(!profile)return;const confirmed=await uiConfirm('Clear profile site data?',`Clear cookies and site data for ${profile.name}? Other profiles are unaffected.`,'Clear',true);if(!confirmed)return;await api.profiles.clear(profile.id);status(`Cleared ${profile.name} site data`);};
  const deleteProfile=document.getElementById('deleteProfileButton');if(deleteProfile)deleteProfile.onclick=async()=>{if(typeof closeEditor==='function'&&!(await closeEditor(true)))return;const profile=typeof activeProfile==='function'?activeProfile():null;if(!profile)return;const confirmed=await uiConfirm('Delete browser profile?',`Delete ${profile.name} and its isolated site data?`,'Delete',true);if(!confirmed)return;const result=await api.profiles.delete(profile.id);const s=runtimeState();if(s){s.profiles=result.profiles;s.activeProfileId=result.activeProfileId;}if(typeof renderProfiles==='function')renderProfiles();};

  function closeMenu(){menu.classList.remove('open');}
  button.onclick=(event)=>{event.stopPropagation();const rect=button.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(window.innerWidth-238,rect.right-230))}px`;menu.style.top=`${Math.min(window.innerHeight-230,rect.bottom+6)}px`;menu.classList.toggle('open');};
  document.addEventListener('click',(event)=>{if(!menu.contains(event.target)&&event.target!==button)closeMenu();});
  menu.onclick=async(event)=>{const action=event.target.closest('button[data-action]')?.dataset.action;if(!action)return;closeMenu();try{
    if(action==='new')await api.browser.newTab('rwacode://newtab');
    else if(action==='duplicate'){const tab=currentTabs.find((item)=>item.id===activeTabId);await api.browser.newTab(tab?.url&&tab.url!=='rwacode://newtab'?tab.url:'rwacode://newtab');}
    else if(action==='reload')await api.browser.reload();
    else if(action==='external')await api.browser.openExternal(address.value);
    else if(action==='close'&&activeTabId)await api.browser.closeTab(activeTabId);
    else if(action==='clear'){const profile=typeof activeProfile==='function'?activeProfile():null;if(!profile)return;const confirmed=await uiConfirm('Clear profile site data?',`Clear cookies and site data for ${profile.name}?`,'Clear',true);if(confirmed)await api.profiles.clear(profile.id);}
  }catch(error){status(`Browser menu: ${error.message}`);}};
})();
