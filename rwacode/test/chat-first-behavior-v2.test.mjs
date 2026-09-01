import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createLocalWorkspaceAdapter }=require('../electron/workspace-adapter.cjs');
const { createAgentRunner }=require('../electron/agent-runner.cjs');
const agentUi=fs.readFileSync(new URL('../src/agent-ui.js',import.meta.url),'utf8');
const explorer=fs.readFileSync(new URL('../src/explorer-menu-fix.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const ipc=fs.readFileSync(new URL('../electron/agent-ipc.cjs',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');

function tempRoot(){return fs.mkdtempSync(path.join(os.tmpdir(),'rwacode-behavior-'))}

test('root-locked adapter browsing hides .git and symlinks',async()=>{
  const root=tempRoot();
  try{
    fs.mkdirSync(path.join(root,'src'));fs.mkdirSync(path.join(root,'.git'));
    fs.writeFileSync(path.join(root,'src','app.js'),'console.log(1)\n');
    fs.symlinkSync(path.join(root,'src','app.js'),path.join(root,'escape.js'));
    const adapter=createLocalWorkspaceAdapter({root});
    const top=await adapter.listDirectory('.');
    assert.ok(top.entries.some((e)=>e.name==='src'&&e.type==='directory'));
    assert.ok(!top.entries.some((e)=>e.name==='.git'));
    assert.ok(!top.entries.some((e)=>e.name==='escape.js'));
    await assert.rejects(adapter.listDirectory('../outside'));
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('Workspace Agent owns task Enter while native provider pages remain untouched',()=>{
  assert.match(agentUi,/id=\"agentTaskInput\"/);
  assert.match(agentUi,/agentTaskInput'\)\.addEventListener\('keydown'/);
  assert.match(agentUi,/event\.key\s*===\s*['"]Enter['"]/);
  assert.match(agentUi,/event\.preventDefault\(\);\s*runTask\(\)/);
  assert.doesNotMatch(main,/executeJavaScript|MutationObserver|prompt-textarea|send-button/);
  assert.doesNotMatch(explorer,/executeJavaScript|MutationObserver|prompt-textarea|send-button/);
});

test('native browser surface stays isolated from privileged shell IPC',()=>{
  assert.match(main,/new WebContentsView/);
  assert.match(main,/sandbox\s*:\s*true/);
  assert.match(main,/contextIsolation\s*:\s*true/);
  assert.match(main,/nodeIntegration\s*:\s*false/);
  assert.match(preload,/contextBridge\.exposeInMainWorld\('rwacode'/);
  assert.doesNotMatch(preload,/\bai\s*:\s*\{/);
});

test('editable target and read-only reference context stay separate in IPC',()=>{
  assert.match(ipc,/targetSource=options\?\.target\|\|options\?\.source/);
  assert.match(ipc,/buildReferenceContext/);
  assert.match(ipc,/contextSources/);
  assert.match(ipc,/extraContextText:reference\.text/);
  assert.match(ipc,/extraContextEvidence:reference\.evidence/);
});

test('selected provider never silently falls back to another provider or CLI',async()=>{
  const root=tempRoot();
  try{
    fs.writeFileSync(path.join(root,'index.html'),'<title>x</title>\n');
    const adapter=createLocalWorkspaceAdapter({root});
    const projectContext={searchText:async()=>[],build:async()=>({text:'ctx',files:['index.html'],indexedFiles:1,bytes:3})};
    const providerRunner={availability:()=>({chatgpt:{available:false},claude:{available:false},gemini:{available:true},deepseek:{available:false}}),plan:async(provider)=>({version:1,summary:`via ${provider}`,operations:[]})};
    const agent=createAgentRunner({root,projectContext,adapter,env:{PATH:''},providerRunner});
    await assert.rejects(agent.plan('buat perubahan ui',{provider:'chatgpt',chatOnly:true}),/chatgpt official API route is not configured/);
    const result=await agent.plan('buat perubahan ui',{provider:'gemini',chatOnly:true});
    assert.equal(result.runner,'gemini-official-api');
    assert.equal(result.evidence.resolvedProvider,'gemini');
    assert.equal(agent.availability().routing.cliFallback,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
