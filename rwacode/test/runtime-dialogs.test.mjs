import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/browser-menu.js',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../src/workspace-ui.js',import.meta.url),'utf8');
const responsive=fs.readFileSync(new URL('../src/agent-responsive-fix.js',import.meta.url),'utf8');
const executableSource=source.replace(/^\s*\/\/.*$/gm,'');

test('Electron prompt replacement remains available for file naming and destructive confirmations',()=>{
  assert.match(source,/rw-dialog-backdrop/);assert.match(source,/function uiPrompt\(/);assert.match(source,/function uiConfirm\(/);assert.match(source,/await setBrowserVisible\(false\)/);assert.doesNotMatch(executableSource,/window\.prompt\(/);assert.doesNotMatch(executableSource,/window\.confirm\(/);
});

test('native provider browser has no selected-file composer routing in runtime dialogs',()=>{
  for(const text of [source,workspace,responsive]) assert.doesNotMatch(text,/sendFileToActiveAi|ensureAiProviderTab|aiProviderFromUrl|directSendSelectedFile|routeToAiProvider|api\.ai|ai:sendFile|ai:readReply|editorSendAiButton|editorImportAiButton|add-chat/);
});

test('file and profile text-entry actions use the in-app dialog fallback',()=>{
  assert.match(source,/fileAction=async function patchedFileAction/);assert.match(source,/New file name/);assert.match(source,/New folder name/);assert.match(source,/Rename local item/);assert.match(source,/New browser profile name/);assert.match(source,/Rename browser profile/);
});

test('destructive UI confirmations are explicit without renderer native confirm',()=>{
  assert.match(source,/closeEditor=async function patchedCloseEditor/);assert.match(source,/Discard unsaved changes\?/);assert.match(source,/Clear profile site data\?/);assert.match(source,/Delete browser profile\?/);assert.doesNotMatch(source,/Apply reviewed AI replacement\?/);
});

test('remote Explorer mutations are blocked in the dialog patch too',()=>{
  assert.match(source,/Remote target Explorer is read-only; use Workspace Agent ChangeSet/);
});
