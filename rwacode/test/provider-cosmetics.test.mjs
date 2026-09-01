import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const { installProviderCosmetics } = require('../electron/ai-bridge.cjs');

test('provider cosmetics are permanently disabled for the native browser surface', async () => {
  assert.match(bridge, /async function installProviderCosmetics\(\)/);
  assert.match(bridge, /Strict native-browser contract/);
  assert.equal(await installProviderCosmetics(), false);
  assert.doesNotMatch(bridge, /executeJavaScript|MutationObserver|observer\.observe/);
  assert.doesNotMatch(preload, /executeJavaScript|providerCosmetics|cosmeticScript/);
});

test('provider browser DOM is never hidden, rewritten, inspected, or restyled by the bridge', () => {
  assert.doesNotMatch(bridge, /document\.querySelector|querySelectorAll\(|style\.display|style\.visibility/);
  assert.doesNotMatch(bridge, /textContent\s*=|innerHTML\s*=|execCommand\(|dispatchEvent\(/);
  assert.match(bridge, /Native provider browser is MANUAL_ONLY/);
  assert.match(bridge, /return false/);
});
