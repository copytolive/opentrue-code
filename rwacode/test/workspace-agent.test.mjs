import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkspaceRetriever } = require('../electron/workspace-retriever.cjs');
const { createLocalWorkspaceAdapter } = require('../electron/workspace-adapter.cjs');
const { createAgentRunner, findExecutable, parseLiteralTask } = require('../electron/agent-runner.cjs');
const { createTransactionEngine } = require('../electron/transaction-engine.cjs');
const { createWorkspaceAgent } = require('../electron/workspace-agent.cjs');

function root() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rwacode-agent-')); }

test('natural task locates VALUE assignment, edits real disk, and undo restores exact BEFORE bytes', async () => {
  const workspace = root();
  const evidenceDir = path.join(workspace, '05_HANDOFF_EVIDENCE');
  fs.mkdirSync(evidenceDir);
  const target = path.join(evidenceDir, 'RWACODE_AGENT_BRIDGE_E2E.txt');
  const before = Buffer.from('RWACODE_AGENT_BRIDGE_E2E\nVERSION=1\nSTATUS=BEFORE\nVALUE=12345\n');
  fs.writeFileSync(target, before);
  fs.mkdirSync(path.join(workspace, 'src'));
  fs.writeFileSync(path.join(workspace, 'src', 'unrelated.js'), 'const other = 1;\n');
  const agent = createWorkspaceAgent({ root:workspace, journalPath:path.join(workspace, '.rwacode', 'transactions.jsonl') });
  const planned = await agent.plan('ubah VALUE menjadi 22222');
  assert.equal(planned.status, 'PREPARED');
  assert.equal(planned.runner, 'local-literal');
  assert.deepEqual(planned.touched, ['05_HANDOFF_EVIDENCE/RWACODE_AGENT_BRIDGE_E2E.txt']);
  assert.match(planned.diff, /-VALUE=12345/);
  assert.match(planned.diff, /\+VALUE=22222/);
  assert.deepEqual(fs.readFileSync(target), before, 'Normal mode must not write before Apply');
  const applied = await agent.apply(planned.id);
  assert.equal(applied.status, 'APPLIED');
  assert.match(fs.readFileSync(target, 'utf8'), /VALUE=22222/);
  assert.equal(agent.status().transaction.undoAvailable, true);
  const undone = await agent.undo(applied.id);
  assert.equal(undone.status, 'UNDONE');
  assert.deepEqual(fs.readFileSync(target), before);
});

test('safe Indonesian literal shorthand without an explicit verb is accepted', () => {
  assert.deepEqual(parseLiteralTask('RWACODEGITHUBVALUE menjadi 22222'), { key:'RWACODEGITHUBVALUE', value:'22222' });
  assert.deepEqual(parseLiteralTask('VALUE ke 20'), { key:'VALUE', value:'20' });
  assert.equal(parseLiteralTask('tolong ubah sesuatu'), null);
});

test('chat-only free-form task stays on selected provider; Transaction Engine owns writes and exact Undo', async () => {
  const workspace = root();
  const target = path.join(workspace, 'index.html');
  const before = Buffer.from('<!doctype html>\n<button id="old">Old</button>\n');
  fs.writeFileSync(target, before);
  const adapter = createLocalWorkspaceAdapter({ root:workspace });
  const retriever = createWorkspaceRetriever({ root:workspace });
  const calls = [];
  const providerRunner = {
    availability:()=>({chatgpt:{available:true},claude:{available:false},gemini:{available:false},deepseek:{available:false}}),
    plan:async(provider,prompt)=>{
      calls.push({provider,prompt});
      assert.equal(provider,'chatgpt');
      assert.match(prompt,/RWACODE EDITABLE TARGET CONTEXT/);
      assert.match(prompt,/READ-ONLY REFERENCE CONTEXT/);
      assert.match(prompt,/tambahkan tombol Full Screen/i);
      assert.match(prompt,/Do not edit files directly/);
      return {version:1,summary:'Add a fullscreen button',operations:[{type:'MODIFY',path:'index.html',content:'<!doctype html>\n<button id="old">Old</button>\n<button id="fullscreen">Full Screen</button>\n'}]};
    },
  };
  const runner = createAgentRunner({ root:workspace, projectContext:retriever, adapter, providerRunner });
  const planned = await runner.plan('tambahkan tombol Full Screen yang benar-benar berfungsi tanpa merusak halaman', { provider:'chatgpt', chatOnly:true, extraContextText:'REFERENCE_ONLY=1' });
  assert.equal(planned.runner, 'chatgpt-official-api');
  assert.equal(planned.evidence.resolvedProvider, 'chatgpt');
  assert.deepEqual(fs.readFileSync(target), before, 'planning must never mutate the workspace');
  assert.equal(calls.length, 1);
  const tx = createTransactionEngine({ adapter });
  const prepared = await tx.prepare(planned.changeSet);
  assert.match(prepared.diff, /\+<button id="fullscreen">Full Screen<\/button>/);
  assert.deepEqual(fs.readFileSync(target), before, 'review-before-apply remains mandatory');
  const applied = await tx.apply(prepared.id);
  assert.equal(applied.status, 'APPLIED');
  assert.match(fs.readFileSync(target, 'utf8'), /id="fullscreen"/);
  await tx.undo(prepared.id);
  assert.deepEqual(fs.readFileSync(target), before, 'Undo must restore exact BEFORE bytes after free-form planning');
});

