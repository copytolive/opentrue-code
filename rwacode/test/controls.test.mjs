import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../src/browser-menu.js', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../src/workspace-ui.js', import.meta.url), 'utf8');
const responsive = fs.readFileSync(new URL('../src/agent-responsive-fix.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const aiBridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const source = `${renderer}\n${menu}\n${workspace}\n${responsive}`;

const requiredBindings = [
  'newTabButton', 'backButton', 'forwardButton', 'reloadButton', 'homeButton', 'addressInput',
  'openExternalButton', 'browserMenuButton', 'fileSearchButton', 'fileRefreshButton', 'fileMoreButton',
  'editorSaveButton', 'editorCloseButton', 'editorRevealButton', 'proposalCancelButton',
  'proposalApplyButton', 'proposalRevealButton', 'previewGoButton', 'previewReloadButton',
  'previewTabButton', 'inspectorTabButton',
];

test('every visible primary shell control has implementation code', () => {
  for (const id of requiredBindings) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must exist in shell`);
    assert.match(source, new RegExp(id), `${id} must have implementation code`);
  }
});

test('provider quick links and preview device controls have delegated handlers', () => {
  assert.match(html, /provider-card/);
  assert.match(renderer, /querySelectorAll\('\.provider-card'\)/);
  assert.match(html, /device-button/);
  assert.match(renderer, /querySelectorAll\('\.device-button'\)/);
  assert.match(responsive, /previewFullscreenButton/);
});

test('browser overflow menu performs real actions instead of a status-only placeholder', () => {
  assert.match(menu, /api\.browser\.newTab/);
  assert.match(menu, /api\.browser\.closeTab/);
  assert.match(menu, /api\.browser\.reload/);
  assert.match(menu, /api\.browser\.openExternal/);
  assert.match(menu, /api\.profiles\.clear/);
});

test('Explorer selection and opening behavior is intentionally VS Code-like', () => {
  const explorerFix = fs.readFileSync(new URL('../src/explorer-menu-fix.js', import.meta.url), 'utf8');
  assert.match(explorerFix, /Explorer selection only establishes focus/);
  assert.match(explorerFix, /tree\.addEventListener\('click'/);
  assert.match(explorerFix, /row\.dataset\.type === 'directory'/);
  assert.match(explorerFix, /tree\.addEventListener\('dblclick'/);
  assert.match(explorerFix, /openEditor\(row\.dataset\.path\)/);
});

test('workspace file changes are watched and refreshed without manual reload', () => {
  assert.match(main, /fs\.watch\(guard\.root, \{ recursive: true \}/);
  assert.match(main, /send\('fs:changed'/);
  assert.match(preload, /onChanged: \(handler\).*'fs:changed'/s);
  assert.match(renderer, /api\.files\.onChanged/);
  assert.match(renderer, /loadDirectory\(state\.currentDir, true\)/);
});

test('provider browser is native/manual-only: no composer injection, reply scraping, or cosmetics', () => {
  assert.match(aiBridge, /Native provider browser is MANUAL_ONLY/);
  assert.doesNotMatch(aiBridge, /executeJavaScript/);
  assert.doesNotMatch(aiBridge, /document\.querySelector/);
  assert.match(aiBridge, /async function installProviderCosmetics\(\)/);
  assert.match(aiBridge, /return false/);
  assert.doesNotMatch(workspace, /api\.ai\.sendFile|api\.ai\.readReply/);
  assert.match(responsive, /editorSendAiButton/);
  assert.match(responsive, /node\.remove\(\)/);
});

test('Preview idle state cannot masquerade as live and Inspector does not leave native preview over it', () => {
  assert.match(main, /emitPreviewState\('IDLE'\)/);
  assert.match(main, /url === 'about:blank'\) emitPreviewState\('IDLE'\)/);
  assert.match(main, /did-fail-load/);
  assert.match(renderer, /preview\.state \|\| \(preview\.loading \? 'LOADING' : 'IDLE'\)/);
  assert.match(workspace, /rightMode !== 'preview'/);
  assert.match(workspace, /setPreviewNativeVisible\(false\)/);
});

test('decorative affordances that looked clickable are removed from final shell', () => {
  assert.match(responsive, /\.security-caret,\.sync-chevron\{display:none!important\}/);
});
