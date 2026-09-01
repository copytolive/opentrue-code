import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/native-browser-hybrid.css', import.meta.url), 'utf8');

test('modern hybrid shell is loaded without restoring the fake chat-first replacement', () => {
  assert.match(html, /native-browser-hybrid\.css/);
  assert.doesNotMatch(html, /chat-first-v2\.css/);
  assert.doesNotMatch(html, /chat-first-ui\.js/);
  assert.match(html, /id="browserSurface"/);
  assert.match(html, /id="tabs"/);
  assert.match(html, /id="addressInput"/);
});

test('hybrid styling preserves three native workbench surfaces and shell-owned agent controls', () => {
  assert.match(css, /--files-w:328px/);
  assert.match(css, /--right-w:392px/);
  assert.match(css, /\.workspace-grid/);
  assert.match(css, /\.browser-panel/);
  assert.match(css, /\.browser-surface/);
  assert.match(css, /\.rw-agent/);
  assert.match(css, /\.preview-panel/);
});

test('visual layer cannot automate or rewrite provider page content', () => {
  assert.doesNotMatch(css, /chatgpt\.com|claude\.ai|gemini\.google\.com|deepseek\.com/i);
  assert.doesNotMatch(css, /MutationObserver|executeJavaScript|send\.click|contenteditable/i);
  assert.match(css, /Shell-only styling/);
});
