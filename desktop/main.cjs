const {app,BrowserWindow,dialog,ipcMain,safeStorage,shell}=require('electron');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {createWriteStream,existsSync}=require('node:fs');
const {mkdir,readFile,writeFile,rename}=require('node:fs/promises');
const path=require('node:path');

let win=null,engine=null,enginePort=null,engineToken=null,engineReady=null;
const VERSION='0.3.0';

function runtimePath(...parts){
  return app.isPackaged
    ? path.join(process.resourcesPath,'runtime',...parts)
    : path.join(__dirname,'..',...parts);
}
function userPath(name){return path.join(app.getPath('userData'),name)}
function settingsPath(){return userPath('settings.json')}
function logPath(){return userPath('engine.log')}
function defaultSettings(){
  return {
    provider:'ollama',
    model:'qwen3-coder:30b',
    endpoint:'http://127.0.0.1:11434',
    workspace:'',
    controlPlaneUrl:'',
    apiKeyEncrypted:'',
    controlPlaneTokenEncrypted:''
  };
}
function decrypt(value){
  if(!value)return '';
  try{
    if(!safeStorage.isEncryptionAvailable())return '';
    return safeStorage.decryptString(Buffer.from(value,'base64'));
  }catch{return ''}
}
function encrypt(value){
  if(!value)return '';
  if(!safeStorage.isEncryptionAvailable())throw Error('OS secure storage is unavailable');
  return safeStorage.encryptString(String(value)).toString('base64');
}
async function loadSettingsRaw(){
  try{return {...defaultSettings(),...JSON.parse(await readFile(settingsPath(),'utf8'))}}
  catch{return defaultSettings()}
}
async function saveSettingsRaw(value){
  const dir=app.getPath('userData');
  await mkdir(dir,{recursive:true});
  const tmp=`${settingsPath()}.${process.pid}.tmp`;
  await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  await rename(tmp,settingsPath());
}
async function engineRequest(route,{method='GET',body}={}){
  await engineReady;
  const r=await fetch(`http://127.0.0.1:${enginePort}${route}`,{
    method,
    headers:{
      authorization:`Bearer ${engineToken}`,
      ...(body!==undefined?{'content-type':'application/json'}:{})
    },
    body:body!==undefined?JSON.stringify(body):undefined
  });
  const text=await r.text();
  let data={};
  try{data=text?JSON.parse(text):{}}catch{data={error:text}}
  if(!r.ok)throw Error(data.error||`Engine returned HTTP ${r.status}`);
  return data;
}
async function applySettings(){
  const s=await loadSettingsRaw();
  await engineRequest('/v1/config',{
    method:'POST',
    body:{provider:s.provider,model:s.model,endpoint:s.endpoint,apiKey:decrypt(s.apiKeyEncrypted)}
  });
  if(s.workspace){
    try{await engineRequest('/v1/workspaces/approve',{method:'POST',body:{path:s.workspace}})}
    catch{}
  }
}
function startEngine(){
  engineToken=randomBytes(32).toString('hex');
  const script=runtimePath('engine','src','server.mjs');
  if(!existsSync(script))throw Error(`Engine runtime missing: ${script}`);
  engineReady=new Promise((resolveReady,rejectReady)=>{
    let settled=false,buffer='';
    const env={
      ...process.env,
      ELECTRON_RUN_AS_NODE:'1',
      OPENTRUE_ENGINE_TOKEN:engineToken,
      OPENTRUE_ENGINE_HOST:'127.0.0.1',
      OPENTRUE_ENGINE_PORT:'0'
    };
    engine=spawn(process.execPath,[script],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
    const logs=createWriteStream(logPath(),{flags:'a',mode:0o600});
    const timeout=setTimeout(()=>{
      if(!settled){settled=true;rejectReady(Error('Engine startup timed out'));engine?.kill('SIGTERM')}
    },15000);
    engine.stdout.setEncoding('utf8');
    engine.stdout.on('data',chunk=>{
      logs.write(chunk);
      buffer+=chunk;
      for(;;){
        const i=buffer.indexOf('\n');if(i<0)break;
        const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);
        if(line.startsWith('OPENTRUE_ENGINE_READY ')){
          try{
            const info=JSON.parse(line.slice('OPENTRUE_ENGINE_READY '.length));
            enginePort=info.port;
            if(!settled){settled=true;clearTimeout(timeout);resolveReady(info)}
          }catch(e){
            if(!settled){settled=true;clearTimeout(timeout);rejectReady(e)}
          }
        }
      }
    });
    engine.stderr.on('data',chunk=>logs.write(chunk));
    engine.on('error',e=>{
      if(!settled){settled=true;clearTimeout(timeout);rejectReady(e)}
    });
    engine.on('exit',code=>{
      logs.end();
      engine=null;
      if(win&&!win.isDestroyed())win.webContents.send('opentrue:engine-exit',{code});
    });
  });
  return engineReady;
}
async function createWindow(){
  win=new BrowserWindow({
    width:1480,height:920,minWidth:980,minHeight:680,
    title:'OpenTrue Code',
    backgroundColor:'#0b0d10',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true
    }
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return {action:'deny'}});
  win.webContents.on('will-navigate',(event,url)=>{
    if(!url.startsWith('file:')){event.preventDefault();shell.openExternal(url)}
  });
  await win.loadFile(path.join(__dirname,'renderer','index.html'));
}
function publicSettings(s){
  return {
    provider:s.provider,model:s.model,endpoint:s.endpoint,workspace:s.workspace,
    controlPlaneUrl:s.controlPlaneUrl,
    hasApiKey:Boolean(s.apiKeyEncrypted),
    hasControlPlaneToken:Boolean(s.controlPlaneTokenEncrypted),
    version:VERSION,
    secureStorage:safeStorage.isEncryptionAvailable()
  };
}
function registerIpc(){
  ipcMain.handle('opentrue:engine-request',async(_event,{route,method,body})=>{
    if(typeof route!=='string'||!route.startsWith('/v1/'))throw Error('invalid engine route');
    const allowed=new Set(['GET','POST','PUT']);
    method=String(method||'GET').toUpperCase();
    if(!allowed.has(method))throw Error('method is not allowed');
    return await engineRequest(route,{method,body});
  });
  ipcMain.handle('opentrue:pick-workspace',async()=>{
    const result=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory'],title:'Choose a Git repository root'});
    return result.canceled?'':result.filePaths[0]||'';
  });
  ipcMain.handle('opentrue:settings-load',async()=>publicSettings(await loadSettingsRaw()));
  ipcMain.handle('opentrue:settings-save',async(_event,input)=>{
    const current=await loadSettingsRaw();
    const next={...current};
    for(const key of ['provider','model','endpoint','workspace','controlPlaneUrl']){
      if(Object.prototype.hasOwnProperty.call(input,key))next[key]=String(input[key]??'');
    }
    if(input.apiKey)next.apiKeyEncrypted=encrypt(input.apiKey);
    if(input.clearApiKey===true)next.apiKeyEncrypted='';
    if(input.controlPlaneToken)next.controlPlaneTokenEncrypted=encrypt(input.controlPlaneToken);
    if(input.clearControlPlaneToken===true)next.controlPlaneTokenEncrypted='';
    await saveSettingsRaw(next);
    await applySettings();
    return publicSettings(next);
  });
  ipcMain.handle('opentrue:remote-connect',async()=>{
    const s=await loadSettingsRaw();
    const token=decrypt(s.controlPlaneTokenEncrypted);
    if(!s.controlPlaneUrl||!token)throw Error('Control-plane URL and token are required');
    return await engineRequest('/v1/remote/connect',{
      method:'POST',
      body:{url:s.controlPlaneUrl,token}
    });
  });
  ipcMain.handle('opentrue:remote-disconnect',async()=>engineRequest('/v1/remote/disconnect',{method:'POST',body:{}}));
  ipcMain.handle('opentrue:open-external',async(_event,url)=>{
    const parsed=new URL(String(url));
    if(!['https:','http:'].includes(parsed.protocol))throw Error('unsupported URL');
    await shell.openExternal(parsed.toString());return true;
  });
}
app.whenReady().then(async()=>{
  registerIpc();
  try{
    await startEngine();
    await applySettings();
    await createWindow();
  }catch(e){
    dialog.showErrorBox('OpenTrue Code failed to start',String(e.message||e));
    app.quit();
  }
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('before-quit',()=>{engine?.kill('SIGTERM')});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
