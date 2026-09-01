import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const aiBridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const agentIpc = fs.readFileSync(new URL('../electron/agent-ipc.cjs', import.meta.url), 'utf8');
const agentUi = fs.readFileSync(new URL('../src/agent-ui.js', import.meta.url), 'utf8');
const agentResponsiveFix = fs.readFileSync(new URL('../src/agent-responsive-fix.js', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

test('Workspace Agent never installs provider-wide click keydown or MutationObserver interception', () => {
  assert.doesNotMatch(aiBridge, /MutationObserver/);
  assert.doesNotMatch(aiBridge, /addEventListener\(\s*['"](?:click|keydown)['"]/);
  assert.doesNotMatch(aiBridge, /stopImmediatePropagation\(|stopPropagation\(|preventDefault\(/);
  assert.doesNotMatch(agentIpc, /executeJavaScript|MutationObserver|stopImmediatePropagation|stopPropagation|preventDefault/);
});

test('Command Bar Enter handling is scoped to the RWACode-owned input only', () => {
  assert.match(agentUi, /agentTaskInput/);
  assert.match(agentUi, /el\('agentTaskInput'\)\.addEventListener\('keydown'/);
  assert.match(agentUi, /event\.preventDefault\(\); runTask\(\)/);
  assert.doesNotMatch(agentUi, /document\.addEventListener\(['"]keydown['"]/);
  assert.doesNotMatch(agentUi, /querySelectorAll\([^\n]*(?:prompt-textarea|contenteditable|send-button)/i);
});

test('agent bridge is narrow IPC with no localhost server or generic shell endpoint', () => {
  for (const channel of ['agent:getStatus','agent:plan','agent:apply','agent:undo','agent:githubAction','agent:driveAction']) assert.match(agentIpc, new RegExp(channel));
  assert.doesNotMatch(agentIpc, /http\.createServer|express\(|fastify\(|listen\(|child_process|exec\(|spawn\(/);
  assert.match(preload, /agent:\s*\{/);
  assert.match(preload, /githubAction/);
  assert.match(preload, /driveAction/);
  assert.doesNotMatch(preload, /child_process|exec\(|spawn\(|require\(['"]fs['"]\)/);
});

test('Workspace Agent command surface loads Local GitHub and Google Drive sources in the RWACode shell', () => {
  assert.match(html, /<script src="\.\/agent-ui\.js"><\/script>/);
  assert.match(html, /<script src="\.\/agent-responsive-fix\.js"><\/script>/);
  for (const id of ['agentCommandBar','agentTaskInput','agentRunButton','agentUndoButton','agentApplyButton','agentDiff','agentDriveSyncButton']) assert.match(agentUi, new RegExp(id));
  assert.match(agentUi, /@Local/);
  assert.match(agentUi, /@GitHub/);
  assert.match(agentUi, /@GoogleDrive/);
  assert.match(agentUi, /agentSourceLocator/);
  assert.match(agentUi, /api\.preview\.reload\(\)/);
  assert.match(agentUi, /fileRefreshButton/);
});

test('GitHub commit push and PR remain explicit shell-owned button actions', () => {
  for (const id of ['agentCommitButton','agentPushButton','agentPrButton','agentCommitMessage','agentPrTitle']) assert.match(agentUi, new RegExp(id));
  assert.match(agentUi, /agentCommitButton'\)\.onclick\s*=\s*commitGitHub/);
  assert.match(agentUi, /agentPushButton'\)\.onclick\s*=\s*pushGitHub/);
  assert.match(agentUi, /agentPrButton'\)\.onclick\s*=\s*openGitHubPr/);
  assert.doesNotMatch(agentUi, /setTimeout\([^\n]*githubAction|setInterval\([^\n]*githubAction/);
});

test('Google Drive write-back is an explicit shell-owned Sync to Drive action', () => {
  assert.match(agentUi, /agentDriveSyncButton/);
  assert.match(agentUi, /agentDriveSyncButton'\)\.onclick\s*=\s*syncGoogleDrive/);
  assert.match(agentUi, /api\.agent\.driveAction\(appliedId, 'sync'/);
  assert.match(agentUi, /mirror only until Sync to Drive/);
  assert.doesNotMatch(agentUi, /setTimeout\([^\n]*driveAction|setInterval\([^\n]*driveAction/);
});

test('Undo remains visible when the center pane is too narrow for one command row', () => {
  assert.match(agentResponsiveFix, /\.rw-agent-row\{flex-wrap:wrap!important/);
  assert.match(agentResponsiveFix, /#agentUndoButton\{visibility:visible!important;display:inline-flex!important/);
  assert.match(agentResponsiveFix, /\.rw-agent-input\{flex:1 1 220px;min-width:180px\}/);
  assert.doesNotMatch(agentResponsiveFix, /querySelector|addEventListener|MutationObserver|preventDefault/);
});
