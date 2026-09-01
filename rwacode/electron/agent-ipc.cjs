'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createWorkspaceAgent } = require('./workspace-agent.cjs');
const { createGitHubWorkspaceManager } = require('./github-workspace.cjs');
const { createGoogleDriveWorkspaceManager } = require('./google-drive-workspace.cjs');

const CANONICAL_ROOT = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
const agents = new Map();
const transactionAgents = new Map();
let githubManager = null;
let googleDriveManager = null;
let lastAgent = null;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function journalPath() { return path.join(app.getPath('userData'), 'workspace-agent-transactions.jsonl'); }
function onWorkspaceChanged(transaction) {
  broadcast('agent:changed', transaction);
  broadcast('fs:changed', { eventType:'agent-transaction', source:transaction.workspace?.type || 'local', root:transaction.workspace?.root || CANONICAL_ROOT, path:transaction.touched?.[0] || '', paths:transaction.touched || [], at:Date.now() });
}
function getLocalAgent() {
  const key = 'local';
  if (!agents.has(key)) agents.set(key, createWorkspaceAgent({ root:CANONICAL_ROOT, journalPath:journalPath(), onWorkspaceChanged }));
  lastAgent = agents.get(key); return lastAgent;
}
function getGitHubManager() { if (!githubManager) githubManager = createGitHubWorkspaceManager({ stateRoot:path.join(app.getPath('userData'), 'managed-workspaces') }); return githubManager; }
function getGoogleDriveManager() { if (!googleDriveManager) googleDriveManager = createGoogleDriveWorkspaceManager({ stateRoot:path.join(app.getPath('userData'), 'managed-workspaces') }); return googleDriveManager; }
async function sourceAvailability() { return { local:{available:true}, github:getGitHubManager().availability(), googledrive:await getGoogleDriveManager().availability() }; }

async function resolveAgent(source = {}) {
  const type = String(source?.type || 'local').toLowerCase();
  if (type === 'local') return getLocalAgent();
  const locator = String(source?.locator || '').trim();
  let mounted;
  if (type === 'github') {
    if (!locator) throw new Error('@GitHub requires owner/repository');
    mounted = await getGitHubManager().mount({ locator, ref:String(source?.ref || 'main') });
  } else if (type === 'googledrive') {
    if (!locator) throw new Error('@GoogleDrive requires a mounted Drive file/folder path');
    mounted = await getGoogleDriveManager().mount({ locator });
  } else throw new Error(`unsupported workspace source: ${type}`);
  const key = mounted.adapter.id;
  if (!agents.has(key)) agents.set(key, createWorkspaceAgent({ adapter:mounted.adapter, journalPath:journalPath(), onWorkspaceChanged }));
  lastAgent = agents.get(key); return lastAgent;
}
function rememberTransaction(agent, tx) { if (tx?.id) transactionAgents.set(tx.id, agent); while (transactionAgents.size > 100) transactionAgents.delete(transactionAgents.keys().next().value); return tx; }
function agentForTransaction(id) { if (id && transactionAgents.has(id)) return transactionAgents.get(id); if (lastAgent) return lastAgent; return getLocalAgent(); }

ipcMain.handle('agent:getStatus', async (_event, source = { type:'local' }) => {
  const type = String(source?.type || 'local').toLowerCase();
  if ((type === 'github' || type === 'googledrive') && !source?.locator) return { ...getLocalAgent().status(), sources:await sourceAvailability() };
  const agent = await resolveAgent(source); return { ...agent.status(), sources:await sourceAvailability() };
});
ipcMain.handle('agent:plan', async (_event, task, options = {}) => {
  const agent = await resolveAgent(options?.source || { type:'local' });
  return rememberTransaction(agent, await agent.plan(String(task || ''), { mode:String(options?.mode || 'normal'), provider:String(options?.provider || 'auto') }));
});
ipcMain.handle('agent:apply', async (_event, id) => rememberTransaction(agentForTransaction(id), await agentForTransaction(id).apply(id || undefined)));
ipcMain.handle('agent:undo', async (_event, id) => rememberTransaction(agentForTransaction(id), await agentForTransaction(id).undo(id || undefined)));
ipcMain.handle('agent:githubAction', async (_event, id, action, payload = {}) => { const agent=agentForTransaction(id); if (agent.adapter?.type !== 'github') throw new Error('selected transaction is not from an @GitHub workspace'); return agent.explicitGitAction(String(action || ''), payload, id || undefined); });
ipcMain.handle('agent:driveAction', async (_event, id, action, payload = {}) => { const agent=agentForTransaction(id); if (agent.adapter?.type !== 'googledrive') throw new Error('selected transaction is not from an @GoogleDrive workspace'); return agent.explicitDriveAction(String(action || ''), payload, id || undefined); });
ipcMain.handle('agent:invalidate', async () => { for (const agent of agents.values()) agent.invalidate(); return true; });

module.exports = { getLocalAgent, resolveAgent, CANONICAL_ROOT };
