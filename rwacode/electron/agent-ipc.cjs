'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createWorkspaceAgent } = require('./workspace-agent.cjs');

const CANONICAL_ROOT = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
let workspaceAgent = null;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}
function getAgent() {
  if (workspaceAgent) return workspaceAgent;
  workspaceAgent = createWorkspaceAgent({
    root: CANONICAL_ROOT,
    journalPath: path.join(app.getPath('userData'), 'workspace-agent-transactions.jsonl'),
    onWorkspaceChanged: async (transaction) => {
      broadcast('agent:changed', transaction);
      broadcast('fs:changed', { eventType:'agent-transaction', path:transaction.touched?.[0] || '', paths:transaction.touched || [], at:Date.now() });
    },
  });
  return workspaceAgent;
}

ipcMain.handle('agent:getStatus', async () => getAgent().status());
ipcMain.handle('agent:plan', async (_event, task, options = {}) => getAgent().plan(String(task || ''), { mode: String(options?.mode || 'normal') }));
ipcMain.handle('agent:apply', async (_event, id) => getAgent().apply(id || undefined));
ipcMain.handle('agent:undo', async (_event, id) => getAgent().undo(id || undefined));
ipcMain.handle('agent:invalidate', async () => { getAgent().invalidate(); return true; });

module.exports = { getAgent, CANONICAL_ROOT };
