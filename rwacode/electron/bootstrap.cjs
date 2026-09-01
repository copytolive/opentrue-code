'use strict';

const { app, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installIpcGuard, installShellWindowGuard } = require('./ipc-guard.cjs');

// Every renderer-to-main handler is shell-only. Install this before any module
// registers ipcMain.handle(), then pin the privileged shell BrowserWindow to the
// exact local index.html entry. Provider/Preview WebContents never inherit this IPC.
installIpcGuard();
installShellWindowGuard();
app.enableSandbox();

const appData = app.getPath('appData');
const originalUserData = app.getPath('userData');
const stableUserData = path.join(appData, 'RWACode');
const legacyUserDataCandidates = [originalUserData,path.join(appData,'rwacode'),path.join(appData,'Electron')].filter((value,index,values)=>value&&value!==stableUserData&&values.indexOf(value)===index);
app.setName('RWACode');
app.setPath('userData', stableUserData);

function copyIfMissing(source,destination){try{if(!fs.existsSync(source)||fs.existsSync(destination))return false;fs.mkdirSync(path.dirname(destination),{recursive:true});fs.cpSync(source,destination,{recursive:true,errorOnExist:false,force:false});return true;}catch{return false;}}
function migrateLegacyRwacodeState(){
  fs.mkdirSync(stableUserData,{recursive:true});
  for(const legacyRoot of legacyUserDataCandidates){
    copyIfMissing(path.join(legacyRoot,'profiles.json'),path.join(stableUserData,'profiles.json'));
    const legacyPartitions=path.join(legacyRoot,'Partitions');if(!fs.existsSync(legacyPartitions))continue;
    let entries=[];try{entries=fs.readdirSync(legacyPartitions,{withFileTypes:true});}catch{continue;}
    // Preserve only named provider-profile sessions. Legacy Preview/browser state is never imported.
    for(const entry of entries){if(!entry.isDirectory())continue;if(!entry.name.startsWith('rwacode-profile-'))continue;copyIfMissing(path.join(legacyPartitions,entry.name),path.join(stableUserData,'Partitions',entry.name));}
  }
}
migrateLegacyRwacodeState();
function storedProfileIds(){const ids=new Set(['personal','work','trading']);try{const parsed=JSON.parse(fs.readFileSync(path.join(stableUserData,'profiles.json'),'utf8'));for(const profile of Array.isArray(parsed.profiles)?parsed.profiles:[])if(profile&&typeof profile.id==='string'&&/^[a-z0-9-]+$/.test(profile.id))ids.add(profile.id);}catch{}return[...ids];}
async function flushBrowserState(){const sessions=storedProfileIds().map((id)=>session.fromPartition(`persist:rwacode-profile-${id}`,{cache:true}));sessions.push(session.fromPartition('persist:rwacode-preview',{cache:true}));await Promise.allSettled(sessions.map((ses)=>ses.flushStorageData()));}
let flushInFlight=false;let flushComplete=false;let signalShutdownInFlight=false;
app.on('before-quit',(event)=>{if(flushComplete)return;event.preventDefault();if(flushInFlight)return;flushInFlight=true;flushBrowserState().catch(()=>{}).finally(()=>{flushComplete=true;app.quit();});});
async function shutdownFromSignal(){
  if(signalShutdownInFlight)return;
  signalShutdownInFlight=true;
  try{await flushBrowserState();}catch{}
  flushComplete=true;
  app.exit(0);
}
for(const signalName of ['SIGINT','SIGTERM'])process.on(signalName,()=>{if(app.isReady())void shutdownFromSignal();else process.exit(0);});

function installCiSmokeReadyMarker(){
  if(process.env.RWACODE_CI_SMOKE!=='1')return;
  const marker=String(process.env.RWACODE_SMOKE_READY_FILE||'').trim();
  if(!marker||!path.isAbsolute(marker))return;
  const tmpRoot=fs.realpathSync.native(os.tmpdir());
  const markerParent=path.dirname(marker);
  fs.mkdirSync(markerParent,{recursive:true});
  let realParent;try{realParent=fs.realpathSync.native(markerParent);}catch{return;}
  if(realParent!==tmpRoot&&!realParent.startsWith(`${tmpRoot}${path.sep}`))return;
  app.on('browser-window-created',(_event,win)=>{
    const writeReady=()=>{
      try{
        const url=win.webContents.getURL();
        if(!url||!url.startsWith('file:')||!url.includes('index.html'))return;
        const payload={pid:process.pid,version:app.getVersion(),url,readyAt:new Date().toISOString()};
        const temp=`${marker}.${process.pid}.tmp`;
        fs.writeFileSync(temp,`${JSON.stringify(payload)}\n`,{mode:0o600});
        fs.renameSync(temp,marker);
      }catch{}
    };
    win.webContents.once('did-finish-load',writeReady);
  });
}
installCiSmokeReadyMarker();

require('./agent-ipc.cjs');
require('./explorer-ops.cjs');
require('./main.cjs');
