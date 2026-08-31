import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/browser-menu.js', import.meta.url), 'utf8');

test('Send to AI auto-routes from New Tab to a usable provider tab', () => {
  assert.match(source, /function aiProviderFromUrl\(/);
  assert.match(source, /async function ensureAiProviderTab\(/);
  assert.match(source, /currentTabs = Array\.isArray\(payload\.tabs\)/);
  assert.match(source, /api\.browser\.switchTab\(existing\.id\)/);
  assert.match(source, /api\.browser\.newTab\('rwacode:\/\/newtab'\)/);
  assert.match(source, /api\.browser\.navigate\('https:\/\/chatgpt\.com\/'\)/);
  assert.match(source, /const routedProvider = await ensureAiProviderTab\(\)/);
  assert.match(source, /const result = await api\.ai\.sendFile\(target, instruction\)/);
});

test('AI auto-route does not auto-submit provider chat', () => {
  assert.match(source, /will not press Send automatically/);
  assert.doesNotMatch(source, /api\.ai\.submit/);
});
