import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bridgeSource = await readFile(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const explorerSource = await readFile(new URL('../src/explorer-menu-fix.js', import.meta.url), 'utf8');
const {
  buildMultiFilePrompt,
  wrapActiveContext,
  ACTIVE_CONTEXT_START,
  ACTIVE_CONTEXT_END,
  MAX_ACTIVE_CONTEXT_FILES,
} = require('../electron/ai-bridge.cjs');

test('active context supports a bounded multi-file folder bundle', () => {
  assert.equal(MAX_ACTIVE_CONTEXT_FILES, 8);
  const body = buildMultiFilePrompt([
    { path: '04_RECEIPTS/a.txt', content: 'A' },
    { path: '04_RECEIPTS/b.txt', content: 'B' },
  ], 'explain this folder');
  assert.match(body, /Selected local files: 2/);
  assert.match(body, /BEGIN 04_RECEIPTS\/a\.txt/);
  assert.match(body, /BEGIN 04_RECEIPTS\/b\.txt/);
  const wrapped = wrapActiveContext(body);
  assert.ok(wrapped.startsWith(ACTIVE_CONTEXT_START));
  assert.ok(wrapped.endsWith(ACTIVE_CONTEXT_END));
});

test('provider composer replaces the previous RWACode active context instead of stacking duplicates', () => {
  assert.match(bridgeSource, /stripPreviousContext/);
  assert.match(bridgeSource, /source\.indexOf\(activeStart\)/);
  assert.match(bridgeSource, /source\.indexOf\(activeEnd/);
  assert.match(bridgeSource, /Array\.isArray\(relativePath\)/);
  assert.match(bridgeSource, /submitted:false/);
  assert.doesNotMatch(bridgeSource, /send\.click\(\)/);
});

test('one Explorer left click activates local context while keeping provider browser as the primary surface', () => {
  assert.match(explorerSource, /tree\.addEventListener\('click',[\s\S]*true\);/);
  assert.match(explorerSource, /scheduleActiveContext\(row\)/);
  assert.match(explorerSource, /api\.ai\.sendFile\(\s*bundle\.paths/);
  assert.match(explorerSource, /api\.ai\.sendFile\(\s*relativePath/);
  assert.match(explorerSource, /event\.stopImmediatePropagation\(\)/);
  assert.match(explorerSource, /tree\.addEventListener\('dblclick'/);
});
