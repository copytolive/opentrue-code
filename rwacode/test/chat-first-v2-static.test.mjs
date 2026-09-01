import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../src/chat-first-ui.js', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../electron/agent-runner.cjs', import.meta.url), 'utf8');
const ipc = fs.readFileSync(new URL('../electron/agent-ipc.cjs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/chat-first-v2.css', import.meta.url), 'utf8');

const requiredUiTokens = [
  'Editable Target',
  'Read-only Reference Context',
  'chatOnly:true',
  'contextSources:activeContextSources()',
  'SETUP REQUIRED',
  'official API not configured',
  'cfPreviewFullscreen',
  'cfPreviewExitFullscreen',
  "state.previewMode==='tablet'",
  "state.previewMode==='mobile'",
  "localStorage.setItem(STORE_KEY",
  "if(/^https?:\\/\\//i.test(url))",
];

test('chat-first v2 final UI contract is present', () => {
  for (const token of requiredUiTokens) assert.match(ui, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(css, /cf-preview-overlay/);
  assert.match(css, /cf-targets/);
  assert.match(css, /cf-contexts/);
});

test('explicit provider selections are provider-pure and have no CLI fallback', () => {
  assert.match(runner, /chat-first-provider-pure/);
  assert.match(runner, /cliFallback:false/);
  assert.match(runner, /RWACode will not fall back to another provider, CLI, browser scraping, cookies, or session reuse/);
  assert.doesNotMatch(runner, /runCodexPlanner|runClaudeCli|official-cli/);
});

test('target and reference context are separate IPC inputs', () => {
  assert.match(ipc, /targetSource\s*=\s*options\?\.target\s*\|\|\s*options\?\.source/);
  assert.match(ipc, /buildReferenceContext/);
  assert.match(ipc, /contextSources/);
  assert.match(ipc, /extraContextText:reference\.text/);
});

test('provider web automation invariants remain absent from chat-first code', () => {
  assert.doesNotMatch(ui, /MutationObserver|executeJavaScript|prompt-textarea|send-button|contenteditable/);
  assert.doesNotMatch(runner, /chatgpt\.com|claude\.ai|gemini\.google\.com|deepseek\.com/);
});
