import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { availability, createProviderChatRunner } = require('../electron/provider-chat-runner.cjs');
const { createAgentRunner } = require('../electron/agent-runner.cjs');

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const chatUi = fs.readFileSync(new URL('../src/chat-first-ui.js', import.meta.url), 'utf8');
const chatCss = fs.readFileSync(new URL('../src/chat-first.css', import.meta.url), 'utf8');
const ipc = fs.readFileSync(new URL('../electron/agent-ipc.cjs', import.meta.url), 'utf8');

test('chat-first reference surface is the visible product shell while legacy runtime stays present', () => {
  assert.match(html, /chat-first\.css/);
  assert.match(html, /chat-first-ui\.js/);
  for (const text of ['ChatGPT','Claude','Gemini','DeepSeek','Context \/ Target Source','Preview','Inspector','Console','Network']) assert.match(chatUi, new RegExp(text));
  assert.match(chatCss, /\.chat-first-active #app\{display:none!important\}/);
});

test('chat composer owns Enter and never automates provider browser DOM', () => {
  assert.match(chatUi, /cfComposerInput/);
  assert.match(chatUi, /event\.key==='Enter'/);
  assert.match(chatUi, /event\.preventDefault\(\);runTask\(\)/);
  assert.doesNotMatch(chatUi, /executeJavaScript|MutationObserver|querySelectorAll\([^\n]*(?:prompt-textarea|send-button|contenteditable)/i);
  assert.doesNotMatch(chatUi, /chatgpt\.com|claude\.ai|gemini\.google\.com|deepseek\.com/);
});

test('chat-first workflow keeps Apply Git and Drive explicit', () => {
  assert.match(chatUi, /api\.agent\.plan\(text,\{mode:'normal',source:state\.source,provider:state\.provider\}\)/);
  assert.match(chatUi, /api\.agent\.apply\(state\.prepared\.id\)/);
  assert.match(chatUi, /api\.agent\.undo\(state\.applied\.id\)/);
  assert.match(chatUi, /githubAction\(state\.applied\.id,'commit'/);
  assert.match(chatUi, /githubAction\(state\.applied\.id,'push'/);
  assert.match(chatUi, /githubAction\(state\.applied\.id,'pr'/);
  assert.match(chatUi, /driveAction\(state\.applied\.id,'sync'/);
});

test('IPC forwards selected provider without adding a provider-web automation endpoint', () => {
  assert.match(ipc, /provider:String\(options\?\.provider \|\| 'auto'\)/);
  assert.doesNotMatch(ipc, /executeJavaScript|browserCookie|cookie|sessionToken|provider:send/);
});

test('official API provider availability requires both credential and explicit model setting', () => {
  const empty = availability({});
  for (const id of ['chatgpt','claude','gemini','deepseek']) assert.equal(empty[id].available, false);
  const ready = availability({ OPENAI_API_KEY:'x', RWACODE_OPENAI_MODEL:'model-x', ANTHROPIC_API_KEY:'y', RWACODE_ANTHROPIC_MODEL:'model-y', GEMINI_API_KEY:'z', RWACODE_GEMINI_MODEL:'model-z', DEEPSEEK_API_KEY:'d', RWACODE_DEEPSEEK_MODEL:'model-d' });
  for (const id of ['chatgpt','claude','gemini','deepseek']) assert.equal(ready[id].available, true);
});

test('OpenAI-style official provider adapter returns a structured ChangeSet without writing files', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url,options});
    return { ok:true, status:200, text:async () => JSON.stringify({ output:[{ content:[{ type:'output_text', text:JSON.stringify({version:1,summary:'change title',operations:[{type:'MODIFY',path:'index.html',content:'<title>new</title>'}]}) }] }] }) };
  };
  const runner = createProviderChatRunner({ env:{OPENAI_API_KEY:'secret',RWACODE_OPENAI_MODEL:'model-x'}, fetchImpl });
  const result = await runner.plan('chatgpt','plan only');
  assert.equal(result.version,1);
  assert.equal(result.operations[0].path,'index.html');
  assert.equal(calls.length,1);
  assert.match(calls[0].options.headers.authorization,/^Bearer /);
});

test('explicit provider selection is honored by AgentRunner', async () => {
  const projectContext = { searchText:async()=>[], build:async()=>({text:'ctx',files:['index.html'],indexedFiles:1,bytes:3}) };
  const adapter = { readText:async()=>null };
  const providerRunner = { availability:()=>({chatgpt:{available:false},claude:{available:false},gemini:{available:true},deepseek:{available:false}}), plan:async(provider)=>({version:1,summary:`via ${provider}`,operations:[]}) };
  const agent = createAgentRunner({ root:process.cwd(), projectContext, adapter, env:{PATH:''}, executableFinder:()=>null, providerRunner });
  const planned = await agent.plan('buat perubahan ui', {provider:'gemini'});
  assert.equal(planned.runner,'gemini-official-api');
  assert.equal(planned.changeSet.summary,'via gemini');
  assert.equal(planned.evidence.requestedProvider,'gemini');
});
