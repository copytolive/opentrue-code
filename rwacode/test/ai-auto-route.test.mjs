import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspaceUi = fs.readFileSync(new URL('../src/workspace-ui.js', import.meta.url), 'utf8');
const aiBridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const responsive = fs.readFileSync(new URL('../src/agent-responsive-fix.js', import.meta.url), 'utf8');

test('native provider pages are manual-only and are never DOM automated', () => {
  assert.match(aiBridge, /Native provider browser is MANUAL_ONLY/);
  assert.match(aiBridge, /will not .* provider DOM/);
  assert.doesNotMatch(aiBridge, /executeJavaScript/);
  assert.doesNotMatch(aiBridge, /document\.querySelector/);
  assert.doesNotMatch(aiBridge, /dispatchEvent\(new (?:InputEvent|Event)/);
  assert.doesNotMatch(aiBridge, /execCommand\(/);
});

test('provider cosmetics are a no-op so native pages are never restyled or hidden', async () => {
  const { installProviderCosmetics } = await import('../electron/ai-bridge.cjs').then((module) => module.default || module);
  assert.equal(await installProviderCosmetics(), false);
});

test('workspace shell does not route selected files into provider composers', () => {
  assert.doesNotMatch(workspaceUi, /directSendSelectedFile/);
  assert.doesNotMatch(workspaceUi, /routeToAiProvider/);
  assert.doesNotMatch(workspaceUi, /api\.ai\.sendFile/);
  assert.doesNotMatch(workspaceUi, /api\.ai\.readReply/);
});

test('legacy Add-to-Chat controls are removed from the visible workbench', () => {
  assert.match(responsive, /data-real-action=\\?"add-chat/);
  assert.match(responsive, /editorSendAiButton/);
  assert.match(responsive, /editorImportAiButton/);
  assert.match(responsive, /node\.remove\(\)/);
});
