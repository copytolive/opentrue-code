import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/browser-menu.js', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../src/workspace-ui.js', import.meta.url), 'utf8');
const responsive = fs.readFileSync(new URL('../src/agent-responsive-fix.js', import.meta.url), 'utf8');
const executableSource = source.replace(/^\s*\/\/.*$/gm, '');

test('Electron prompt replacement remains available for file naming and destructive confirmations', () => {
  assert.match(source, /rw-dialog-backdrop/);
  assert.match(source, /function uiPrompt\(/);
  assert.match(source, /function uiConfirm\(/);
  assert.match(source, /await setBrowserVisible\(false\)/);
  assert.doesNotMatch(executableSource, /window\.prompt\(/);
  assert.doesNotMatch(executableSource, /window\.confirm\(/);
});

test('native provider browser has no selected-file composer routing in the visible workspace shell', () => {
  assert.doesNotMatch(workspace, /directSendSelectedFile|routeToAiProvider|api\.ai\.sendFile|api\.ai\.readReply/);
  assert.match(responsive, /removeProviderDomActions/);
  assert.match(responsive, /editorSendAiButton/);
  assert.match(responsive, /editorImportAiButton/);
  assert.match(responsive, /node\.remove\(\)/);
});

test('file and profile text-entry actions still use the in-app dialog fallback', () => {
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
