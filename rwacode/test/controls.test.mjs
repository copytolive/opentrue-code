import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../src/browser-menu.js', import.meta.url), 'utf8');
const source = `${renderer}\n${menu}`;

const requiredBindings = [
  'profileButton', 'addProfileButton', 'renameProfileButton', 'clearProfileButton', 'deleteProfileButton',
  'newTabButton', 'backButton', 'forwardButton', 'reloadButton', 'homeButton', 'addressInput',
  'openExternalButton', 'browserMenuButton', 'fileSearchButton', 'fileRefreshButton', 'fileMoreButton',
  'editorSaveButton', 'previewGoButton', 'previewReloadButton', 'previewExternalButton',
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
