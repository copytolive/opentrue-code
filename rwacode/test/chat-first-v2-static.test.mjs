import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agentUi=fs.readFileSync(new URL('../src/agent-ui.js',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('../electron/agent-runner.cjs',import.meta.url),'utf8');
const ipc=fs.readFileSync(new URL('../electron/agent-ipc.cjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');

test('final command surface is source-aware and provider-aware',()=>{
  for(const token of ['agentWorkspaceTag','agentProvider','agentTaskInput','agentRunButton','agentUndoButton']) assert.match(agentUi,new RegExp(token));
  for(const value of ['@Local','@GitHub','@GoogleDrive','ChatGPT API','Claude API','Gemini API','DeepSeek API']) assert.match(agentUi,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('explicit provider selections are provider-pure and have no CLI fallback',()=>{
  assert.match(runner,/chat-first-provider-pure/);
  assert.match(runner,/cliFallback:false/);
  assert.match(runner,/RWACode will not fall back to another provider, CLI, browser scraping, cookies, or session reuse/);
  assert.doesNotMatch(runner,/runCodexPlanner|runClaudeCli|official-cli|spawn\(/);
});

test('target and reference context remain separate IPC inputs',()=>{
  assert.match(ipc,/targetSource=options\?\.target\|\|options\?\.source/);
  assert.match(ipc,/buildReferenceContext/);
  assert.match(ipc,/contextSources/);
  assert.match(ipc,/extraContextText:reference\.text/);
});

test('legacy fake chat and provider DOM bridge are absent from production shell',()=>{
  assert.doesNotMatch(html,/chat-first-ui\.js|chat-first-v2\.css|AI PROPOSAL|Add selected file to Chat/);
  assert.doesNotMatch(preload,/ai:sendFile|ai:readReply|\bai\s*:\s*\{/);
  assert.doesNotMatch(runner,/chatgpt\.com|claude\.ai|gemini\.google\.com|chat\.deepseek\.com/);
});
