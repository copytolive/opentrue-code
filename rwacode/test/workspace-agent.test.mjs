import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkspaceRetriever } = require('../electron/workspace-retriever.cjs');
const { createLocalWorkspaceAdapter } = require('../electron/workspace-adapter.cjs');
const { createAgentRunner, findExecutable } = require('../electron/agent-runner.cjs');
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
  const prepared = await tx.prepare({ version:1, summary:'two files', operations:[
    { type:'MODIFY', path:'a.txt', content:'A=2\n' },
    { type:'MODIFY', path:'b.txt', content:'B=2\n' },
  ]});
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

test('runner availability is explicit; unsafe headless runners stay detected but disabled', () => {
  const workspace = root();
  fs.writeFileSync(path.join(workspace, 'demo.txt'), 'hello\n');
  const adapter = createLocalWorkspaceAdapter({ root:workspace });
  const retriever = createWorkspaceRetriever({ root:workspace });
  const runner = createAgentRunner({ root:workspace, projectContext:retriever, adapter });
  const status = runner.availability();
  assert.equal(status.localLiteral.available, true);
  assert.equal(typeof status.claude.available, 'boolean');
  assert.equal(status.gemini.available, false);
  assert.equal(typeof status.gemini.detected, 'boolean');
  assert.match(status.gemini.mode, /disabled-headless-plan/);
  assert.equal(status.codex.available, false);
  assert.equal(typeof status.codex.detected, 'boolean');
  assert.equal(findExecutable('rwacode-command-that-must-not-exist-987654321', { PATH:'' }), null);
});
