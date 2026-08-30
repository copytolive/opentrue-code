const $=id=>document.getElementById(id);
let settings=null,activeFile='',allFiles=[];

const defaults={
  ollama:{model:'qwen3-coder:30b',endpoint:'http://127.0.0.1:11434'},
  openai:{model:'gpt-5.6-sol',endpoint:'https://api.openai.com/v1'},
  anthropic:{model:'claude-sonnet-5',endpoint:'https://api.anthropic.com/v1'},
  gemini:{model:'gemini-3.7-flash',endpoint:'https://generativelanguage.googleapis.com/v1beta'},
  'openai-compatible':{model:'local-model',endpoint:'http://127.0.0.1:1234/v1'},
  lmstudio:{model:'local-model',endpoint:'http://127.0.0.1:1234/v1'}
};

function status(id,text,kind=''){
  const el=$(id);el.textContent=text;el.className=`badge ${kind}`.trim();
}
function msg(role,text){
  const el=document.createElement('div');el.className=`msg ${role}`;el.textContent=text;
  $('conversation').appendChild(el);$('conversation').scrollTop=$('conversation').scrollHeight;
}
function pretty(value){
  if(typeof value==='string')return value;
  return JSON.stringify(value,null,2);
}
function workspace(){
  const p=String(settings?.workspace||'').trim();
  if(!p)throw Error('Choose a Git repository first');
  return p;
}
async function saveSettings(){
  const payload={
    provider:$('provider').value,
    model:$('model').value.trim(),
    endpoint:$('endpoint').value.trim(),
    workspace:settings?.workspace||'',
    controlPlaneUrl:$('controlPlaneUrl').value.trim()
  };
  if($('apiKey').value)payload.apiKey=$('apiKey').value;
  if($('controlPlaneToken').value)payload.controlPlaneToken=$('controlPlaneToken').value;
  settings=await window.opentrue.saveSettings(payload);
  $('apiKey').value='';$('controlPlaneToken').value='';
  renderSettings();
  return settings;
}
function renderSettings(){
  $('version').textContent=`v${settings.version}`;
  $('provider').value=settings.provider;
  $('model').value=settings.model;
  $('endpoint').value=settings.endpoint;
  $('workspacePath').textContent=settings.workspace||'No workspace selected';
  $('controlPlaneUrl').value=settings.controlPlaneUrl||'';
  $('apiKey').placeholder=settings.hasApiKey?'Stored securely — leave blank to keep':'API key';
  $('controlPlaneToken').placeholder=settings.hasControlPlaneToken?'Stored securely — leave blank to keep':'Server token';
  $('secureNote').textContent=settings.secureStorage
    ? 'Secrets are encrypted with macOS Keychain / Windows DPAPI via Electron safeStorage.'
    : 'OS secure storage is unavailable. Secrets will not be persisted.';
  status('providerStatus',`${settings.provider} · ${settings.model}`,'good');
}
async function refreshFiles(){
  try{
    const root=workspace();
    const data=await window.opentrue.request(`/v1/files?workspace=${encodeURIComponent(root)}`);
    allFiles=data.files||[];renderFiles();
  }catch(e){msg('system',`Files: ${e.message}`)}
}
function renderFiles(){
  const q=$('fileFilter').value.trim().toLowerCase(),box=$('files');box.innerHTML='';
  for(const f of allFiles.filter(x=>!q||x.path.toLowerCase().includes(q)).slice(0,1500)){
    const b=document.createElement('button');b.textContent=f.path;b.title=f.path;
    if(f.path===activeFile)b.classList.add('active');
    b.onclick=()=>openFile(f.path);box.appendChild(b);
  }
}
async function openFile(path){
  try{
    const root=workspace();
    const data=await window.opentrue.request(`/v1/file?workspace=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`);
    activeFile=data.path;$('activeFile').textContent=activeFile;$('editor').value=data.content;$('writeApproval').checked=false;renderFiles();
  }catch(e){msg('system',`Open file: ${e.message}`)}
}
async function runTask(task){
  try{
    const root=workspace();$('taskOutput').textContent=`Running ${task}…`;
    const data=await window.opentrue.request('/v1/tasks','POST',{workspace:root,task});
    $('taskOutput').textContent=pretty(data);
  }catch(e){$('taskOutput').textContent=`ERROR: ${e.message}`}
}
async function sendPrompt(){
  const prompt=$('prompt').value.trim();if(!prompt)return;
  try{
    await saveSettings();
    const root=workspace(),mode=$('mode').value.toLowerCase(),approved=$('agentApproval').checked;
    msg('user',prompt);$('prompt').value='';$('send').disabled=true;
    msg('system',`${mode.toUpperCase()} running through ${settings.provider}/${settings.model}…`);
    const result=await window.opentrue.request('/v1/chat','POST',{workspace:root,mode,prompt,approved});
    msg('agent',result.summary||result.content||pretty(result));
    if(result.status==='WAITING_APPROVAL')msg('system','Agent prepared a write action but approval is off.');
    await refreshFiles();
  }catch(e){msg('system',`ERROR: ${e.message}`)}
  finally{$('send').disabled=false}
}
async function init(){
  settings=await window.opentrue.loadSettings();renderSettings();
  status('engineStatus','Engine local','good');
  if(settings.workspace)await refreshFiles();
  try{
    const r=await window.opentrue.request('/v1/remote/status');
    status('remoteStatus',r.status==='CONNECTED'?'Server connected':`Server ${String(r.status||'disconnected').toLowerCase()}`,r.status==='CONNECTED'?'good':'');
  }catch{}
}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  $(`panel-${b.dataset.panel}`).classList.add('active');
});
document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>runTask(b.dataset.task));
$('pickWorkspace').onclick=async()=>{
  const path=await window.opentrue.pickWorkspace();if(!path)return;
  settings=await window.opentrue.saveSettings({workspace:path});renderSettings();activeFile='';$('editor').value='';$('activeFile').textContent='No file open';await refreshFiles();
};
$('refreshFiles').onclick=refreshFiles;
$('fileFilter').oninput=renderFiles;
$('saveFile').onclick=async()=>{
  try{
    if(!activeFile)throw Error('No file open');
    if(!$('writeApproval').checked)throw Error('Check "approve direct file write" first');
    const data=await window.opentrue.request('/v1/file','PUT',{workspace:workspace(),path:activeFile,content:$('editor').value,approved:true});
    msg('system',`Saved ${data.path} (${data.bytes} bytes)`);$('writeApproval').checked=false;
  }catch(e){msg('system',`Save: ${e.message}`)}
};
$('send').onclick=sendPrompt;
$('prompt').onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();sendPrompt()}};
$('saveSettings').onclick=async()=>{try{await saveSettings();msg('system','Settings saved securely.')}catch(e){msg('system',`Settings: ${e.message}`)}};
$('provider').onchange=()=>{
  const d=defaults[$('provider').value];if(d){$('model').value=d.model;$('endpoint').value=d.endpoint}
};
$('connectRemote').onclick=async()=>{
  try{
    await saveSettings();const r=await window.opentrue.remoteConnect();
    status('remoteStatus',`Server ${String(r.status).toLowerCase()}`,r.status==='CONNECTED'?'good':'warn');
    msg('system',`Remote bridge: ${r.status}`);
  }catch(e){status('remoteStatus','Server error','bad');msg('system',`Remote: ${e.message}`)}
};
$('disconnectRemote').onclick=async()=>{
  try{await window.opentrue.remoteDisconnect();status('remoteStatus','Server disconnected','');msg('system','Remote bridge disconnected.')}
  catch(e){msg('system',`Remote: ${e.message}`)}
};
window.opentrue.onEngineExit(({code})=>{status('engineStatus',`Engine stopped (${code})`,'bad');msg('system',`Local engine exited with code ${code}`)});
init().catch(e=>msg('system',`Startup error: ${e.message}`));
