'use strict';

const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const crypto=require('node:crypto');

const VALID_TYPES=new Set(['CREATE','MODIFY','RENAME','DELETE']);
const MAX_OPERATIONS=24;
const MAX_TRANSACTION_BYTES=8*1024*1024;
const MAX_DIFF_BYTES=384*1024;
const MAX_RETAINED_TRANSACTIONS=20;

function cloneSnapshot(snapshot){return{...snapshot,bytes:snapshot?.bytes?Buffer.from(snapshot.bytes):null};}
function stateMatches(a,b){return Boolean(a?.exists)===Boolean(b?.exists)&&(!a?.exists||a.digest===b.digest);}
function operationPaths(op){return op.type==='RENAME'?[op.path,op.to]:[op.path];}
function digest(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
function validateChangeSet(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('ChangeSet must be an object');
  const operations=Array.isArray(input.operations)?input.operations:[];
  if(!operations.length||operations.length>MAX_OPERATIONS)throw new Error(`ChangeSet operations must contain 1-${MAX_OPERATIONS} items`);
  if('command'in input||'shell'in input||'exec'in input)throw new Error('ChangeSet cannot contain shell commands');
  let contentBytes=0;
  const normalized=operations.map((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(`invalid ChangeSet operation ${index+1}`);
    const type=String(raw.type||'').toUpperCase();if(!VALID_TYPES.has(type))throw new Error(`unsupported ChangeSet operation: ${type||'(empty)'}`);
    if('command'in raw||'shell'in raw||'exec'in raw)throw new Error('ChangeSet operations cannot contain shell commands');
    const op={type,path:String(raw.path||'').trim()};if(!op.path)throw new Error(`operation ${index+1} is missing path`);
    if(type==='CREATE'||type==='MODIFY'){op.content=String(raw.content??'');contentBytes+=Buffer.byteLength(op.content);}
    if(type==='RENAME'){op.to=String(raw.to||'').trim();if(!op.to)throw new Error('RENAME requires to');if(raw.content!=null){op.content=String(raw.content);contentBytes+=Buffer.byteLength(op.content);}}
    return op;
  });
  if(contentBytes>MAX_TRANSACTION_BYTES)throw new Error(`ChangeSet content exceeds ${MAX_TRANSACTION_BYTES} byte transaction limit`);
  const paths=new Set();for(const op of normalized)for(const p of operationPaths(op)){if(paths.has(p))throw new Error(`ChangeSet touches the same path twice: ${p}; combine rename+edit using RENAME.content`);paths.add(p);}
  return{version:1,summary:String(input.summary||'Workspace change').slice(0,500),operations:normalized};
}
function boundedText(value,maxBytes=MAX_DIFF_BYTES){const text=String(value||'');if(Buffer.byteLength(text)<=maxBytes)return text;const head=text.slice(0,Math.floor(maxBytes*.65));const tail=text.slice(-Math.floor(maxBytes*.25));return`${head}\n… [RWACode diff truncated] …\n${tail}`;}
function simpleDiff(pathValue,before,after){
  const oldLines=(before.exists?before.bytes.toString('utf8'):'').split('\n');const newLines=(after.exists?after.bytes.toString('utf8'):'').split('\n');
  let prefix=0;while(prefix<oldLines.length&&prefix<newLines.length&&oldLines[prefix]===newLines[prefix])prefix++;
  let suffix=0;while(suffix<oldLines.length-prefix&&suffix<newLines.length-prefix&&oldLines[oldLines.length-1-suffix]===newLines[newLines.length-1-suffix])suffix++;
  const context=3;const oldStart=Math.max(0,prefix-context);const newStart=Math.max(0,prefix-context);const oldEnd=Math.min(oldLines.length,oldLines.length-suffix+context);const newEnd=Math.min(newLines.length,newLines.length-suffix+context);
  const lines=[`--- ${before.exists?`a/${pathValue}`:'/dev/null'}`,`+++ ${after.exists?`b/${pathValue}`:'/dev/null'}`,`@@ -${oldStart+1},${Math.max(0,oldEnd-oldStart)} +${newStart+1},${Math.max(0,newEnd-newStart)} @@`];
  for(let i=oldStart;i<prefix;i++)lines.push(` ${oldLines[i]}`);for(let i=prefix;i<oldLines.length-suffix;i++)lines.push(`-${oldLines[i]}`);for(let i=prefix;i<newLines.length-suffix;i++)lines.push(`+${newLines[i]}`);for(let i=Math.max(prefix,newLines.length-suffix);i<newEnd;i++)lines.push(` ${newLines[i]}`);
  return boundedText(lines.join('\n'));
}
function encodeMap(map){return[...map.entries()].map(([p,s])=>[p,{...s,bytes:s.bytes?s.bytes.toString('base64'):null}]);}
function decodeMap(value){return new Map((Array.isArray(value)?value:[]).map(([p,s])=>[p,{...s,bytes:s?.bytes?Buffer.from(s.bytes,'base64'):null}]));}
function durablePayload(tx){return{id:tx.id,status:tx.status,createdAt:tx.createdAt,appliedAt:tx.appliedAt||null,undoneAt:tx.undoneAt||null,task:tx.task,runner:tx.runner,changeSet:tx.changeSet,touched:tx.touched,createdDirs:tx.createdDirs||[],before:encodeMap(tx.before),projected:encodeMap(tx.projected),after:tx.after?encodeMap(tx.after):null,diff:tx.diff};}

function createTransactionEngine({adapter,onApplied=null,journal=null,durableDir=null}={}){
  if(!adapter)throw new Error('workspace adapter is required');const transactions=new Map();let lastAppliedId=null;let recoveryPromise=null;
  function durablePath(id){return durableDir?path.join(durableDir,`${id}.json`):null;}
  function loadDurableSync(){if(!durableDir)return;try{fs.mkdirSync(durableDir,{recursive:true,mode:0o700});}catch{return;}let names=[];try{names=fs.readdirSync(durableDir).filter((n)=>n.endsWith('.json'));}catch{return;}const loaded=[];for(const name of names)try{const raw=JSON.parse(fs.readFileSync(path.join(durableDir,name),'utf8'));const tx={...raw,createdDirs:Array.isArray(raw.createdDirs)?raw.createdDirs:[],before:decodeMap(raw.before),projected:decodeMap(raw.projected),after:raw.after?decodeMap(raw.after):null};transactions.set(tx.id,tx);loaded.push(tx);}catch{}loaded.sort((a,b)=>String(a.appliedAt||a.createdAt).localeCompare(String(b.appliedAt||b.createdAt)));const last=[...loaded].reverse().find((tx)=>tx.status==='APPLIED');if(last)lastAppliedId=last.id;}
  loadDurableSync();
  async function persist(tx){if(!durableDir)return;await fsp.mkdir(durableDir,{recursive:true,mode:0o700});const target=durablePath(tx.id);const temp=`${target}.${process.pid}.tmp`;await fsp.writeFile(temp,JSON.stringify(durablePayload(tx)),{encoding:'utf8',mode:0o600});await fsp.rename(temp,target);const names=(await fsp.readdir(durableDir)).filter((n)=>n.endsWith('.json'));if(names.length>MAX_RETAINED_TRANSACTIONS){const stats=[];for(const name of names)try{const st=await fsp.stat(path.join(durableDir,name));stats.push({name,mtime:st.mtimeMs});}catch{}stats.sort((a,b)=>a.mtime-b.mtime);for(const item of stats.slice(0,Math.max(0,stats.length-MAX_RETAINED_TRANSACTIONS)))await fsp.rm(path.join(durableDir,item.name),{force:true});}}
  async function capturePaths(paths){const result=new Map();for(const p of paths)result.set(p,cloneSnapshot(await adapter.inspect(p)));return result;}
  function projectedSnapshot(op,beforeMap,pathValue){const before=beforeMap.get(pathValue);if(op.type==='MODIFY'&&pathValue===op.path){const bytes=Buffer.from(op.content);return{...before,exists:true,bytes,size:bytes.length,digest:digest(bytes)};}if(op.type==='CREATE'&&pathValue===op.path){const bytes=Buffer.from(op.content);return{path:pathValue,exists:true,bytes,size:bytes.length,mode:0o600,digest:digest(bytes)};}if(op.type==='DELETE'&&pathValue===op.path)return{path:pathValue,exists:false,bytes:null,size:0,mode:null,digest:null};if(op.type==='RENAME'){if(pathValue===op.path)return{path:pathValue,exists:false,bytes:null,size:0,mode:null,digest:null};if(pathValue===op.to){const src=beforeMap.get(op.path);const bytes=op.content!=null?Buffer.from(op.content):(src.bytes?Buffer.from(src.bytes):null);return{...src,path:pathValue,bytes,size:bytes?.length||0,digest:bytes?digest(bytes):null};}}return cloneSnapshot(before);}
  async function verifyCurrent(expectedMap,touched,label){for(const p of touched){const current=await adapter.inspect(p);if(!stateMatches(current,expectedMap.get(p)))throw new Error(`${label} conflict: ${p} changed outside this transaction`);}}
  async function cleanupCreatedDirs(tx){if(tx?.createdDirs?.length&&typeof adapter.removeEmptyDirectories==='function')await adapter.removeEmptyDirectories(tx.createdDirs);}
  async function restoreMap(snapshotMap,touched,tx=null){for(const p of [...touched].reverse()){const desired=snapshotMap.get(p);const current=await adapter.inspect(p);if(desired.exists)await adapter.writeBytes(p,desired.bytes,{mustExist:current.exists?true:false,mode:desired.mode,createParents:true});else if(current.exists)await adapter.removeFile(p);}if(tx)await cleanupCreatedDirs(tx);}
  async function ensureRecovered(){if(recoveryPromise)return recoveryPromise;recoveryPromise=(async()=>{const interrupted=[...transactions.values()].filter((tx)=>tx.status==='APPLYING');for(const tx of interrupted){await restoreMap(tx.before,tx.touched,tx);tx.status='RECOVERED_ROLLBACK';tx.undoneAt=new Date().toISOString();await persist(tx);if(journal)await journal({id:tx.id,status:tx.status,touched:tx.touched,at:tx.undoneAt});}const last=[...transactions.values()].filter((tx)=>tx.status==='APPLIED').sort((a,b)=>String(a.appliedAt).localeCompare(String(b.appliedAt))).at(-1);lastAppliedId=last?.id||null;})();return recoveryPromise;}
  async function prepare(rawChangeSet,meta={}){await ensureRecovered();const changeSet=validateChangeSet(rawChangeSet);const touched=[...new Set(changeSet.operations.flatMap(operationPaths))];const before=await capturePaths(touched);let snapshotBytes=0;for(const snap of before.values())snapshotBytes+=snap.bytes?.length||0;if(snapshotBytes>MAX_TRANSACTION_BYTES)throw new Error(`BEFORE snapshot exceeds ${MAX_TRANSACTION_BYTES} byte transaction limit`);for(const op of changeSet.operations){if(op.type==='MODIFY'&&!before.get(op.path).exists)throw new Error(`MODIFY target does not exist: ${op.path}`);if(op.type==='CREATE'&&before.get(op.path).exists)throw new Error(`CREATE target already exists: ${op.path}`);if(op.type==='DELETE'&&!before.get(op.path).exists)throw new Error(`DELETE target does not exist: ${op.path}`);if(op.type==='RENAME'){if(!before.get(op.path).exists)throw new Error(`RENAME source does not exist: ${op.path}`);if(before.get(op.to).exists)throw new Error(`RENAME destination exists: ${op.to}`);}}const projected=new Map(touched.map((p)=>[p,cloneSnapshot(before.get(p))]));for(const op of changeSet.operations)for(const p of operationPaths(op))projected.set(p,projectedSnapshot(op,before,p));const diff=boundedText(touched.map((p)=>simpleDiff(p,before.get(p),projected.get(p))).join('\n\n'));const id=crypto.randomUUID();const tx={id,status:'PREPARED',createdAt:new Date().toISOString(),task:String(meta.task||''),runner:String(meta.runner||''),changeSet,touched,createdDirs:[],before,projected,after:null,diff};transactions.set(id,tx);while(transactions.size>MAX_RETAINED_TRANSACTIONS)transactions.delete(transactions.keys().next().value);await persist(tx);return publicTransaction(tx);}
  async function applyOperation(op){if(op.type==='MODIFY')return adapter.writeBytes(op.path,Buffer.from(op.content),{mustExist:true});if(op.type==='CREATE')return adapter.writeBytes(op.path,Buffer.from(op.content),{mustExist:false,createParents:true});if(op.type==='DELETE')return adapter.removeFile(op.path);if(op.type==='RENAME'){const moved=await adapter.renameFile(op.path,op.to,{createParents:true});let edited=null;if(op.content!=null)edited=await adapter.writeBytes(op.to,Buffer.from(op.content),{mustExist:true});return{createdParents:[...(moved?.createdParents||[]),...(edited?.createdParents||[])]};}throw new Error(`unsupported operation: ${op.type}`);}
  async function apply(id){await ensureRecovered();const tx=transactions.get(id);if(!tx||tx.status!=='PREPARED')throw new Error('transaction is not ready to apply');await verifyCurrent(tx.before,tx.touched,'apply');tx.status='APPLYING';await persist(tx);try{for(const op of tx.changeSet.operations){const result=await applyOperation(op);for(const dir of result?.createdParents||[])if(!tx.createdDirs.includes(dir))tx.createdDirs.push(dir);await persist(tx);}tx.after=await capturePaths(tx.touched);tx.status='APPLIED';tx.appliedAt=new Date().toISOString();lastAppliedId=tx.id;await persist(tx);if(journal)await journal({id:tx.id,status:tx.status,task:tx.task,runner:tx.runner,summary:tx.changeSet.summary,touched:tx.touched,at:tx.appliedAt});if(onApplied)await onApplied(publicTransaction(tx));return publicTransaction(tx);}catch(error){await restoreMap(tx.before,tx.touched,tx).catch(()=>{});tx.status='FAILED_ROLLED_BACK';await persist(tx).catch(()=>{});throw error;}}
  async function undo(id=lastAppliedId){await ensureRecovered();const tx=transactions.get(id);if(!tx||tx.status!=='APPLIED'||!tx.after)throw new Error('no applied transaction is available to undo');await verifyCurrent(tx.after,tx.touched,'undo');const beforeUndo=await capturePaths(tx.touched);try{await restoreMap(tx.before,tx.touched,tx);await verifyCurrent(tx.before,tx.touched,'undo verification');tx.status='UNDONE';tx.undoneAt=new Date().toISOString();if(lastAppliedId===tx.id)lastAppliedId=null;await persist(tx);if(journal)await journal({id:tx.id,status:tx.status,touched:tx.touched,at:tx.undoneAt});if(onApplied)await onApplied(publicTransaction(tx));return publicTransaction(tx);}catch(error){await restoreMap(beforeUndo,tx.touched).catch(()=>{});throw error;}}
  function publicTransaction(tx){return{id:tx.id,status:tx.status,createdAt:tx.createdAt,appliedAt:tx.appliedAt||null,undoneAt:tx.undoneAt||null,task:tx.task,runner:tx.runner,changeSet:tx.changeSet,touched:[...tx.touched],diff:tx.diff,undoAvailable:tx.status==='APPLIED',durable:Boolean(durableDir)};}
  async function status(){await ensureRecovered();const last=lastAppliedId?transactions.get(lastAppliedId):null;return{undoAvailable:Boolean(last&&last.status==='APPLIED'),lastTransaction:last?publicTransaction(last):null,recovered:true,durable:Boolean(durableDir)};}
  return{prepare,apply,undo,status,validateChangeSet};
}
module.exports={createTransactionEngine,validateChangeSet,simpleDiff,VALID_TYPES,MAX_OPERATIONS,MAX_TRANSACTION_BYTES,MAX_DIFF_BYTES};
