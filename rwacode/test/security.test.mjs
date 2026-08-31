import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPathGuard } = require('../lib/path-guard.cjs');
const { providerFromUrl, buildPrompt, MAX_AI_CONTEXT_BYTES } = require('../electron/ai-bridge.cjs');

test('path guard allows files inside root and rejects read/write escape attempts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rwacode-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rwacode-outside-'));
  fs.writeFileSync(path.join(root, 'inside.txt'), 'ok');
  fs.writeFileSync(path.join(outside, 'outside.txt'), 'no');
  fs.symlinkSync(outside, path.join(root, 'escape-link'));
  fs.symlinkSync(path.join(outside, 'outside.txt'), path.join(root, 'write-escape.txt'));
  const guard = createPathGuard(root);

  assert.equal(guard.resolveExisting('inside.txt'), fs.realpathSync.native(path.join(root, 'inside.txt')));
  assert.throws(() => guard.resolveExisting('../outside.txt'));
  assert.throws(() => guard.resolveExisting('escape-link/outside.txt'));
  assert.throws(() => guard.resolveExisting('/etc/passwd'));
  assert.throws(() => guard.resolveWritable('../new.txt'));
  assert.throws(() => guard.resolveWritable('write-escape.txt'));
  assert.equal(guard.resolveWritable('new-inside.txt'), path.join(fs.realpathSync.native(root), 'new-inside.txt'));
});

test('external browser webContents stay sandboxed and Node-free', () => {
  const source = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.doesNotMatch(source, /http\.createServer|express\(|fastify\(|listen\(/);
});

test('local AI bridge is provider-allowlisted and bounded', () => {
  assert.equal(providerFromUrl('https://chatgpt.com/'), 'ChatGPT');
  assert.equal(providerFromUrl('https://claude.ai/new'), 'Claude');
  assert.equal(providerFromUrl('https://gemini.google.com/app'), 'Gemini');
  assert.equal(providerFromUrl('https://example.com/'), null);
  assert.equal(MAX_AI_CONTEXT_BYTES, 256 * 1024);
  const prompt = buildPrompt('demo.txt', 'hello', 'review');
  assert.match(prompt, /Selected file: demo\.txt/);
  assert.match(prompt, /Security boundary: you are receiving only the selected file content/);
});

test('AI bridge can only read through the existing root-locked file reader', () => {
  const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const bridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
  assert.match(main, /const target = guard\.resolveExisting\(relativePath\)/);
  assert.match(main, /createAiBridge\(\{ getActiveWebContents: activeWebContents, readTextFile \}\)/);
  assert.match(bridge, /const file = await readTextFile\(relativePath\)/);
  assert.doesNotMatch(bridge, /require\(['"]node:fs['"]\)|require\(['"]fs['"]\)/);
});

test('preload exposes only explicit allowlisted IPC methods', () => {
  const source = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  assert.match(source, /contextBridge\.exposeInMainWorld\('rwacode'/);
  assert.doesNotMatch(source, /child_process|exec\(|spawn\(|require\(['"]fs['"]\)|executeJavaScript/);
});
