import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const agentIpc=fs.readFileSync(new URL('../electron/agent-ipc.cjs',import.meta.url),'utf8');
const agentUi=fs.readFileSync(new URL('../src/agent-ui.js',import.meta.url),'utf8');
const agentResponsiveFix=fs.readFileSync(new URL('../src/agent-responsive-fix.js',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');

test('Workspace Agent never installs provider-wide click keydown or DOM interception',()=>{
  assert.doesNotMatch(main,/MutationObserver|executeJavaScript|prompt-textarea|send-button|contenteditable/);
  assert.doesNotMatch(agentIpc,/executeJavaScript|MutationObserver|stopImmediatePropagation|stopPropagation|preventDefault/);
  assert.doesNotMatch(preload,/ai:sendFile|ai:readReply|providerCosmetics/);
});

test('Command Bar Enter handling is scoped to the RWACode-owned input only',()=>{
  assert.match(agentUi,/agentTaskInput/);
  assert.match(agentUi,/el\('agentTaskInput'\)\.addEventListener\('keydown'/);
  assert.match(agentUi,/event\.preventDefault\(\);runTask\(\)/);
  assert.doesNotMatch(agentUi,/querySelectorAll\([^\n]*(?:prompt-textarea|contenteditable|send-button)/i);
});

test('agent bridge is narrow IPC with explicit manual ChangeSet review and no shell server',()=>{
  for(const channel of ['agent:getStatus','agent:plan','agent:prepareChangeSet','agent:apply','agent:undo','agent:githubAction','agent:driveAction']) assert.match(agentIpc,new RegExp(channel));
  assert.doesNotMatch(agentIpc,/http\.createServer|express\(|fastify\(|listen\(|child_process|exec\(|spawn\(/);
  assert.match(preload,/prepareChangeSet/);
  assert.match(preload,/githubAction/);
  assert.match(preload,/driveAction/);
  assert.doesNotMatch(preload,/child_process|exec\(|spawn\(|require\(['"]fs['"]\)/);
});

test('Workspace Agent loads Local GitHub Google Drive and manual handoff without provider API selector',()=>{
  assert.match(html,/<script src="\.\/agent-ui\.js"><\/script>/);
  assert.match(html,/<script src="\.\/agent-responsive-fix\.js"><\/script>/);
  for(const id of ['agentCommandBar','agentWorkspaceTag','agentTaskInput','agentRunButton','agentManualToggleButton','agentManualInput','agentReviewChangeSetButton','agentUndoButton','agentApplyButton','agentDiff','agentDriveSyncButton']) assert.match(agentUi,new RegExp(id));
  for(const token of ['@Local','@GitHub','@GoogleDrive','Paste ChangeSet','Review ChangeSet','NO_AI_API']) assert.match(agentUi,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(agentUi,/agentProvider|ChatGPT API|Claude API|Gemini API|DeepSeek API|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|DEEPSEEK_API_KEY/);
});

test('GitHub commit push and PR remain explicit shell-owned actions',()=>{
  for(const id of ['agentCommitButton','agentPushButton','agentPrButton','agentCommitMessage','agentPrTitle']) assert.match(agentUi,new RegExp(id));
  assert.match(agentUi,/agentCommitButton'\)\.onclick=commitGitHub/);
  assert.match(agentUi,/agentPushButton'\)\.onclick=pushGitHub/);
  assert.match(agentUi,/agentPrButton'\)\.onclick=openGitHubPr/);
  assert.doesNotMatch(agentUi,/setTimeout\([^\n]*githubAction|setInterval\([^\n]*githubAction/);
});

test('Google Drive write-back remains explicit Sync to Drive',()=>{
  assert.match(agentUi,/agentDriveSyncButton/);
  assert.match(agentUi,/agentDriveSyncButton'\)\.onclick=syncGoogleDrive/);
  assert.match(agentUi,/api\.agent\.driveAction\(id,'sync'/);
  assert.match(agentUi,/mirror only until Sync to Drive/);
  assert.doesNotMatch(agentUi,/setTimeout\([^\n]*driveAction|setInterval\([^\n]*driveAction/);
});

test('Undo is source-bound and stale prepared changes are rejected after target switch',()=>{
  assert.match(agentUi,/appliedBySource=new Map\(\)/);
  assert.match(agentUi,/transactionSourceById=new Map\(\)/);
  assert.match(agentUi,/preparedIdentity!==currentIdentity\(\)/);
  assert.match(agentUi,/No applied transaction for this target/);
});

test('responsive shell keeps Undo visible and never touches provider DOM',()=>{
  assert.match(agentResponsiveFix,/#agentUndoButton\{visibility:visible!important;display:inline-flex!important/);
  assert.match(agentResponsiveFix,/previewFullscreenButton/);
  assert.doesNotMatch(agentResponsiveFix,/agentProvider|prompt-textarea|send-button|contenteditable|chatgpt\.com|claude\.ai|gemini\.google\.com|chat\.deepseek\.com|executeJavaScript/);
});
