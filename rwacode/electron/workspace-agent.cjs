'use strict';

const fsp=require('node:fs').promises;
const path=require('node:path');
const {createLocalWorkspaceAdapter}=require('./workspace-adapter.cjs');
const {createWorkspaceRetriever}=require('./workspace-retriever.cjs');
const {createAgentRunner}=require('./agent-runner.cjs');
const {createTransactionEngine,MAX_TRANSACTION_BYTES}=require('./transaction-engine.cjs');

const MAX_MANUAL_CHANGESET_BYTES=MAX_TRANSACTION_BYTES+256*1024;
function parseManualChangeSet(input){
  if(input&&typeof input==='object'&&!Array.isArray(input))return input;
  const raw=String(input||'').trim();
  if(!raw)throw new Error('Paste a ChangeSet JSON before Review ChangeSet');
  if(Buffer.byteLength(raw,'utf8')>MAX_MANUAL_CHANGESET_BYTES)throw new Error('Manual ChangeSet exceeds the review input size limit');
  try{return JSON.parse(raw);}catch{throw new Error('Manual ChangeSet must be valid JSON');}
}

function createWorkspaceAgent({root=null,adapter=null,journalPath=null,onWorkspaceChanged=null,projectContext=null}={}){
  const workspaceAdapter=adapter||createLocalWorkspaceAdapter({root});
  const context=projectContext||createWorkspaceRetriever({root:workspaceAdapter.root});
  const runner=createAgentRunner({root:workspaceAdapter.root,projectContext:context,adapter:workspaceAdapter});
  let activePreparedId=null;let lastSourceState=null;
  const safeId=String(workspaceAdapter.id||workspaceAdapter.type||'workspace').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);
  const durableDir=journalPath?path.join(path.dirname(journalPath),'transaction-snapshots',safeId):null;
  async function journal(entry){if(!journalPath)return;await fsp.mkdir(path.dirname(journalPath),{recursive:true,mode:0o700});await fsp.appendFile(journalPath,JSON.stringify(entry)+'\n',{encoding:'utf8',mode:0o600});}
  async function readSourceState(){if(typeof workspaceAdapter.sourceState!=='function')return null;lastSourceState=await workspaceAdapter.sourceState();return lastSourceState;}
  function workspaceMeta(){return{id:workspaceAdapter.id,type:workspaceAdapter.type,root:workspaceAdapter.root,capabilities:workspaceAdapter.capabilities,source:workspaceAdapter.source||null};}
  async function enrich(tx){return{...tx,workspace:workspaceMeta(),sourceState:await readSourceState()};}
  const transactions=createTransactionEngine({adapter:workspaceAdapter,journal,durableDir,onApplied:async(tx)=>{context.invalidate();if(onWorkspaceChanged)await onWorkspaceChanged(await enrich(tx));}});
  async function contextForTask(task){const built=await context.build(String(task||'').trim());return{workspace:workspaceMeta(),text:built.text,files:built.files||[],indexedFiles:built.indexedFiles||0,bytes:built.bytes||0};}
  async function plan(task){
    const result=await runner.plan(task);
    const operations=Array.isArray(result?.changeSet?.operations)?result.changeSet.operations:[];
    if(!operations.length){activePreparedId=null;return{status:'NO_CHANGE',id:null,createdAt:new Date().toISOString(),task:String(task||''),runner:result.runner,changeSet:{version:1,summary:String(result?.changeSet?.summary||'No change required').slice(0,500),operations:[]},touched:[],diff:'',undoAvailable:false,workspace:workspaceMeta(),sourceState:await readSourceState(),runnerAvailability:runner.availability(),evidence:result.evidence||null};}
    const tx=await transactions.prepare(result.changeSet,{task,runner:result.runner});activePreparedId=tx.id;
    return{...(await enrich(tx)),runnerAvailability:runner.availability(),evidence:result.evidence||null};
  }
  async function prepareChangeSet(input,{task='Manual ChangeSet review'}={}){
    const changeSet=parseManualChangeSet(input);
    const tx=await transactions.prepare(changeSet,{task:String(task||'Manual ChangeSet review'),runner:'manual-changeset'});
    activePreparedId=tx.id;
    return{...(await enrich(tx)),runnerAvailability:runner.availability(),evidence:{manual:true}};
  }
  async function apply(id=activePreparedId){if(!id)throw new Error('no prepared transaction');const tx=await transactions.apply(id);if(activePreparedId===id)activePreparedId=null;return enrich(tx);}
  async function undo(id){const txStatus=await transactions.status();const transactionId=id||txStatus.lastTransaction?.id||null;const driveSynced=workspaceAdapter.type==='googledrive'&&transactionId&&typeof workspaceAdapter.hasSyncedTransaction==='function'&&workspaceAdapter.hasSyncedTransaction(transactionId);if(driveSynced&&typeof workspaceAdapter.assertRollbackSync==='function')await workspaceAdapter.assertRollbackSync({transactionId});const undone=await transactions.undo(transactionId||undefined);if(driveSynced&&typeof workspaceAdapter.rollbackSync==='function')await workspaceAdapter.rollbackSync({transactionId});return enrich(undone);}
  async function explicitGitAction(action,payload={},transactionId=null){if(workspaceAdapter.type!=='github')throw new Error('GitHub action requires an @GitHub workspace');const last=(await transactions.status()).lastTransaction;if(!last||last.status!=='APPLIED')throw new Error('GitHub commit/push/PR requires an applied RWACode transaction');if(transactionId&&last.id!==transactionId)throw new Error('GitHub action transaction does not match the active applied transaction');if(action==='commit')return workspaceAdapter.commit({message:payload.message,paths:last.touched});if(action==='push')return workspaceAdapter.push();if(action==='pr')return workspaceAdapter.createPullRequest({title:payload.title,body:payload.body});throw new Error('unsupported explicit GitHub action');}
  async function explicitDriveAction(action,payload={},transactionId=null){if(workspaceAdapter.type!=='googledrive')throw new Error('Google Drive action requires an @GoogleDrive workspace');const last=(await transactions.status()).lastTransaction;if(!last||last.status!=='APPLIED')throw new Error('Google Drive sync requires an applied RWACode transaction');if(transactionId&&last.id!==transactionId)throw new Error('Google Drive action transaction does not match the active applied transaction');if(action==='sync')return workspaceAdapter.syncBack({transactionId:last.id,paths:last.touched,...payload});throw new Error('unsupported explicit Google Drive action');}
  async function status(){return{workspace:workspaceMeta(),runners:runner.availability(),transaction:await transactions.status(),sourceState:lastSourceState,activePreparedId};}
  function invalidate(){context.invalidate();}
  return{plan,prepareChangeSet,apply,undo,status,invalidate,contextForTask,adapter:workspaceAdapter,explicitGitAction,explicitDriveAction};
}
module.exports={createWorkspaceAgent,parseManualChangeSet,MAX_MANUAL_CHANGESET_BYTES};
