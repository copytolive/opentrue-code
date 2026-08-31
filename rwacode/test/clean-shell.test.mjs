import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/clean-shell.css', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/workspace-ui.js', import.meta.url), 'utf8');

test('approved screenshot keeps Explorer, native Browser and Preview as the three primary surfaces', () => {
  assert.match(html, /id="filesPanel"/);
  assert.match(html, /class="browser-panel"/);
  assert.match(html, /id="rightPanel"/);
  assert.match(html, /id="addressInput"/);
  assert.match(html, /id="previewSurface"/);
  assert.match(html, /id="previewTabButton"/);
  assert.match(html, /id="inspectorTabButton"/);
});

test('screenshot geometry uses a 65px header with wide Explorer and Preview rails', () => {
  assert.match(css, /--files-w:370px/);
  assert.match(css, /--right-w:416px/);
  assert.match(css, /--top-h:65px/);
  assert.match(css, /--tab-h:56px/);
  assert.match(css, /--toolbar-h:57px/);
});

test('profile and verbose bridge surfaces stay hidden without removing runtime compatibility nodes', () => {
  assert.match(css, /\.profile-wrap\{display:none!important\}/);
  assert.match(css, /\.signals-panel\{display:none!important\}/);
  assert.match(css, /\.partition-badge,\.bridge-badge\{display:none!important\}/);
  assert.match(html, /id="profileList"/);
  assert.match(html, /id="signalAiBridge"/);
});

test('one real provider tab remains visible like a normal browser instead of collapsing the tab row', () => {
  assert.match(html, /<section class="browser-panel">\s*<nav class="tab-strip">/s);
  assert.doesNotMatch(css, /\.tab-strip:has\(\.tab:only-child\)/);
  assert.match(html, /id="newTabButton"/);
});

test('Files and Preview widths are resizable by pointer and keyboard and persist locally', () => {
  assert.match(ui, /installResizer\(files, 'files'\)/);
  assert.match(ui, /installResizer\(right, 'right'\)/);
  assert.match(ui, /pointerdown/);
  assert.match(ui, /ArrowLeft/);
  assert.match(ui, /ArrowRight/);
  assert.match(ui, /localStorage\.setItem\(`rwacode:\$\{side\}-width`/);
});

test('Explorer context menu remains operational and is positioned at the pointer', () => {
  assert.match(ui, /fileTree\.addEventListener\('contextmenu'/);
  assert.match(ui, /fileActions\.style\.left/);
  assert.match(ui, /fileActions\.style\.top/);
  assert.match(html, /Add selected file to Chat/);
});

test('selected local file goes directly to the active AI composer without the Send-to-AI modal', () => {
  assert.match(ui, /async function directSendSelectedFile/);
  assert.match(ui, /await routeToAiProvider\(\)/);
  assert.match(ui, /await api\.ai\.sendFile\(target, instruction\)/);
  assert.match(ui, /editorSend\.onclick = directSendSelectedFile/);
  assert.doesNotMatch(ui, /Send selected local file to AI/);
});

test('failed or idle Preview collapses its native view so the dark idle canvas stays visible', () => {
  assert.match(html, /Preview idle/);
  assert.match(ui, /next === 'IDLE' \|\| next === 'ERROR'/);
  assert.match(ui, /api\.preview\.setBounds\(\{ x: 0, y: 0, width: 1, height: 1 \}\)/);
  assert.match(css, /\.preview-placeholder\{/);
  assert.match(css, /linear-gradient\(145deg,#101924,#0a121c\)/);
});
