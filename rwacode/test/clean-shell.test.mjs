import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/clean-shell.css', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/workspace-ui.js', import.meta.url), 'utf8');

test('clean shell keeps Files, normal Browser and Preview as the three primary surfaces', () => {
  assert.match(html, /id="filesPanel"/);
  assert.match(html, /class="browser-panel"/);
  assert.match(html, /id="rightPanel"/);
  assert.match(html, /id="addressInput"/);
  assert.match(html, /id="previewSurface"/);
});

test('profile and verbose signal surfaces are hidden without removing runtime compatibility nodes', () => {
  assert.match(css, /\.profile-wrap\{display:none!important\}/);
  assert.match(css, /\.signals-panel\{display:none!important\}/);
  assert.match(css, /\.partition-badge,\.bridge-badge\{display:none!important\}/);
  assert.match(html, /id="profileList"/);
  assert.match(html, /id="signalAiBridge"/);
});

test('single real browser tab does not waste a dedicated strip', () => {
  assert.match(css, /\.tab-strip:has\(\.tab:only-child\)/);
});

test('Files and Preview widths are resizable by pointer and keyboard', () => {
  assert.match(ui, /installResizer\(files, 'files'\)/);
  assert.match(ui, /installResizer\(right, 'right'\)/);
  assert.match(ui, /pointerdown/);
  assert.match(ui, /ArrowLeft/);
  assert.match(ui, /ArrowRight/);
});

test('Explorer context menu remains operational and is positioned at the pointer', () => {
  assert.match(ui, /fileTree\.addEventListener\('contextmenu'/);
  assert.match(ui, /fileActions\.style\.left/);
  assert.match(ui, /fileActions\.style\.top/);
});
