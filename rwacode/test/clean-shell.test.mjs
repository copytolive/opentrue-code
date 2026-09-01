import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/clean-shell.css',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/workspace-ui.js',import.meta.url),'utf8');
const responsive=fs.readFileSync(new URL('../src/agent-responsive-fix.js',import.meta.url),'utf8');

test('approved workbench keeps Explorer native Browser and Preview as primary surfaces',()=>{
  assert.match(html,/id="filesPanel"/);assert.match(html,/class="browser-panel"/);assert.match(html,/id="rightPanel"/);assert.match(html,/id="addressInput"/);assert.match(html,/id="previewSurface"/);assert.match(html,/id="previewTabButton"/);assert.match(html,/id="inspectorTabButton"/);
});

test('legacy screenshot geometry remains available under modern hybrid override',()=>{
  assert.match(css,/--files-w:370px/);assert.match(css,/--right-w:416px/);assert.match(css,/--top-h:65px/);assert.match(css,/--tab-h:56px/);assert.match(css,/--toolbar-h:57px/);
});

test('profile and verbose runtime surfaces stay hidden without a legacy AI bridge signal',()=>{
  assert.match(css,/\.profile-wrap\{display:none!important\}/);assert.match(css,/\.signals-panel\{display:none!important\}/);assert.match(css,/\.partition-badge,\.bridge-badge\{display:none!important\}/);
  assert.match(html,/id="profileList"/);assert.doesNotMatch(html,/signalAiBridge|aiBridgeBadge|AI BRIDGE/);
});

test('one real provider tab stays visible like a normal browser',()=>{
  assert.match(html,/<section class="browser-panel">\s*<nav class="tab-strip">/s);assert.doesNotMatch(css,/\.tab-strip:has\(\.tab:only-child\)/);assert.match(html,/id="newTabButton"/);
});

test('Explorer and Preview widths are genuinely resizable and persisted',()=>{
  assert.match(ui,/installResizer\(files, 'files'\)/);assert.match(ui,/installResizer\(right, 'right'\)/);assert.match(ui,/pointerdown/);assert.match(ui,/ArrowLeft/);assert.match(ui,/ArrowRight/);assert.match(ui,/localStorage\.setItem\(`rwacode:\$\{side\}-width`/);assert.match(responsive,/restoreRailWidths/);
});

test('Explorer overflow menus are positioned for context and more buttons',()=>{
  assert.match(ui,/function placeMenuAt/);assert.match(ui,/fileTree\.addEventListener\('contextmenu'/);assert.match(ui,/file-row-more/);assert.match(ui,/fileMoreButton\.addEventListener\('click'/);
});

test('Preview and Inspector switch tabs and hide native Preview while Inspector is active',()=>{
  assert.match(ui,/function selectRightTab/);assert.match(ui,/previewTabButton\.onclick/);assert.match(ui,/inspectorTabButton\.onclick/);assert.match(ui,/setPreviewNativeVisible\(preview\)/);assert.match(ui,/api\.preview\.setBounds\(\{ x:0, y:0, width:1, height:1 \}\)/);
});

test('native provider pages stay manual and production UI contains no DOM bridge actions',()=>{
  assert.doesNotMatch(ui,/api\.ai\.sendFile|api\.ai\.readReply|directSendSelectedFile|routeToAiProvider/);
  assert.doesNotMatch(html,/data-action="ai-send"|data-action="ai-import"|Add selected file to Chat|Review latest AI change|proposalPanel/);
  assert.doesNotMatch(responsive,/add-chat|ai-send|ai-import|editorSendAiButton|editorImportAiButton|proposalPanel/);
});

test('failed or idle Preview collapses native view so dark idle canvas stays visible',()=>{
  assert.match(html,/Preview idle/);assert.match(ui,/next === 'IDLE' \|\| next === 'ERROR'/);assert.match(css,/\.preview-placeholder\{/);assert.match(css,/linear-gradient\(145deg,#101924,#0a121c\)/);
});
