import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../src/browser-menu.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const aiBridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const source = `${renderer}\n${menu}`;

const requiredBindings = [
  'profileButton', 'addProfileButton', 'renameProfileButton', 'clearProfileButton', 'deleteProfileButton',
  'newTabButton', 'backButton', 'forwardButton', 'reloadButton', 'homeButton', 'addressInput',
  'openExternalButton', 'browserMenuButton', 'filesCollapseButton', 'rightCollapseButton',
  'fileSearchButton', 'fileRefreshButton', 'fileMoreButton', 'editorSaveButton', 'editorCloseButton',
  'editorRevealButton', 'proposalCancelButton', 'proposalApplyButton', 'proposalRevealButton',
  'previewGoButton', 'previewReloadButton', 'previewExternalButton',
];

test('every primary visible control has implementation code', () => {
  for (const id of requiredBindings) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must exist in visible shell`);
    assert.match(source, new RegExp(id), `${id} must have renderer implementation`);
  }
});

test('provider quick links and preview device controls have delegated handlers', () => {
  assert.match(html, /provider-card/);
  assert.match(renderer, /querySelectorAll\('\.provider-card'\)/);
  assert.match(html, /device-button/);
  assert.match(renderer, /querySelectorAll\('\.device-button'\)/);
});

test('browser overflow menu performs real actions instead of a status-only placeholder', () => {
  assert.match(menu, /api\.browser\.newTab/);
  assert.match(menu, /api\.browser\.closeTab/);
  assert.match(menu, /api\.browser\.reload/);
  assert.match(menu, /api\.browser\.openExternal/);
  assert.match(menu, /api\.profiles\.clear/);
});

test('single-click file explorer opens folders and files', () => {
  assert.match(renderer, /entry\.type === 'directory'\) await loadDirectory\(entry\.path\)/);
  assert.match(renderer, /entry\.type === 'file'\) await openEditor\(entry\.path\)/);
  assert.match(html, /id="editorPanel"/);
  assert.match(renderer, /api\.browser\.setVisible\(false\)/);
});

test('workspace file changes are watched and refreshed without manual reload', () => {
  assert.match(main, /fs\.watch\(guard\.root, \{ recursive: true \}/);
  assert.match(main, /send\('fs:changed'/);
  assert.match(preload, /onChanged: \(handler\).*'fs:changed'/s);
  assert.match(renderer, /api\.files\.onChanged/);
  assert.match(renderer, /loadDirectory\(state\.currentDir, true\)/);
});

test('selective AI bridge sends only the chosen file and requires review before write-back', () => {
  assert.match(html, /data-action="ai-send"/);
  assert.match(html, /data-action="ai-import"/);
  assert.match(html, /id="proposalPanel"/);
  assert.match(renderer, /api\.ai\.sendFile\(target, instruction\)/);
  assert.match(renderer, /api\.ai\.readReply\(\)/);
  assert.match(renderer, /window\.confirm\(`Replace \$\{target\}/);
  assert.match(renderer, /api\.files\.write\(target, content\)/);
  assert.match(aiBridge, /MAX_AI_CONTEXT_BYTES = 256 \* 1024/);
  assert.match(aiBridge, /chatgpt\.com/);
  assert.match(aiBridge, /claude\.ai/);
  assert.match(aiBridge, /gemini\.google\.com/);
  assert.match(aiBridge, /Security boundary: you are receiving only this explicitly selected file/);
});

test('preview initial about:blank state cannot masquerade as live', () => {
  assert.match(main, /emitPreviewState\('IDLE'\)/);
  assert.match(main, /url === 'about:blank'\) emitPreviewState\('IDLE'\)/);
  assert.match(main, /did-fail-load/);
  assert.match(renderer, /preview\.state \|\| \(preview\.loading \? 'LOADING' : 'IDLE'\)/);
});
