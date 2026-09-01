'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createWorkspaceAgent } = require('./workspace-agent.cjs');
const { createGitHubWorkspaceManager } = require('./github-workspace.cjs');
const { createGoogleDriveWorkspaceManager } = require('./google-drive-workspace.cjs');

const CANONICAL_ROOT = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
const agents = new Map();
const sourceAgents = new Map();
const transactionAgents = new Map();
let githubManager = null;
let googleDriveManager = null;
let lastAgent = null;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
}
function journalPath() { return path.join(app.getPath('userData'), 'workspace-agent-transactions.jsonl'); }
function onWorkspaceChanged(transaction) {
  broadcast('agent:changed', transaction);
  broadcast('fs:changed', { eventType:'agent-transaction', source:transaction.workspace?.type || 'local', root:transaction.workspace?.root || CANONICAL_ROOT, path:transaction.touched?.[0] || '', paths:transaction.touched || [], at:Date.now() });
}
function sourceIdentity(source = {}) { return `${String(source?.type || 'local').toLowerCase()}::${String(source?.locator || '').trim()}`; }
function getLocalAgent() {
  const key = 'local';
  if (!agents.has(key)) agents.set(key, createWorkspaceAgent({ root:CANONICAL_ROOT, journalPath:journalPath(), onWorkspaceChanged }));
  const agent=agents.get(key); sourceAgents.set('local::',agent); lastAgent=agent; return agent;
}
function getGitHubManager() { if (!githubManager) githubManager=createGitHubWorkspaceManager({ stateRoot:path.join(app.getPath('userData'),'managed-workspaces') }); return githubManager; }
function getGoogleDriveManager() { if (!googleDriveManager) googleDriveManager=createGoogleDriveWorkspaceManager({ stateRoot:path.join(app.getPath('userData'),'managed-workspaces') }); return googleDriveManager; }
async function sourceAvailability() { return { local:{available:true}, github:getGitHubManager().availability(), googledrive:await getGoogleDriveManager().availability() }; }

async function resolveAgent(source = {}, { preferCached = true } = {}) {
  const type=String(source?.type||'local').toLowerCase();
  if(type==='local') return getLocalAgent();
  const locator=String(source?.locator||'').trim();
  if(!locator) throw new Error(type==='github'?'@GitHub requires owner/repository#branch':'@GoogleDrive requires a mounted Drive file/folder path');
  const identity=sourceIdentity({type,locator});
  if(preferCached&&sourceAgents.has(identity)){lastAgent=sourceAgents.get(identity);return lastAgent}
  let mounted;
  if(type==='github') mounted=await getGitHubManager().mount({locator,ref:String(source?.ref||'main')});
  else if(type==='googledrive') mounted=await getGoogleDriveManager().mount({locator});
  else throw new Error(`unsupported workspace source: ${type}`);
  const key=mounted.adapter.id;
  if(!agents.has(key)) agents.set(key,createWorkspaceAgent({adapter:mounted.adapter,journalPath:journalPath(),onWorkspaceChanged}));
  const agent=agents.get(key);sourceAgents.set(identity,agent);lastAgent=agent;return agent;
}
function rememberTransaction(agent,tx){if(tx?.id)transactionAgents.set(tx.id,agent);while(transactionAgents.size>100)transactionAgents.delete(transactionAgents.keys().next().value);return tx}
function agentForTransaction(id){if(id&&transactionAgents.has(id))return transactionAgents.get(id);if(lastAgent)return lastAgent;return getLocalAgent()}

