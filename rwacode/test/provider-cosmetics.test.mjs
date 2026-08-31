import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

test('ChatGPT Work onboarding cleanup is fixed and allowlisted rather than a generic renderer primitive', () => {
  assert.match(bridge, /function installProviderCosmetics\(/);
  assert.match(bridge, /provider !== 'ChatGPT'/);
  assert.match(bridge, /kenali chatgpt work/);
  assert.match(bridge, /sesuaikan work untuk saya/);
  assert.match(bridge, /MutationObserver/);
  assert.doesNotMatch(preload, /executeJavaScript|providerCosmetics|cosmeticScript/);
});

test('provider cosmetics never hide the real composer', () => {
  assert.match(bridge, /const hasComposer = !!candidate\.querySelector/);
  assert.match(bridge, /!hasComposer/);
});