test('bounded index includes root files before deep directory contents can exhaust the file cap', async () => {
  const workspace = root();
  const target = path.join(workspace, 'RWACODE_REAL_MAC_E2E.txt');
  fs.writeFileSync(target, 'RWACODE_REAL_MAC_E2E\nRWACODEVALUE=12345\n');
  const crowded = path.join(workspace, '00_CROWDED');
  fs.mkdirSync(crowded);
  for (let index = 0; index < 2610; index += 1) fs.writeFileSync(path.join(crowded, `f-${String(index).padStart(4, '0')}.txt`), `FILLER_${index}=1\n`);
  const agent = createWorkspaceAgent({ root:workspace });
  const planned = await agent.plan('ubah RWACODEVALUE menjadi 22222');
  assert.equal(planned.status, 'PREPARED');
  assert.equal(planned.runner, 'local-literal');
  assert.deepEqual(planned.touched, ['RWACODE_REAL_MAC_E2E.txt']);
  assert.match(planned.diff, /-RWACODEVALUE=12345/);
  assert.match(planned.diff, /\+RWACODEVALUE=22222/);
  assert.match(fs.readFileSync(target, 'utf8'), /RWACODEVALUE=12345/);
});

test('Auto mode snapshots first, applies, and remains undoable', async () => {
  const workspace = root();
  fs.writeFileSync(path.join(workspace, 'config.txt'), 'VALUE=10\n');
  const agent = createWorkspaceAgent({ root:workspace });
  const applied = await agent.plan('ubah VALUE menjadi 20', { mode:'auto' });
  assert.equal(applied.status, 'APPLIED');
  assert.equal(fs.readFileSync(path.join(workspace, 'config.txt'), 'utf8'), 'VALUE=20\n');
  await agent.undo(applied.id);
  assert.equal(fs.readFileSync(path.join(workspace, 'config.txt'), 'utf8'), 'VALUE=10\n');
});

test('multi-file transaction restores every BEFORE state', async () => {
  const workspace = root();
  fs.writeFileSync(path.join(workspace, 'a.txt'), 'A=1\n');
  fs.writeFileSync(path.join(workspace, 'b.txt'), 'B=1\n');
  const adapter = createLocalWorkspaceAdapter({ root:workspace });
  const tx = createTransactionEngine({ adapter });
  const prepared = await tx.prepare({ version:1, summary:'two files', operations:[{ type:'MODIFY', path:'a.txt', content:'A=2\n' },{ type:'MODIFY', path:'b.txt', content:'B=2\n' }]});
  await tx.apply(prepared.id);
  assert.equal(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8'), 'A=2\n');
  assert.equal(fs.readFileSync(path.join(workspace, 'b.txt'), 'utf8'), 'B=2\n');
  await tx.undo(prepared.id);
  assert.equal(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8'), 'A=1\n');
  assert.equal(fs.readFileSync(path.join(workspace, 'b.txt'), 'utf8'), 'B=1\n');
});

test('agent transaction rejects traversal and symlink escape paths', async () => {
  const workspace = root();
  const outside = root();
  fs.writeFileSync(path.join(workspace, 'safe.txt'), 'ok\n');
  fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside\n');
  fs.symlinkSync(path.join(outside, 'outside.txt'), path.join(workspace, 'escape.txt'));
  const adapter = createLocalWorkspaceAdapter({ root:workspace });
  const tx = createTransactionEngine({ adapter });
  await assert.rejects(tx.prepare({version:1,operations:[{type:'MODIFY',path:'../oops.txt',content:'x'}]}));
  await assert.rejects(tx.prepare({version:1,operations:[{type:'MODIFY',path:'escape.txt',content:'x'}]}));
});

test('runner availability is explicit and chat-first routing has no CLI fallback', () => {
  const workspace = root();
  fs.writeFileSync(path.join(workspace, 'demo.txt'), 'hello\n');
  const adapter = createLocalWorkspaceAdapter({ root:workspace });
  const retriever = createWorkspaceRetriever({ root:workspace });
  const providerRunner = { availability:()=>({chatgpt:{available:false},claude:{available:false},gemini:{available:false},deepseek:{available:false}}), plan:async()=>({version:1,summary:'unused',operations:[]}) };
  const runner = createAgentRunner({ root:workspace, projectContext:retriever, adapter, providerRunner });
  const status = runner.availability();
  assert.equal(status.localLiteral.available, true);
  assert.equal(status.routing.mode, 'chat-first-provider-pure');
  assert.equal(status.routing.cliFallback, false);
  assert.equal(status.routing.providerWeb, 'MANUAL_ONLY');
  assert.deepEqual(runner.allowlist, ['chatgpt','claude','gemini','deepseek']);
  assert.equal(findExecutable('rwacode-command-that-must-not-exist-987654321', { PATH:'' }), null);
});
