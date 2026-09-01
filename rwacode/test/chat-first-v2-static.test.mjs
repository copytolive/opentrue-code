import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agentUi=fs.readFileSync(new URL('../src/agent-ui.js',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('../electron/agent-runner.cjs',import.meta.url),'utf8');
const ipc=fs.readFileSync(new URL('../electron/agent-ipc.cjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');

test('final command surface is source-aware and exposes explicit manual ChangeSet review',()=>{
  for(const token of ['agentWorkspaceTag','agentTaskInput','agentRunButton','agentManualToggleButton','agentManualInput','agentReviewChangeSetButton','agentUndoButton','agentApplyButton']) assert.match(agentUi,new RegExp(token));
  for(const value of ['@Local','@GitHub','@GoogleDrive','Paste ChangeSet','Review ChangeSet','NO_AI_API']) assert.match(agentUi,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(agentUi,/agentProvider|ChatGPT API|Claude API|Gemini API|DeepSeek API/);
});

test('free-form reasoning is fail-closed with no AI API or CLI fallback',()=>{
  assert.match(runner,/mode:'NO_AI_API'/);
  assert.match(runner,/providerWeb:'MANUAL_ONLY'/);
  assert.match(runner,/providerApi:false/);
  assert.match(runner,/cliFallback:false/);
  assert.match(runner,/providerAutomation:false/);
  assert.doesNotMatch(runner,/provider-pure-official-api|runCodexPlanner|runClaudeCli|official-cli|spawn\(|createProviderChatRunner/);
});

test('target remains explicit while provider reference context is user-owned manual handoff',()=>{
  assert.match(ipc,/targetSource=options\?\.target\|\|options\?\.source/);
  assert.match(ipc,/agent:prepareChangeSet/);
  assert.match(preload,/prepareChangeSet/);
  assert.doesNotMatch(ipc,/buildReferenceContext|contextSources|extraContextText|extraContextEvidence/);
});

test('legacy fake chat and provider DOM bridge are absent from production shell',()=>{
  assert.doesNotMatch(html,/chat-first-ui\.js|chat-first-v2\.css|AI PROPOSAL|Add selected file to Chat/);
  assert.doesNotMatch(preload,/ai:sendFile|ai:readReply|\bai\s*:\s*\{/);
  assert.doesNotMatch(runner,/chatgpt\.com|claude\.ai|gemini\.google\.com|chat\.deepseek\.com/);
});
