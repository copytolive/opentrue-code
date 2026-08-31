import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');

const invokeChannels = [
  'app:getState',
  'profiles:list', 'profiles:activate', 'profiles:add', 'profiles:rename', 'profiles:clear', 'profiles:delete',
  'browser:newTab', 'browser:switchTab', 'browser:closeTab', 'browser:navigate', 'browser:back',
  'browser:forward', 'browser:reload', 'browser:home', 'browser:openExternal', 'browser:setBounds',
  'fs:list', 'fs:read', 'fs:write', 'fs:create', 'fs:rename', 'fs:delete', 'fs:reveal', 'dialog:confirmDelete',
  'preview:setBounds', 'preview:load', 'preview:reload', 'preview:openExternal',
];

test('every preload invoke channel has a matching main-process handler', () => {
  for (const channel of invokeChannels) {
    assert.match(preload, new RegExp(`ipcRenderer\\.invoke\\(['\"]${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`), `${channel} must be exposed by preload`);
    assert.match(main, new RegExp(`ipcMain\\.handle\\(['\"]${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`), `${channel} must be implemented by main`);
  }
});

test('external web views remain sandboxed and Node-free', () => {
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
});

test('RWACode shell does not expose a localhost REST control surface', () => {
  assert.doesNotMatch(preload, /fetch\s*\(|XMLHttpRequest|axios|127\.0\.0\.1:18080|\/v1\/fs\//);
  assert.doesNotMatch(main, /express\s*\(|FastAPI|127\.0\.0\.1:18080|\/v1\/fs\//);
});