async function buildReferenceContext(task,targetSource,contextSources=[]){
  const unique=[];const seen=new Set([sourceIdentity(targetSource)]);
  for(const source of Array.isArray(contextSources)?contextSources:[]){
    if(!source||source.enabled===false)continue;
    const normalized={type:String(source.type||'local').toLowerCase(),locator:String(source.locator||'').trim(),ref:String(source.ref||'main')};
    const id=sourceIdentity(normalized);if(seen.has(id))continue;seen.add(id);unique.push(normalized);if(unique.length>=3)break;
  }
  if(!unique.length)return{text:'',evidence:[]};
  const sections=[];const evidence=[];let totalChars=0;const MAX_REFERENCE_CHARS=180000;
  for(const source of unique){
    const agent=await resolveAgent(source);const built=await agent.contextForTask(task);
    const label=`${built.workspace.type}${built.workspace.source?.repository?`:${built.workspace.source.repository}`:built.workspace.source?.sourcePath?`:${built.workspace.source.sourcePath}`:''}`;
    const remaining=Math.max(0,MAX_REFERENCE_CHARS-totalChars);if(!remaining)break;
    const text=String(built.text||'').slice(0,remaining);totalChars+=text.length;
    sections.push(`[REFERENCE SOURCE ${label}]\n${text}\n[END REFERENCE SOURCE ${label}]`);
    evidence.push({source,files:built.files,indexedFiles:built.indexedFiles,bytes:Math.min(built.bytes||text.length,text.length)});
  }
  return{text:sections.join('\n\n'),evidence};
}

ipcMain.handle('agent:getStatus',async(_event,source={type:'local'})=>{
  const type=String(source?.type||'local').toLowerCase();
  if((type==='github'||type==='googledrive')&&!source?.locator)return{...getLocalAgent().status(),sources:await sourceAvailability()};
  const agent=await resolveAgent(source);return{...agent.status(),sources:await sourceAvailability()};
});
ipcMain.handle('agent:browse',async(_event,source={type:'local'},relativePath='.')=>{
  const agent=await resolveAgent(source);if(typeof agent.adapter?.listDirectory!=='function')throw new Error('selected target does not support browsing');
  return agent.adapter.listDirectory(relativePath||'.');
});
ipcMain.handle('agent:readTarget',async(_event,source={type:'local'},relativePath)=>{
  const agent=await resolveAgent(source);if(typeof agent.adapter?.readText!=='function')throw new Error('selected target does not support text reads');
  return agent.adapter.readText(String(relativePath||''));
});
ipcMain.handle('agent:plan',async(_event,task,options={})=>{
  const targetSource=options?.target||options?.source||{type:'local'};
  const agent=await resolveAgent(targetSource);
  const reference=await buildReferenceContext(String(task||''),targetSource,options?.contextSources||[]);
  return rememberTransaction(agent,await agent.plan(String(task||''),{
    mode:String(options?.mode||'normal'),provider:String(options?.provider||'auto'),chatOnly:Boolean(options?.chatOnly),
    extraContextText:reference.text,extraContextEvidence:reference.evidence,conversation:Array.isArray(options?.conversation)?options.conversation:[],
  }));
});
ipcMain.handle('agent:apply',async(_event,id)=>rememberTransaction(agentForTransaction(id),await agentForTransaction(id).apply(id||undefined)));
ipcMain.handle('agent:undo',async(_event,id)=>rememberTransaction(agentForTransaction(id),await agentForTransaction(id).undo(id||undefined)));
ipcMain.handle('agent:githubAction',async(_event,id,action,payload={})=>{const agent=agentForTransaction(id);if(agent.adapter?.type!=='github')throw new Error('selected transaction is not from an @GitHub workspace');return agent.explicitGitAction(String(action||''),payload,id||undefined)});
ipcMain.handle('agent:driveAction',async(_event,id,action,payload={})=>{const agent=agentForTransaction(id);if(agent.adapter?.type!=='googledrive')throw new Error('selected transaction is not from an @GoogleDrive workspace');return agent.explicitDriveAction(String(action||''),payload,id||undefined)});
ipcMain.handle('agent:invalidate',async()=>{for(const agent of agents.values())agent.invalidate();return true});

module.exports={getLocalAgent,resolveAgent,buildReferenceContext,sourceIdentity,CANONICAL_ROOT};
