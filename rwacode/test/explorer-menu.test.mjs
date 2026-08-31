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

test('Explorer menu closes on outside click, Escape, blur, and resize', () => {
  assert.match(js, /document\.addEventListener\('pointerdown'/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /window\.addEventListener\('blur', closeMenu\)/);
  assert.match(js, /window\.addEventListener\('resize', closeMenu\)/);
});

test('Explorer menu opens adjacent to row context actions and the final patch loads last', () => {
  assert.match(js, /tree\?\.addEventListener\('contextmenu'/);
  assert.match(js, /file-row-more/);
  assert.match(html, /explorer-menu-fix\.css/);
  assert.match(html, /real-mac-ui\.js[\s\S]*explorer-menu-fix\.js/);
});
