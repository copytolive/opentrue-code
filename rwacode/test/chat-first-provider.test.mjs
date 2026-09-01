import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createAgentRunner, NO_AI_API_ERROR }=require('../electron/agent-runner.cjs');
const { createWorkspaceRetriever }=require('../electron/workspace-retriever.cjs');
const { createLocalWorkspaceAdapter }=require('../electron/workspace-adapter.cjs');
const { createWorkspaceAgent }=require('../electron/workspace-agent.cjs');

const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const agentUi=fs.readFileSync(new URL('../src/agent-ui.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const runnerSource=fs.readFileSync(new URL('../electron/agent-runner.cjs',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');

function tempRoot(){return fs.mkdtempSync(path.join(os.tmpdir(),'rwacode-no-ai-'));}

test('visible product is provider-neutral native browser shell plus RWACode-owned Workspace Agent',()=>{
  assert.match(html,/id="browserSurface"/);
  assert.match(html,/Browser Chat/);
  assert.match(html,/Native web chat/);
  assert.match(html,/Human-controlled · NO_AI_API/);
  assert.doesNotMatch(html,/provider-card|https:\/\/chatgpt\.com|https:\/\/claude\.ai|https:\/\/gemini\.google\.com/);
  assert.match(agentUi,/RWACode Workspace Agent/);
  assert.match(agentUi,/@Local/);
  assert.match(agentUi,/@GitHub/);
  assert.match(agentUi,/@GoogleDrive/);
  assert.match(agentUi,/Paste ChangeSet/);
  assert.doesNotMatch(html,/chat-first-ui\.js|chat-first-v2\.css|AI PROPOSAL|Add selected file to Chat/);
});

test('provider web remains native/manual and runner has no AI API or CLI route',()=>{
  assert.doesNotMatch(main,/executeJavaScript|MutationObserver|prompt-textarea|send-button/);
  assert.match(runnerSource,/providerWeb:'MANUAL_ONLY'/);
  assert.match(runnerSource,/providerApi:false/);
  assert.match(runnerSource,/cliFallback:false/);
  assert.match(runnerSource,/mode:'NO_AI_API'/);
  assert.doesNotMatch(runnerSource,/fetch\(|authorization|x-api-key|createProviderChatRunner|official-api|spawn\(/);
});

test('free-form task fails closed without creating any network egress',async()=>{
  const root=tempRoot();const previousFetch=globalThis.fetch;let calls=0;
  try{
    fs.writeFileSync(path.join(root,'index.html'),'<title>old</title>\n');
    globalThis.fetch=async()=>{calls+=1;throw new Error('network must not be called');};
    const adapter=createLocalWorkspaceAdapter({root});const retriever=createWorkspaceRetriever({root});const runner=createAgentRunner({root,projectContext:retriever,adapter});
    await assert.rejects(runner.plan('buat UI kompleks dengan tombol baru'),/NO_AI_API/);
    assert.equal(calls,0);
    assert.equal(runner.availability().routing.providerApi,false);
    assert.deepEqual(runner.allowlist,[]);
  }finally{globalThis.fetch=previousFetch;fs.rmSync(root,{recursive:true,force:true});}
});

test('manual ChangeSet is validated into PREPARED review and never auto-applies',async()=>{
  const root=tempRoot();
  try{
    const target=path.join(root,'index.html');fs.writeFileSync(target,'<title>old</title>\n');
    const agent=createWorkspaceAgent({root,journalPath:path.join(root,'.journal','tx.jsonl')});
    const tx=await agent.prepareChangeSet(JSON.stringify({version:1,summary:'manual title',operations:[{type:'MODIFY',path:'index.html',content:'<title>new</title>\n'}]}),{task:'manual copy'});
    assert.equal(tx.status,'PREPARED');assert.equal(tx.runner,'manual-changeset');assert.match(tx.diff,/\+<title>new<\/title>/);assert.equal(fs.readFileSync(target,'utf8'),'<title>old</title>\n');
    await agent.apply(tx.id);assert.equal(fs.readFileSync(target,'utf8'),'<title>new</title>\n');
    await agent.undo(tx.id);assert.equal(fs.readFileSync(target,'utf8'),'<title>old</title>\n');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('manual handoff bridge is RWACode-owned and has no provider import endpoint',()=>{
  assert.match(preload,/prepareChangeSet/);
  assert.match(agentUi,/Explicit user handoff only/);
  assert.doesNotMatch(preload,/readReply|sendFile|providerReply|importAI|cookie/i);
  assert.doesNotMatch(agentUi,/Import AI Reply|Read AI Reply|auto.?send|agentProvider/i);
  assert.match(NO_AI_API_ERROR,/native\/manual browser page/);
});
