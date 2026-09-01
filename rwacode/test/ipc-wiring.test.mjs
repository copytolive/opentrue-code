import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const explorerOps=fs.readFileSync(new URL('../electron/explorer-ops.cjs',import.meta.url),'utf8');
const agentIpc=fs.readFileSync(new URL('../electron/agent-ipc.cjs',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../electron/ipc-guard.cjs',import.meta.url),'utf8');
const handlers=`${main}\n${explorerOps}\n${agentIpc}`;

const invokeChannels=[
  'app:getState','profiles:list','profiles:activate','profiles:add','profiles:rename','profiles:clear','profiles:delete',
  'browser:newTab','browser:switchTab','browser:closeTab','browser:navigate','browser:back','browser:forward','browser:reload','browser:home','browser:openExternal','browser:setBounds','browser:setVisible',
  'explorer:contextMenu','fs:list','fs:read','fs:write','fs:create','fs:rename','fs:delete','fs:reveal','fs:copyPath','fs:openImagePreview','fs:openTerminal','fs:clipboardSet','fs:clipboardState','fs:clipboardPaste','dialog:confirmDelete',
  'agent:getStatus','agent:browse','agent:readTarget','agent:plan','agent:apply','agent:undo','agent:githubAction','agent:driveAction','agent:invalidate',
  'preview:setBounds','preview:load','preview:reload','preview:openExternal',
];

test('every preload invoke channel has a matching main-process handler',()=>{
  for(const channel of invokeChannels){const escaped=channel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');assert.match(preload,new RegExp(`ipcRenderer\\.invoke\\(['\"]${escaped}['\"]`),`${channel} must be exposed by preload`);assert.match(handlers,new RegExp(`ipcMain\\.handle\\(['\"]${escaped}['\"]`),`${channel} must be implemented`);}
});

test('legacy AI provider-DOM IPC channels are physically absent',()=>{
  for(const source of [preload,handlers]) assert.doesNotMatch(source,/ai:sendFile|ai:readReply|ai:execute|executeJavaScript/);
});

test('event-only file synchronization bridge is explicit and one-way',()=>{
  assert.match(preload,/ipcRenderer\.on\('fs:changed'/);assert.match(preload,/ipcRenderer\.on\('fs:watch-error'/);assert.match(main,/send\('fs:changed'/);assert.match(main,/send\('fs:watch-error'/);
});

test('all privileged invoke handlers are wrapped by the trusted-shell IPC guard',()=>{
  assert.match(guard,/ipcMain\.handle\s*=/);assert.match(guard,/untrusted sender/);assert.match(guard,/untrusted frame/);assert.match(guard,/SHELL_ENTRY/);
});

test('Explorer native menu IPC is narrow and path-scoped',()=>{
  assert.match(preload,/showContextMenu:\s*\(relativePath\)/);assert.match(explorerOps,/ipcMain\.handle\('explorer:contextMenu'/);assert.match(explorerOps,/selectedInfo\(relativePath\)/);assert.doesNotMatch(preload,/explorer:execute|shellCommand|spawn\(/);
});

test('external web views remain sandboxed and Node-free',()=>{
  assert.match(main,/sandbox:\s*true/);assert.match(main,/contextIsolation:\s*true/);assert.match(main,/nodeIntegration:\s*false/);
});

test('RWACode shell does not expose a localhost REST or generic execute surface',()=>{
  assert.doesNotMatch(preload,/fetch\s*\(|XMLHttpRequest|axios|127\.0\.0\.1:18080|\/v1\/fs\//);assert.doesNotMatch(handlers,/express\s*\(|FastAPI|127\.0\.0\.1:18080|\/v1\/fs\/|ipcMain\.handle\(['"][^'"]*(?:shell|execute|exec)['"]/i);
});
