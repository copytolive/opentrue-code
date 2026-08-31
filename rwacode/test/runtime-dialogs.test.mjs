import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/browser-menu.js', import.meta.url), 'utf8');
const executableSource = source.replace(/^\s*\/\/.*$/gm, '');

test('Electron prompt replacement uses an in-app async dialog', () => {
  assert.match(source, /rw-dialog-backdrop/);
  assert.match(source, /function uiPrompt\(/);
  assert.match(source, /function uiConfirm\(/);
  assert.match(source, /await setBrowserVisible\(false\)/);
  assert.doesNotMatch(executableSource, /window\.prompt\(/);
  assert.doesNotMatch(executableSource, /window\.confirm\(/);
});

test('Send to AI asks before revealing the provider and inserts only selected file context', () => {
  assert.match(source, /async function sendFileToActiveAi\(/);
  assert.match(source, /Only this file will be shared/);
  assert.match(source, /await uiPrompt\(/);
  assert.match(source, /await closeEditor\(false\)/);
  assert.match(source, /api\.ai\.sendFile\(target, instruction\)/);
  assert.match(source, /press Send manually/);
});

test('file and profile text-entry actions are routed through the in-app dialog', () => {
  assert.match(source, /fileAction = async function patchedFileAction/);
  assert.match(source, /New file name/);
  assert.match(source, /New folder name/);
  assert.match(source, /Rename local item/);
  assert.match(source, /New browser profile name/);
  assert.match(source, /Rename browser profile/);
});

test('destructive local UI confirmation no longer depends on renderer native confirm', () => {
  assert.match(source, /closeEditor = async function patchedCloseEditor/);
  assert.match(source, /Discard unsaved changes\?/);
  assert.match(source, /Apply reviewed AI replacement\?/);
  assert.match(source, /Clear profile site data\?/);
  assert.match(source, /Delete browser profile\?/);
});
