import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

test('ChatGPT Work cleanup is one-shot and allowlisted rather than a permanent DOM observer', () => {
  assert.match(bridge, /function installProviderCosmetics\(/);
  assert.match(bridge, /provider !== 'ChatGPT'/);
  assert.match(bridge, /kenali chatgpt work/);
  assert.match(bridge, /sesuaikan work untuk saya/);
  assert.doesNotMatch(bridge, /MutationObserver/);
  assert.doesNotMatch(bridge, /observer\.observe/);
  assert.doesNotMatch(preload, /executeJavaScript|providerCosmetics|cosmeticScript/);
});

test('provider cosmetics never hide or rewrite the real composer or conversation messages', () => {
  assert.match(bridge, /const hasComposer = !!candidate\.querySelector/);
  assert.match(bridge, /!hasComposer/);
  assert.doesNotMatch(bridge, /node\.textContent = task/);
  assert.doesNotMatch(bridge, /rwacodeTaskOnly/);
});
