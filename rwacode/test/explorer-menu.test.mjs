import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/explorer-menu-fix.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../src/explorer-menu-fix.js', import.meta.url), 'utf8');
const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const explorerOps = await readFile(new URL('../electron/explorer-ops.cjs', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');

test('legacy Explorer action panel is permanently non-rendering backend only', () => {
  assert.match(css, /#fileActions\{[\s\S]*display:none!important/);
  assert.match(css, /pointer-events:none!important/);
  assert.match(js, /legacyMenu\.classList\.add\('hidden'\)/);
  assert.doesNotMatch(js, /new\s+MutationObserver|MutationObserver\s*\(/);
});

test('right-click invokes a narrow native Electron context menu only for a real row', () => {
  assert.match(js, /tree\.addEventListener\('contextmenu'/);
  assert.match(js, /closest\('\.file-row\[data-path\]'\)/);
  assert.match(js, /event\.stopImmediatePropagation\(\)/);
  assert.match(js, /api\.explorer\.showContextMenu\(relativePath\)/);
  assert.match(preload, /showContextMenu:\s*\(relativePath\)\s*=>\s*ipcRenderer\.invoke\('explorer:contextMenu'/);
  assert.match(explorerOps, /ipcMain\.handle\('explorer:contextMenu'/);
  assert.match(explorerOps, /Menu\.buildFromTemplate/);
  assert.match(explorerOps, /menu\.popup/);
});

test('context menu open path has no renderer overlay or awaited clipboard IPC', () => {
  assert.doesNotMatch(js, /document\.createElement\(['"]div['"]\)/);
  assert.doesNotMatch(js, /rwExplorerContextMenu/);
  assert.doesNotMatch(js, /clipboardState/);
  assert.doesNotMatch(js, /async function createMenu/);
});

test('native menu preserves file/folder-specific real actions without provider-DOM chat actions', () => {
  for (const action of ['new-file','new-folder','reveal','open-terminal','cut','copy','paste','copy-path','copy-relative','rename','delete']) {
    assert.match(explorerOps, new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(explorerOps, /Open in Images Preview/);
  assert.match(explorerOps, /Find in Folder/);
  assert.match(explorerOps, /enabled:\s*canPaste/);
  assert.doesNotMatch(explorerOps, /Add (?:File|Folder) to Chat|add-chat|canChat/);
});

test('clicked row remains the exact backend action target', () => {
  assert.match(js, /state\.selectedPath = row\.dataset\.path/);
  assert.match(js, /source\.click\(\)/);
  assert.doesNotMatch(js, /renderDirectory\(/);
});

test('final Explorer patch still loads after the real-Mac action layer', () => {
  assert.match(html, /explorer-menu-fix\.css/);
  assert.match(html, /real-mac-ui\.js[\s\S]*explorer-menu-fix\.js/);
});
