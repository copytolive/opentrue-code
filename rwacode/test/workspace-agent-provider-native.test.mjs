import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const aiBridge = fs.readFileSync(new URL('../electron/ai-bridge.cjs', import.meta.url), 'utf8');
const agentIpc = fs.readFileSync(new URL('../electron/agent-ipc.cjs', import.meta.url), 'utf8');
const agentUi = fs.readFileSync(new URL('../src/agent-ui.js', import.meta.url), 'utf8');
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
  assert.match(agentIpc, /agent:getStatus/);
  assert.match(agentIpc, /agent:plan/);
  assert.match(agentIpc, /agent:apply/);
  assert.match(agentIpc, /agent:undo/);
  assert.match(agentIpc, /agent:githubAction/);
  assert.doesNotMatch(agentIpc, /http\.createServer|express\(|fastify\(|listen\(|child_process|exec\(|spawn\(/);
  assert.match(preload, /agent:\s*\{/);
  assert.match(preload, /githubAction/);
  assert.doesNotMatch(preload, /child_process|exec\(|spawn\(|require\(['"]fs['"]\)/);
});

test('Workspace Agent command surface loads in the RWACode shell', () => {
  assert.match(html, /<script src="\.\/agent-ui\.js"><\/script>/);
  for (const id of ['agentCommandBar','agentTaskInput','agentRunButton','agentUndoButton','agentApplyButton','agentDiff']) {
    assert.match(agentUi, new RegExp(id));
  }
  assert.match(agentUi, /@Local/);
  assert.match(agentUi, /@GitHub/);
  assert.match(agentUi, /agentSourceLocator/);
  assert.match(agentUi, /api\.preview\.reload\(\)/);
  assert.match(agentUi, /fileRefreshButton/);
});

test('GitHub commit push and PR remain explicit shell-owned button actions', () => {
  for (const id of ['agentCommitButton','agentPushButton','agentPrButton','agentCommitMessage','agentPrTitle']) {
    assert.match(agentUi, new RegExp(id));
  }
  assert.match(agentUi, /agentCommitButton'\)\.onclick\s*=\s*commitGitHub/);
  assert.match(agentUi, /agentPushButton'\)\.onclick\s*=\s*pushGitHub/);
  assert.match(agentUi, /agentPrButton'\)\.onclick\s*=\s*openGitHubPr/);
  assert.doesNotMatch(agentUi, /setTimeout\([^\n]*githubAction|setInterval\([^\n]*githubAction/);
});
