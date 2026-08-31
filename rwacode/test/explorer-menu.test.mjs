import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/explorer-menu-fix.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../src/explorer-menu-fix.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');

test('Explorer menu is compact, one-column, and cannot overflow horizontally', () => {
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css, /overflow-x:hidden!important/);
  assert.match(css, /max-height:min\(68vh,560px\)!important/);
  assert.match(css, /height:30px!important/);
  assert.match(css, /grid-column:1\/-1!important/);
});

test('Explorer menu closes on outside click, Escape, blur, resize, and Explorer scroll', () => {
  assert.match(js, /document\.addEventListener\('pointerdown'/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /window\.addEventListener\('blur', closeMenu\)/);
  assert.match(js, /window\.addEventListener\('resize', closeMenu\)/);
  assert.match(js, /panel\.addEventListener\('scroll', closeMenu, true\)/);
});

test('right-click capture is the sole authoritative Explorer row trigger', () => {
  assert.match(js, /tree\.addEventListener\('contextmenu',[\s\S]*\}, true\)/);
  assert.match(js, /closest\('\.file-row\[data-path\]'\)/);
  assert.match(js, /event\.stopImmediatePropagation\(\)/);
  assert.match(js, /state\.selectedPath = path/);
  assert.match(js, /row\.classList\.add\('selected'\)/);
  assert.match(js, /menu\.classList\.remove\('hidden'\)/);
  assert.match(js, /positionMenu\(event\.clientX, event\.clientY\)/);
  assert.doesNotMatch(js, /file-row-more/);
  assert.doesNotMatch(js, /panelMore/);
  assert.match(css, /#fileMoreButton,[\s\S]*\.file-row-more[\s\S]*display:none!important/);
});

test('context menu adapts to the exact clicked file or folder', () => {
  assert.match(js, /menu\.dataset\.contextPath = path/);
  assert.match(js, /menu\.dataset\.contextType = row\.dataset\.type/);
  assert.match(js, /Add Folder to Chat/);
  assert.match(js, /Add File to Chat/);
  assert.match(js, /clipboardState\(\)/);
});

test('final Explorer menu patch loads after the real-Mac layer', () => {
  assert.match(html, /explorer-menu-fix\.css/);
  assert.match(html, /real-mac-ui\.js[\s\S]*explorer-menu-fix\.js/);
});
