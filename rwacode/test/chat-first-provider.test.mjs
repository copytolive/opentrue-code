import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { availability, createProviderChatRunner, assertOfficialEndpoint, MAX_RESPONSE_BYTES }=require('../electron/provider-chat-runner.cjs');
const { createAgentRunner }=require('../electron/agent-runner.cjs');

const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const agentUi=fs.readFileSync(new URL('../src/agent-ui.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const runnerSource=fs.readFileSync(new URL('../electron/agent-runner.cjs',import.meta.url),'utf8');

test('visible product is native browser shell plus RWACode-owned Workspace Agent',()=>{
  assert.match(html,/id="browserSurface"/);
  assert.match(html,/Native provider page/);
  assert.match(agentUi,/RWACode Workspace Agent/);
  assert.match(agentUi,/@Local/);
  assert.match(agentUi,/@GitHub/);
  assert.match(agentUi,/@GoogleDrive/);
  assert.doesNotMatch(html,/chat-first-ui\.js|chat-first-v2\.css|AI PROPOSAL|Add selected file to Chat/);
});

test('provider web remains native/manual and planner routing has no CLI fallback',()=>{
  assert.doesNotMatch(main,/executeJavaScript|MutationObserver|prompt-textarea|send-button/);
  assert.match(runnerSource,/providerWeb:'MANUAL_ONLY'/);
  assert.match(runnerSource,/cliFallback:false/);
  assert.doesNotMatch(runnerSource,/runCodexPlanner|runClaudeCli|official-cli|spawn\(/);
});

test('official provider availability requires credential and explicit model',()=>{
  const empty=availability({});
  for(const id of ['chatgpt','claude','gemini','deepseek']) assert.equal(empty[id].available,false);
  const ready=availability({OPENAI_API_KEY:'x',RWACODE_OPENAI_MODEL:'m1',ANTHROPIC_API_KEY:'y',RWACODE_ANTHROPIC_MODEL:'m2',GEMINI_API_KEY:'z',RWACODE_GEMINI_MODEL:'m3',DEEPSEEK_API_KEY:'d',RWACODE_DEEPSEEK_MODEL:'m4'});
  for(const id of ['chatgpt','claude','gemini','deepseek']) assert.equal(ready[id].available,true);
});

test('provider credentials can only reach exact official HTTPS hosts',()=>{
  assert.equal(assertOfficialEndpoint('chatgpt','https://api.openai.com/v1/responses'),'https://api.openai.com/v1/responses');
  assert.equal(assertOfficialEndpoint('claude','https://api.anthropic.com/v1/messages'),'https://api.anthropic.com/v1/messages');
  assert.equal(assertOfficialEndpoint('gemini','https://generativelanguage.googleapis.com/v1beta'),'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(assertOfficialEndpoint('deepseek','https://api.deepseek.com/chat/completions'),'https://api.deepseek.com/chat/completions');
  assert.throws(()=>assertOfficialEndpoint('chatgpt','http://api.openai.com/v1/responses'),/official host/);
  assert.throws(()=>assertOfficialEndpoint('chatgpt','https://evil.example/v1/responses'),/official host/);
});

test('OpenAI adapter returns structured ChangeSet and rejects redirects',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url,options});return{ok:true,status:200,headers:{get:()=>null},body:null,text:async()=>JSON.stringify({output:[{content:[{text:JSON.stringify({version:1,summary:'change title',operations:[{type:'MODIFY',path:'index.html',content:'<title>new</title>'}]})}]}]})}};
  const runner=createProviderChatRunner({env:{OPENAI_API_KEY:'secret',RWACODE_OPENAI_MODEL:'model-x'},fetchImpl});
  const result=await runner.plan('chatgpt','plan only');
  assert.equal(result.operations[0].path,'index.html');
  assert.equal(calls[0].url,'https://api.openai.com/v1/responses');
  assert.equal(calls[0].options.redirect,'error');
  assert.match(calls[0].options.headers.authorization,/^Bearer /);
});

test('Gemini credential is carried in header, never query string',async()=>{
  let call;
  const fetchImpl=async(url,options)=>{call={url,options};return{ok:true,status:200,headers:{get:()=>null},body:null,text:async()=>JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({version:1,summary:'noop',operations:[]})}]}}]})}};
  const runner=createProviderChatRunner({env:{GEMINI_API_KEY:'secret-gemini',RWACODE_GEMINI_MODEL:'gemini-x'},fetchImpl});
  await runner.plan('gemini','plan only');
  assert.doesNotMatch(call.url,/secret-gemini|key=/);
  assert.equal(call.options.headers['x-goog-api-key'],'secret-gemini');
});

test('selected provider never falls back to another provider',async()=>{
  const projectContext={searchText:async()=>[],build:async()=>({text:'ctx',files:['index.html'],indexedFiles:1,bytes:3})};
  const adapter={readText:async()=>null};
  const providerRunner={availability:()=>({chatgpt:{available:false},claude:{available:false},gemini:{available:true},deepseek:{available:false}}),plan:async(provider)=>({version:1,summary:`via ${provider}`,operations:[]})};
  const agent=createAgentRunner({root:process.cwd(),projectContext,adapter,env:{PATH:''},providerRunner});
  await assert.rejects(agent.plan('buat perubahan ui',{provider:'chatgpt',chatOnly:true}),/chatgpt official API route is not configured/);
  const planned=await agent.plan('buat perubahan ui',{provider:'gemini',chatOnly:true});
  assert.equal(planned.runner,'gemini-official-api');
  assert.equal(planned.evidence.resolvedProvider,'gemini');
});

test('provider response budget is bounded before JSON parsing',()=>{
  assert.equal(MAX_RESPONSE_BYTES,2*1024*1024);
});
