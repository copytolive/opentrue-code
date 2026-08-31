import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bridgeSource = await readFile(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const explorerSource = await readFile(new URL('../src/explorer-menu-fix.js', import.meta.url), 'utf8');
const contextSource = await readFile(new URL('../electron/project-context.cjs', import.meta.url), 'utf8');
const {
  buildProjectTaskEnvelope,
  composerSelectors,
  PROJECT_TASK_START,
  PROJECT_TASK_END,
} = require('../electron/ai-bridge.cjs');
const {
  MAX_CONTEXT_FILES,
  MAX_CONTEXT_BYTES,
  normalizeWords,
} = require('../electron/project-context.cjs');

test('project context is bounded and expands natural UI language into useful code-search terms', () => {
  assert.equal(MAX_CONTEXT_FILES, 10);
  assert.equal(MAX_CONTEXT_BYTES, 176 * 1024);
  const words = normalizeWords('gambarnya kurang ke kiri');
  for (const word of ['gambar','image','visual','kiri','left','layout','css']) assert.ok(words.includes(word));
  assert.match(contextSource, /MAX_INDEX_FILES = 2600/);
  assert.match(contextSource, /createPathGuard\(root\)/);
  assert.doesNotMatch(contextSource, /child_process|exec\(|spawn\(/);
});

test('provider composer support includes the current contenteditable ChatGPT composer', () => {
  const selectors = composerSelectors('ChatGPT');
  assert.ok(selectors.includes('div.ProseMirror[contenteditable="true"]'));
  assert.ok(selectors.includes('[contenteditable="true"][role="textbox"]'));
  assert.ok(selectors.includes('#prompt-textarea'));
});

test('project task envelope carries local project context plus only the user task as the visible task section', () => {
  const envelope = buildProjectTaskEnvelope('[RWACODE PROJECT CONTEXT]\nFILE=A\n[END RWACODE PROJECT CONTEXT]', 'gambar kurang ke kiri');
  assert.match(envelope, /RWACODE PROJECT CONTEXT/);
  assert.match(envelope, new RegExp(PROJECT_TASK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(envelope, /gambar kurang ke kiri/);
  assert.ok(envelope.endsWith(PROJECT_TASK_END));
});

test('Explorer left click no longer injects or flashes local context into the provider composer', () => {
  assert.match(explorerSource, /Explorer selection only establishes focus/);
  assert.match(explorerSource, /tree\.addEventListener\('click'/);
  assert.doesNotMatch(explorerSource, /scheduleActiveContext/);
  assert.doesNotMatch(explorerSource, /api\.ai\.sendFile/);
  assert.match(explorerSource, /tree\.addEventListener\('dblclick'/);
});

test('project-aware context is resolved only when the user actually presses Enter or clicks Send', () => {
  assert.match(bridgeSource, /document\.addEventListener\('keydown', onKeyDown, true\)/);
  assert.match(bridgeSource, /document\.addEventListener\('click', onClick, true\)/);
  assert.match(bridgeSource, /event\.preventDefault\(\)/);
  assert.match(bridgeSource, /console\.info\(marker\)/);
  assert.match(bridgeSource, /projectContext\.build\(task\)/);
  assert.match(bridgeSource, /buildProjectTaskEnvelope\(context\.text, task\)/);
  assert.match(bridgeSource, /submitComposer\(wc, provider, combined, task, nonce\)/);
  assert.match(bridgeSource, /state\.bypass/);
});
