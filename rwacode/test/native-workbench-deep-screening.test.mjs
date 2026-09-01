import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../src/workspace-ui.js',import.meta.url),'utf8');
const responsive=fs.readFileSync(new URL('../src/agent-responsive-fix.js',import.meta.url),'utf8');
const realMacUi=fs.readFileSync(new URL('../src/real-mac-ui.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
const explorerOps=fs.readFileSync(new URL('../electron/explorer-ops.cjs',import.meta.url),'utf8');
const acceptance=fs.readFileSync(new URL('../REAL_MAC_UI_ACCEPTANCE.md',import.meta.url),'utf8');
const agent=fs.readFileSync(new URL('../src/agent-ui.js',import.meta.url),'utf8');

function has(id){assert.match(html,new RegExp(`id=["']${id}["']`),`${id} missing from shell`)}

test('native center remains browser surface and not synthetic provider chat',()=>{
  has('browserSurface');has('addressInput');assert.doesNotMatch(html,/chat-first-ui\.js|chat-first-v2\.css|id="chatFirstRoot"/);assert.doesNotMatch(agent,/prompt-textarea|send-button|contenteditable|executeJavaScript|MutationObserver/);
});

test('Preview/Inspector controls are functional rather than decorative',()=>{
  has('previewTabButton');has('inspectorTabButton');has('previewGoButton');has('previewReloadButton');assert.match(workspace,/previewTabButton\.onclick = \(\) => selectRightTab\('preview'\)/);assert.match(workspace,/inspectorTabButton\.onclick = \(\) => selectRightTab\('inspector'\)/);assert.match(workspace,/rightMode !== 'preview'/);assert.match(responsive,/previewFullscreenButton/);assert.match(responsive,/event\.key==='Escape'/);
});

test('idle/error Preview and Inspector stay collapsed after later resize events',()=>{
  assert.match(responsive,/function enforcePreviewNativeBounds\(/);assert.match(responsive,/stateText==='LIVE'\|\|stateText==='LOADING'/);assert.match(responsive,/previewContent.*classList\.contains\('hidden'\)/s);assert.match(responsive,/api\.preview\.setBounds\(\{x:0,y:0,width:1,height:1\}\)/);assert.match(responsive,/window\.addEventListener\('resize'[\s\S]*enforcePreviewNativeBounds/);assert.match(responsive,/api\.preview\.onState\(\(\)=>requestAnimationFrame\(enforcePreviewNativeBounds\)\)/);
});

test('visible Explorer overflow controls receive deterministic placement',()=>{
  has('fileMoreButton');assert.match(workspace,/function placeMenuAt/);assert.match(workspace,/file-row-more/);assert.match(workspace,/fileMoreButton\.addEventListener\('click'/);
});

test('saved rail widths win over CSS defaults',()=>{
  assert.match(workspace,/setProperty\(variable, `\$\{Math\.round\(value\)\}px`, 'important'\)/);assert.match(responsive,/restoreRailWidths/);assert.match(responsive,/setProperty\('--files-w'.*'important'\)/s);assert.match(responsive,/setProperty\('--right-w'.*'important'\)/s);
});

test('native provider page has no production DOM write read or cosmetic bridge path',()=>{
  assert.doesNotMatch(main,/createAiBridge|ai:sendFile|ai:readReply|executeJavaScript|insertCSS|removeInsertedCSS|document\.querySelector/);assert.doesNotMatch(preload,/ai:sendFile|ai:readReply|providerCosmetics/);
});

test('misleading click affordances and old provider bridge actions are physically removed',()=>{
  assert.match(responsive,/\.security-caret,\.sync-chevron\{display:none!important\}/);assert.doesNotMatch(responsive,/add-chat|ai-send|ai-import|editorSendAiButton|editorImportAiButton|proposalPanel/);assert.doesNotMatch(html,/Add selected file to Chat|Review latest AI change|AI PROPOSAL|proposalPanel/);assert.doesNotMatch(explorerOps,/Add (?:File|Folder) to Chat|choose\('add-chat'\)/);assert.doesNotMatch(realMacUi,/Add (?:File|Folder) to Chat|addSelectionToChat|ensureProvider|api\.ai\.sendFile|data-real-action="add-chat"/);
});

test('real-Mac acceptance contract cannot re-authorize provider DOM automation',()=>{
  assert.match(acceptance,/Provider pages are \*\*MANUAL_ONLY\*\*/);assert.match(acceptance,/Workspace Agent Command Bar/);assert.doesNotMatch(acceptance,/inserts bounded local context directly into the active .* composer/i);assert.match(acceptance,/REAL_MAC_FINAL=PASS/);
});
