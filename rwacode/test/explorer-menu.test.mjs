import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/explorer-menu-fix.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../src/explorer-menu-fix.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');

test('Explorer menu is forced into one bounded column without horizontal scrolling', () => {
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css, /overflow-x:hidden!important/);
  assert.match(css, /max-width:calc\(100% - 16px\)!important/);
  assert.match(css, /grid-column:1\/-1!important/);
});

test('Explorer menu closes on outside click, Escape, blur, resize, and Explorer scroll', () => {
  assert.match(js, /document\.addEventListener\('pointerdown'/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /window\.addEventListener\('blur', closeMenu\)/);
  assert.match(js, /window\.addEventListener\('resize', closeMenu\)/);
  assert.match(js, /panel\.addEventListener\('scroll', closeMenu, true\)/);
});

test('Explorer context menu opens only for a right-clicked file or folder row', () => {
  assert.match(js, /tree\.addEventListener\('contextmenu'/);
  assert.match(js, /closest\('\.file-row\[data-path\]'\)/);
  assert.match(js, /if \(!row\) \{[\s\S]*closeMenu\(\)/);
  assert.doesNotMatch(js, /file-row-more/);
  assert.doesNotMatch(js, /panelMore/);
  assert.match(css, /#fileMoreButton,[\s\S]*\.file-row-more[\s\S]*display:none!important/);
});

test('final Explorer menu patch loads after the real-Mac layer', () => {
  assert.match(html, /explorer-menu-fix\.css/);
  assert.match(html, /real-mac-ui\.js[\s\S]*explorer-menu-fix\.js/);
});
