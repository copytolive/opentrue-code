import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLocalWorkspaceAdapter } = require('../electron/workspace-adapter.cjs');
const { createAgentRunner } = require('../electron/agent-runner.cjs');
const ui = fs.readFileSync(new URL('../src/chat-first-ui.js', import.meta.url), 'utf8');
const ipc = fs.readFileSync(new URL('../electron/agent-ipc.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

function tempRoot(){return fs.mkdtempSync(path.join(os.tmpdir(),'rwacode-v2-'))}

test('root-locked adapter browsing lists directories and files but hides .git and symlinks', async () => {
  const root=tempRoot();
  fs.mkdirSync(path.join(root,'src'));
  fs.mkdirSync(path.join(root,'.git'));
  fs.writeFileSync(path.join(root,'src','app.js'),'console.log(1)\n');
  fs.symlinkSync(path.join(root,'src','app.js'),path.join(root,'escape.js'));
  const adapter=createLocalWorkspaceAdapter({root});
  const top=await adapter.listDirectory('.');
  assert.ok(top.entries.some((e)=>e.name==='src'&&e.type==='directory'));
  assert.ok(!top.entries.some((e)=>e.name==='.git'));
  assert.ok(!top.entries.some((e)=>e.name==='escape.js'));
  const src=await adapter.listDirectory('src');
  assert.deepEqual(src.entries.map((e)=>e.path),['src/app.js']);
  await assert.rejects(adapter.listDirectory('../outside'));
});

test('chat planner receives bounded prior conversation without changing provider', async () => {
  const root=tempRoot();
  fs.writeFileSync(path.join(root,'index.html'),'<title>Before</title>\n');
  const adapter=createLocalWorkspaceAdapter({root});
  const projectContext={searchText:async()=>[],build:async()=>({text:'TARGET FILE index.html',files:['index.html'],indexedFiles:1,bytes:22})};
  let captured='';
  const providerRunner={
    availability:()=>({chatgpt:{available:true},claude:{available:false},gemini:{available:false},deepseek:{available:false}}),
    plan:async(provider,prompt)=>{assert.equal(provider,'chatgpt');captured=prompt;return{version:1,summary:'Follow-up edit',operations:[]}},
  };
  const runner=createAgentRunner({root,projectContext,adapter,providerRunner});
  const result=await runner.plan('buat warnanya sedikit lebih gelap',{provider:'chatgpt',chatOnly:true,conversation:[{role:'user',text:'buat tombol login'},{role:'assistant',text:'REVIEW siap'}]});
  assert.equal(result.runner,'chatgpt-official-api');
  assert.equal(result.evidence.conversationTurns,2);
  assert.match(captured,/RWACODE PRIOR CONVERSATION/);
  assert.match(captured,/USER: buat tombol login/);
  assert.match(captured,/ASSISTANT: REVIEW siap/);
  assert.match(captured,/buat warnanya sedikit lebih gelap/);
});

test('target Explorer is narrow agent IPC and follows selected editable target', () => {
  for(const channel of ['agent:browse','agent:readTarget']) assert.match(ipc,new RegExp(channel));
  assert.match(preload,/browse:\s*\(source, relativePath\)/);
  assert.match(preload,/readTarget:\s*\(source, relativePath\)/);
  assert.match(ui,/api\.agent\.browse\(target,relativePath\)/);
  assert.match(ui,/api\.agent\.readTarget\(sourceObject\(state\.target\.type\),row\.dataset\.path\)/);
  assert.match(ui,/Explorer · Editable Target/);
});

test('chat-first follow-up sends prior turns and provider route remains explicit', () => {
  assert.match(ui,/conversation=state\.messages\.slice\(0,-1\)/);
  assert.match(ui,/chatOnly:true,conversation/);
  assert.match(ui,/No provider switching behind your back/);
  assert.doesNotMatch(ui,/codex|runCodex|claude CLI/i);
});

test('preview rejects about:blank overwrite and has real device/fullscreen geometry', () => {
  assert.match(ui,/if\(\/\^https\?:\\\/\\\/\/i\.test\(url\)\)/);
  assert.match(ui,/Math\.min\(768,rect\.width\)/);
  assert.match(ui,/Math\.min\(390,rect\.width\)/);
  assert.match(ui,/state\.previewFullscreen=true/);
  assert.match(ui,/event\.key==='Escape'/);
  assert.doesNotMatch(ui,/state\.previewUrl\s*=\s*['"]about:blank/);
});
