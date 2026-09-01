import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { availability, createProviderChatRunner, assertOfficialEndpoint } = require('../electron/provider-chat-runner.cjs');
const { createAgentRunner } = require('../electron/agent-runner.cjs');

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const chatUi = fs.readFileSync(new URL('../src/chat-first-ui.js', import.meta.url), 'utf8');
const chatCss = fs.readFileSync(new URL('../src/chat-first-v2.css', import.meta.url), 'utf8');
const explorerFix = fs.readFileSync(new URL('../src/explorer-menu-fix.js', import.meta.url), 'utf8');
const ipc = fs.readFileSync(new URL('../electron/agent-ipc.cjs', import.meta.url), 'utf8');
const runnerSource = fs.readFileSync(new URL('../electron/agent-runner.cjs', import.meta.url), 'utf8');

test('chat-first prototype remains available for provider-safe internals but is not the visible product shell', () => {
  assert.doesNotMatch(html, /chat-first-v2\.css/);
  assert.doesNotMatch(html, /chat-first-ui\.js/);
  assert.match(html, /id="browserSurface"/);
  assert.match(html, /Native provider page/);
  for (const text of ['Editable Target','Read-only Reference Context','ChatGPT','Claude','Gemini','DeepSeek','Preview','Inspector','Console','Network','Full Screen']) assert.match(chatUi, new RegExp(text));
  assert.match(chatCss, /cf-preview-overlay/);
  assert.match(chatCss, /cf-targets/);
  assert.match(chatCss, /cf-contexts/);
});

test('chat composer owns Enter and never automates provider browser DOM', () => {
  assert.match(chatUi, /cfComposerInput/);
  assert.match(chatUi, /event\.key==='Enter'/);
  assert.match(chatUi, /event\.preventDefault\(\);runTask\(\)/);
  assert.doesNotMatch(chatUi, /executeJavaScript|MutationObserver|querySelectorAll\([^\n]*(?:prompt-textarea|send-button|contenteditable)/i);
  assert.doesNotMatch(chatUi, /chatgpt\.com|claude\.ai|gemini\.google\.com|deepseek\.com/);
});

test('chat-first plan is explicitly chatOnly and separates editable target from read-only contexts', () => {
  assert.match(chatUi, /chatOnly:true/);
  assert.match(chatUi, /target:sourceObject\(state\.target\.type\)/);
  assert.match(chatUi, /contextSources:activeContextSources\(\)/);
  assert.match(ipc, /buildReferenceContext/);
  assert.match(ipc, /extraContextText:reference\.text/);
  assert.match(ipc, /extraContextEvidence:reference\.evidence/);
});

test('chat-first Explorer follows the selected editable target through narrow read-only IPC', () => {
  assert.match(explorerFix, /rwacode\.chat-first\.v2/);
  assert.match(explorerFix, /api\.agent\.browse\(target, requestedPath\)/);
  assert.match(explorerFix, /api\.agent\.readTarget\(target, relativePath\)/);
  assert.match(explorerFix, /chat-first-active/);
  assert.match(explorerFix, /cf-target-row, #cfSourceSave/);
  assert.match(ipc, /agent:browse/);
  assert.match(ipc, /agent:readTarget/);
  assert.doesNotMatch(explorerFix, /executeJavaScript|MutationObserver|chatgpt\.com|claude\.ai|gemini\.google\.com/);
});

test('selected provider never falls back to a CLI or a different provider', async () => {
  const projectContext = { searchText:async()=>[], build:async()=>({text:'ctx',files:['index.html'],indexedFiles:1,bytes:3}) };
  const adapter = { readText:async()=>null };
  const providerRunner = { availability:()=>({chatgpt:{available:false},claude:{available:false},gemini:{available:true},deepseek:{available:false}}), plan:async(provider)=>({version:1,summary:`via ${provider}`,operations:[]}) };
  const agent = createAgentRunner({ root:process.cwd(), projectContext, adapter, env:{PATH:''}, providerRunner });
  await assert.rejects(agent.plan('buat perubahan ui', {provider:'chatgpt',chatOnly:true}), /chatgpt official API route is not configured/);
  const planned = await agent.plan('buat perubahan ui', {provider:'gemini',chatOnly:true});
  assert.equal(planned.runner,'gemini-official-api');
  assert.equal(planned.evidence.resolvedProvider,'gemini');
  assert.equal(planned.evidence.requestedProvider,'gemini');
  assert.equal(agent.availability().routing.cliFallback,false);
  assert.doesNotMatch(runnerSource, /runCodexPlanner|runClaudeCli|official-cli/);
});

test('official provider availability requires both credential and explicit model setting', () => {
  const empty = availability({});
  for (const id of ['chatgpt','claude','gemini','deepseek']) assert.equal(empty[id].available, false);
  const ready = availability({ OPENAI_API_KEY:'x', RWACODE_OPENAI_MODEL:'model-x', ANTHROPIC_API_KEY:'y', RWACODE_ANTHROPIC_MODEL:'model-y', GEMINI_API_KEY:'z', RWACODE_GEMINI_MODEL:'model-z', DEEPSEEK_API_KEY:'d', RWACODE_DEEPSEEK_MODEL:'model-d' });
  for (const id of ['chatgpt','claude','gemini','deepseek']) assert.equal(ready[id].available, true);
});

test('provider credentials are sent only to official hosts and redirects are rejected', () => {
  assert.equal(assertOfficialEndpoint('chatgpt','https://api.openai.com/v1/responses'),'https://api.openai.com/v1/responses');
  assert.equal(assertOfficialEndpoint('claude','https://api.anthropic.com/v1/messages'),'https://api.anthropic.com/v1/messages');
  assert.equal(assertOfficialEndpoint('gemini','https://generativelanguage.googleapis.com/v1beta'),'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(assertOfficialEndpoint('deepseek','https://api.deepseek.com/chat/completions'),'https://api.deepseek.com/chat/completions');
  assert.throws(() => assertOfficialEndpoint('chatgpt','https://example.com/v1/responses'), /official host/);
  assert.throws(() => createProviderChatRunner({ env:{OPENAI_API_KEY:'secret',RWACODE_OPENAI_MODEL:'model-x',RWACODE_OPENAI_ENDPOINT:'https://evil.example/v1/responses'} }), /official host/);
});

test('OpenAI official adapter returns structured ChangeSet without browser automation', async () => {
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
  assert.equal(calls[0].url,'https://api.openai.com/v1/responses');
  assert.match(calls[0].options.headers.authorization,/^Bearer /);
  assert.equal(calls[0].options.redirect,'error');
});

test('preview preserves real http URL, implements device bounds and fullscreen, and persists conversation state', () => {
  assert.match(chatUi, /rwacode\.chat-first\.v2/);
  assert.match(chatUi, /localStorage\.setItem/);
  assert.match(chatUi, /\^https\?:\\\/\\\//);
  assert.match(chatUi, /state\.previewMode==='tablet'/);
  assert.match(chatUi, /state\.previewMode==='mobile'/);
  assert.match(chatUi, /cfPreviewOverlay/);
  assert.match(chatUi, /cfPreviewExitFullscreen/);
  assert.doesNotMatch(chatUi, /if\(p\?\.url\)\$\('#cfPreviewUrl'\)\.value=p\.url/);
});