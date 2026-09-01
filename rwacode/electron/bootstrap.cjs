'use strict';

const { app, session } = require('electron');
const fs = require('node:fs');
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
    for(const entry of entries){if(!entry.isDirectory())continue;if(!entry.name.startsWith('rwacode-profile-')&&entry.name!=='rwacode-preview')continue;copyIfMissing(path.join(legacyPartitions,entry.name),path.join(stableUserData,'Partitions',entry.name));}
  }
}
migrateLegacyRwacodeState();
function storedProfileIds(){const ids=new Set(['personal','work','trading']);try{const parsed=JSON.parse(fs.readFileSync(path.join(stableUserData,'profiles.json'),'utf8'));for(const profile of Array.isArray(parsed.profiles)?parsed.profiles:[])if(profile&&typeof profile.id==='string'&&/^[a-z0-9-]+$/.test(profile.id))ids.add(profile.id);}catch{}return[...ids];}
async function flushBrowserState(){const sessions=storedProfileIds().map((id)=>session.fromPartition(`persist:rwacode-profile-${id}`,{cache:true}));sessions.push(session.fromPartition('persist:rwacode-preview',{cache:true}));await Promise.allSettled(sessions.map((ses)=>ses.flushStorageData()));}
let flushInFlight=false;let flushComplete=false;
app.on('before-quit',(event)=>{if(flushComplete)return;event.preventDefault();if(flushInFlight)return;flushInFlight=true;flushBrowserState().catch(()=>{}).finally(()=>{flushComplete=true;app.quit();});});
for(const signalName of ['SIGINT','SIGTERM'])process.on(signalName,()=>{if(app.isReady())app.quit();else process.exit(0);});

require('./agent-ipc.cjs');
require('./explorer-ops.cjs');
require('./main.cjs');
