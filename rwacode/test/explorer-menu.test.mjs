import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/explorer-menu-fix.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../src/explorer-menu-fix.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');

test('legacy Explorer action panel can never render', () => {
  assert.match(css, /#fileActions\{[\s\S]*display:none!important/);
  assert.match(css, /pointer-events:none!important/);
  assert.match(js, /MutationObserver/);
  assert.match(js, /legacyMenu\.classList\.add\('hidden'\)/);
});

test('Explorer context menu is created only for a direct row right-click', () => {
  assert.match(js, /tree\.addEventListener\('contextmenu'/);
  assert.match(js, /closest\('\.file-row\[data-path\]'\)/);
  assert.match(js, /event\.stopImmediatePropagation\(\)/);
  assert.match(js, /document\.createElement\('div'\)/);
  assert.match(js, /rwExplorerContextMenu/);
  assert.match(js, /document\.body\.appendChild\(menu\)/);
});

test('dynamic context menu follows the pointer in viewport coordinates', () => {
  assert.match(css, /\.rw-explorer-context-menu\{[\s\S]*position:fixed/);
  assert.match(js, /window\.innerWidth - rect\.width/);
  assert.match(js, /window\.innerHeight - rect\.height/);
  assert.match(js, /menu\.style\.left/);
  assert.match(js, /menu\.style\.top/);
});

test('clicked file or folder becomes the exact action target without rerender', () => {
  assert.match(js, /state\.selectedPath = row\.dataset\.path/);
  assert.match(js, /row\.classList\.add\('selected'\)/);
  assert.doesNotMatch(js, /renderDirectory\(/);
  assert.match(js, /data-real-action/);
  assert.match(js, /source\.click\(\)/);
});

test('context menu closes on outside click, Escape, blur, resize, and tree scroll', () => {
  assert.match(js, /document\.addEventListener\('pointerdown'/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /window\.addEventListener\('blur', closeMenu\)/);
  assert.match(js, /window\.addEventListener\('resize', closeMenu\)/);
  assert.match(js, /tree\.addEventListener\('scroll', closeMenu, true\)/);
});

test('final Explorer patch still loads after the real-Mac action layer', () => {
  assert.match(html, /explorer-menu-fix\.css/);
  assert.match(html, /real-mac-ui\.js[\s\S]*explorer-menu-fix\.js/);
});
