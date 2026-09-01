import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const workspaceUi = fs.readFileSync(new URL('../src/workspace-ui.js', import.meta.url), 'utf8');
const agentUi = fs.readFileSync(new URL('../src/agent-ui.js', import.meta.url), 'utf8');

test('native provider-neutral browser is the primary center surface', () => {
  assert.match(html, /id="browserSurface"/);
  assert.match(html, /Browser Chat/);
  assert.match(html, /enter any HTTPS web chat URL/);
  assert.match(html, /Human-controlled · NO_AI_API/);
  assert.doesNotMatch(html, /https:\/\/chatgpt\.com|https:\/\/claude\.ai|https:\/\/gemini\.google\.com|provider-card/);
  assert.doesNotMatch(html, /chat-first-ui\.js/);
  assert.doesNotMatch(html, /chat-first\.css/);
  assert.doesNotMatch(html, /chat-first-v2\.css/);
});

test('workspace agent remains shell-owned and never replaces provider DOM', () => {
  assert.match(html, /agent-ui\.js/);
  assert.match(agentUi, /agentCommandBar/);
  assert.doesNotMatch(agentUi, /MutationObserver|prompt-textarea|send-button|contenteditable/);
});

test('visible VS Code-like workbench controls stay wired', () => {
  for (const id of [
    'fileSearchButton','fileRefreshButton','fileMoreButton','filesCollapseButton',
    'backButton','forwardButton','reloadButton','homeButton','newTabButton',
    'previewGoButton','previewReloadButton','rightCollapseButton',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
    assert.match(`${renderer}\n${workspaceUi}`, new RegExp(id));
  }
});

test('native provider-neutral browser visibility is managed by renderer state, not a full-screen replacement shell', () => {
  assert.match(renderer, /api\.browser\.setVisible/);
  assert.doesNotMatch(html, /id="chatFirstRoot"/);
});
