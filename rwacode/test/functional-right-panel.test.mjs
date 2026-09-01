import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const bootstrap = read('electron/bootstrap.cjs');
const preload = read('electron/preload.cjs');
const observability = read('electron/preview-observability.cjs');
const panel = read('src/functional-right-panel.js');
const css = read('src/functional-right-panel.css');
const pkg = JSON.parse(read('package.json'));

test('functional preview assets ship and are syntax checked', () => {
  assert.match(preload, /functional-right-panel\.css/);
  assert.match(preload, /functional-right-panel\.js/);
  assert.match(pkg.scripts.check, /node --check electron\/preview-observability\.cjs/);
  assert.match(pkg.scripts.check, /node --check src\/functional-right-panel\.js/);
  assert.match(bootstrap, /require\('\.\/preview-observability\.cjs'\)/);
});

test('console and network telemetry are isolated to Preview, never Browser Chat provider sessions', () => {
  assert.match(observability, /persist:rwacode-preview/);
  assert.match(observability, /wc\.session !== previewSession/);
  assert.match(observability, /preview:console/);
  assert.match(observability, /preview:network/);
  assert.doesNotMatch(observability, /rwacode-profile-/);
  assert.doesNotMatch(observability, /requestHeaders|cookie|authorization/i);
  assert.match(preload, /onConsole: \(handler\).*preview:console/);
  assert.match(preload, /onNetwork: \(handler\).*preview:network/);
});

test('right rail tabs are functional and backed by runtime events', () => {
  assert.match(panel, /createTab\('consoleTabButton', 'Console'\)/);
  assert.match(panel, /createTab\('networkTabButton', 'Network'\)/);
  assert.match(panel, /api\.preview\?\.onConsole/);
  assert.match(panel, /api\.preview\?\.onNetwork/);
  assert.match(panel, /api\.preview\?\.onState/);
  assert.match(panel, /api\.files\?\.onChanged/);
  assert.match(panel, /api\.agent\?\.onChanged/);
  assert.match(panel, /refreshInspector/);
  assert.match(panel, /refreshGitStatus/);
});

test('full screen preview and Git actions route through existing authoritative controls', () => {
  assert.match(panel, /previewFullScreenButton/);
  assert.match(panel, /document\.body\.classList\.toggle\('preview-focus'/);
  assert.match(panel, /agentGitActions/);
  assert.match(panel, /agentCommitMessage/);
  assert.doesNotMatch(panel, /api\.agent\.githubAction\(/);
});

test('context source card cannot shrink and clip Google Drive row', () => {
  assert.match(css, /\.pro-sidebar-card\{flex:0 0 auto!important\}/);
  assert.match(css, /\.pro-context-card\{min-height:216px!important\}/);
  assert.match(css, /\.files-panel\{overflow-y:auto!important/);
});

test('functional workbench remains provider neutral and NO_AI_API safe', () => {
  for (const source of [panel, observability, css]) {
    assert.doesNotMatch(source, /chatgpt\.com|claude\.ai|gemini\.google\.com|api\.openai\.com|api\.anthropic\.com/i);
  }
  assert.match(panel, /Browser Chat pages remain isolated and are not inspected or scraped/);
});
