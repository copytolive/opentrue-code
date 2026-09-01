import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../src/workspace-ui.js', import.meta.url), 'utf8');
const responsive = fs.readFileSync(new URL('../src/agent-responsive-fix.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const agent = fs.readFileSync(new URL('../src/agent-ui.js', import.meta.url), 'utf8');

function has(id) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `${id} missing from shell`);
}

test('native center remains a browser surface and not a synthetic provider chat', () => {
  has('browserSurface');
  has('addressInput');
  assert.doesNotMatch(html, /chat-first-ui\.js|chat-first-v2\.css|id="chatFirstRoot"/);
  assert.doesNotMatch(agent, /prompt-textarea|send-button|contenteditable|executeJavaScript|MutationObserver/);
});

test('Preview/Inspector controls are functional rather than decorative', () => {
  has('previewTabButton');
  has('inspectorTabButton');
  has('previewGoButton');
  has('previewReloadButton');
  assert.match(workspace, /previewTabButton\.onclick = \(\) => selectRightTab\('preview'\)/);
  assert.match(workspace, /inspectorTabButton\.onclick = \(\) => selectRightTab\('inspector'\)/);
  assert.match(workspace, /rightMode !== 'preview'/);
  assert.match(responsive, /previewFullscreenButton/);
  assert.match(responsive, /event\.key === 'Escape'/);
});

test('visible Explorer overflow controls receive deterministic menu placement', () => {
  has('fileMoreButton');
  assert.match(workspace, /function placeMenuAt/);
  assert.match(workspace, /file-row-more/);
  assert.match(workspace, /fileMoreButton\.addEventListener\('click'/);
});

test('saved rail widths win over hybrid CSS defaults so drag resize really changes geometry', () => {
  assert.match(workspace, /setProperty\(variable, `\$\{Math\.round\(value\)\}px`, 'important'\)/);
  assert.match(responsive, /restoreRailWidths/);
  assert.match(responsive, /setProperty\('--files-w'.*'important'\)/s);
  assert.match(responsive, /setProperty\('--right-w'.*'important'\)/s);
});

test('native provider page has no production DOM write/read/cosmetic path', () => {
  assert.match(bridge, /MANUAL_ONLY/);
  assert.doesNotMatch(bridge, /executeJavaScript/);
  assert.doesNotMatch(bridge, /document\.querySelector/);
  assert.doesNotMatch(bridge, /execCommand/);
  assert.match(bridge, /installProviderCosmetics[\s\S]*return false/);
});

test('misleading click affordances and old provider-DOM bridge actions are removed', () => {
  assert.match(responsive, /\.security-caret,\.sync-chevron\{display:none!important\}/);
  assert.match(responsive, /data-real-action=\\?"add-chat/);
  assert.match(responsive, /editorSendAiButton/);
  assert.match(responsive, /editorImportAiButton/);
  assert.match(responsive, /node\.remove\(\)/);
});
