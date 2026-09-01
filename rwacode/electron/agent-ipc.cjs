'use strict';

const { app, BrowserWindow, ipcMain }=require('electron');
const path=require('node:path');
const {createWorkspaceAgent}=require('./workspace-agent.cjs');
const {createGitHubWorkspaceManager}=require('./github-workspace.cjs');
const {createGoogleDriveWorkspaceManager}=require('./google-drive-workspace.cjs');

const CANONICAL_ROOT='/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
const agents=new Map();const sourceAgents=new Map();const transactionAgents=new Map();let githubManager=null;let googleDriveManager=null;let lastAgent=null;
function broadcast(channel,payload){for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.send(channel,payload);}
function journalPath(){return path.join(app.getPath('userData'),'workspace-agent-transactions.jsonl');}
function onWorkspaceChanged(transaction){broadcast('agent:changed',transaction);broadcast('fs:changed',{eventType:'agent-transaction',source:transaction.workspace?.type||'local',root:transaction.workspace?.root||CANONICAL_ROOT,path:transaction.touched?.[0]||'',paths:transaction.touched||[],at:Date.now()});}
function sourceIdentity(source={}){return`${String(source?.type||'local').toLowerCase()}::${String(source?.locator||'').trim()}`;}
function getLocalAgent(){const key='local';if(!agents.has(key))agents.set(key,createWorkspaceAgent({root:CANONICAL_ROOT,journalPath:journalPath(),onWorkspaceChanged}));const agent=agents.get(key);sourceAgents.set('local::',agent);lastAgent=agent;return agent;}
function getGitHubManager(){if(!githubManager)githubManager=createGitHubWorkspaceManager({stateRoot:path.join(app.getPath('userData'),'managed-workspaces')});return githubManager;}
function getGoogleDriveManager(){if(!googleDriveManager)googleDriveManager=createGoogleDriveWorkspaceManager({stateRoot:path.join(app.getPath('userData'),'managed-workspaces')});return googleDriveManager;}
async function sourceAvailability(){return{local:{available:true},github:getGitHubManager().availability(),googledrive:await getGoogleDriveManager().availability()};}
async function resolveAgent(source={}, {preferCached=true}={}){const type=String(source?.type||'local').toLowerCase();if(type==='local')return getLocalAgent();const locator=String(source?.locator||'').trim();if(!locator)throw new Error(type==='github'?'@GitHub requires owner/repository#branch':'@GoogleDrive requires a mounted Drive file/folder path');const identity=sourceIdentity({type,locator});if(preferCached&&sourceAgents.has(identity)){lastAgent=sourceAgents.get(identity);return lastAgent;}let mounted;if(type==='github')mounted=await getGitHubManager().mount({locator,ref:String(source?.ref||'main')});else if(type==='googledrive')mounted=await getGoogleDriveManager().mount({locator});else throw new Error(`unsupported workspace source: ${type}`);const key=mounted.adapter.id;if(!agents.has(key))agents.set(key,createWorkspaceAgent({adapter:mounted.adapter,journalPath:journalPath(),onWorkspaceChanged}));const agent=agents.get(key);sourceAgents.set(identity,agent);lastAgent=agent;return agent;}
function rememberTransaction(agent,tx){if(tx?.id)transactionAgents.set(tx.id,agent);while(transactionAgents.size>100)transactionAgents.delete(transactionAgents.keys().next().value);return tx;}
function agentForTransaction(id){if(id&&transactionAgents.has(id))return transactionAgents.get(id);if(lastAgent)return lastAgent;return getLocalAgent();}
async function statusForAgent(agent){const status=await agent.status();if(status?.transaction?.lastTransaction?.id)rememberTransaction(agent,status.transaction.lastTransaction);return status;}

ipcMain.handle('agent:getStatus',async(_event,source={type:'local'})=>{const type=String(source?.type||'local').toLowerCase();if((type==='github'||type==='googledrive')&&!source?.locator){const local=getLocalAgent();return{...(await statusForAgent(local)),sources:await sourceAvailability()};}const agent=await resolveAgent(source);return{...(await statusForAgent(agent)),sources:await sourceAvailability()};});
ipcMain.handle('agent:browse',async(_event,source={type:'local'},relativePath='.')=>{const agent=await resolveAgent(source);if(typeof agent.adapter?.listDirectory!=='function')throw new Error('selected target does not support browsing');return agent.adapter.listDirectory(relativePath||'.');});
ipcMain.handle('agent:readTarget',async(_event,source={type:'local'},relativePath)=>{const agent=await resolveAgent(source);if(typeof agent.adapter?.readText!=='function')throw new Error('selected target does not support text reads');return agent.adapter.readText(String(relativePath||''));});
ipcMain.handle('agent:plan',async(_event,task,options={})=>{const targetSource=options?.target||options?.source||{type:'local'};const agent=await resolveAgent(targetSource);return rememberTransaction(agent,await agent.plan(String(task||'')));});
ipcMain.handle('agent:prepareChangeSet',async(_event,input,options={})=>{const targetSource=options?.target||options?.source||{type:'local'};const agent=await resolveAgent(targetSource);return rememberTransaction(agent,await agent.prepareChangeSet(input,{task:String(options?.task||'Manual ChangeSet review')}));});
ipcMain.handle('agent:apply',async(_event,id)=>{const agent=agentForTransaction(id);return rememberTransaction(agent,await agent.apply(id||undefined));});
ipcMain.handle('agent:undo',async(_event,id)=>{const agent=agentForTransaction(id);return rememberTransaction(agent,await agent.undo(id||undefined));});
ipcMain.handle('agent:githubAction',async(_event,id,action,payload={})=>{const agent=agentForTransaction(id);if(agent.adapter?.type!=='github')throw new Error('selected transaction is not from an @GitHub workspace');return agent.explicitGitAction(String(action||''),payload,id||undefined);});
ipcMain.handle('agent:driveAction',async(_event,id,action,payload={})=>{const agent=agentForTransaction(id);if(agent.adapter?.type!=='googledrive')throw new Error('selected transaction is not from an @GoogleDrive workspace');return agent.explicitDriveAction(String(action||''),payload,id||undefined);});
ipcMain.handle('agent:invalidate',async()=>{for(const agent of agents.values())agent.invalidate();return true;});
module.exports={getLocalAgent,resolveAgent,sourceIdentity,CANONICAL_ROOT};
