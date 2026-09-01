'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createWorkspaceAgent } = require('./workspace-agent.cjs');
const { createGitHubWorkspaceManager } = require('./github-workspace.cjs');

const CANONICAL_ROOT = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
const agents = new Map();
const transactionAgents = new Map();
let githubManager = null;
let lastAgent = null;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function journalPath() {
  return path.join(app.getPath('userData'), 'workspace-agent-transactions.jsonl');
}

function onWorkspaceChanged(transaction) {
  broadcast('agent:changed', transaction);
  broadcast('fs:changed', {
    eventType:'agent-transaction',
    source:transaction.workspace?.type || 'local',
    root:transaction.workspace?.root || CANONICAL_ROOT,
    path:transaction.touched?.[0] || '',
    paths:transaction.touched || [],
    at:Date.now(),
  });
}

function getLocalAgent() {
  const key = 'local';
  if (!agents.has(key)) {
    agents.set(key, createWorkspaceAgent({ root:CANONICAL_ROOT, journalPath:journalPath(), onWorkspaceChanged }));
  }
  lastAgent = agents.get(key);
  return lastAgent;
}

function getGitHubManager() {
  if (!githubManager) {
    githubManager = createGitHubWorkspaceManager({ stateRoot:path.join(app.getPath('userData'), 'managed-workspaces') });
  }
  return githubManager;
}

async function resolveAgent(source = {}) {
  const type = String(source?.type || 'local').toLowerCase();
  if (type === 'local') return getLocalAgent();
  if (type !== 'github') throw new Error(`unsupported workspace source: ${type}`);
  const locator = String(source?.locator || '').trim();
  if (!locator) throw new Error('@GitHub requires owner/repository');
  const mounted = await getGitHubManager().mount({ locator, ref:String(source?.ref || 'main') });
  const key = mounted.adapter.id;
  if (!agents.has(key)) {
    agents.set(key, createWorkspaceAgent({ adapter:mounted.adapter, journalPath:journalPath(), onWorkspaceChanged }));
  }
  lastAgent = agents.get(key);
  return lastAgent;
}

function rememberTransaction(agent, tx) {
  if (tx?.id) transactionAgents.set(tx.id, agent);
  while (transactionAgents.size > 100) transactionAgents.delete(transactionAgents.keys().next().value);
  return tx;
}

function agentForTransaction(id) {
  if (id && transactionAgents.has(id)) return transactionAgents.get(id);
  if (lastAgent) return lastAgent;
  return getLocalAgent();
}

ipcMain.handle('agent:getStatus', async (_event, source = { type:'local' }) => {
  if (String(source?.type || 'local').toLowerCase() === 'github' && !source?.locator) {
    return { ...getLocalAgent().status(), sources:{ local:{ available:true }, github:getGitHubManager().availability() } };
  }
  const agent = await resolveAgent(source);
  return { ...agent.status(), sources:{ local:{ available:true }, github:getGitHubManager().availability() } };
});

ipcMain.handle('agent:plan', async (_event, task, options = {}) => {
  const agent = await resolveAgent(options?.source || { type:'local' });
  return rememberTransaction(agent, await agent.plan(String(task || ''), { mode:String(options?.mode || 'normal') }));
});

ipcMain.handle('agent:apply', async (_event, id) => {
  const agent = agentForTransaction(id);
  return rememberTransaction(agent, await agent.apply(id || undefined));
});

ipcMain.handle('agent:undo', async (_event, id) => {
  const agent = agentForTransaction(id);
  return rememberTransaction(agent, await agent.undo(id || undefined));
});

ipcMain.handle('agent:githubAction', async (_event, id, action, payload = {}) => {
  const agent = agentForTransaction(id);
  if (agent.adapter?.type !== 'github') throw new Error('selected transaction is not from an @GitHub workspace');
  return agent.explicitGitAction(String(action || ''), payload, id || undefined);
});

ipcMain.handle('agent:invalidate', async () => {
  for (const agent of agents.values()) agent.invalidate();
  return true;
});

module.exports = { getLocalAgent, resolveAgent, CANONICAL_ROOT };
