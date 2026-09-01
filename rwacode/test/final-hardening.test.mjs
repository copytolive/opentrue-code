import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createLocalWorkspaceAdapter }=require('../electron/workspace-adapter.cjs');
const { createTransactionEngine, MAX_TRANSACTION_BYTES, MAX_DIFF_BYTES }=require('../electron/transaction-engine.cjs');
const { createWorkspaceAgent }=require('../electron/workspace-agent.cjs');
const { createAgentRunner }=require('../electron/agent-runner.cjs');
const { createWorkspaceRetriever }=require('../electron/workspace-retriever.cjs');
const ipcGuardSource=await fs.readFile(new URL('../electron/ipc-guard.cjs',import.meta.url),'utf8');
const agentSource=await fs.readFile(new URL('../src/agent-ui.js',import.meta.url),'utf8');
const explorerSource=await fs.readFile(new URL('../src/explorer-menu-fix.js',import.meta.url),'utf8');

async function tempWorkspace(prefix='rwacode-hardening-'){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),prefix));
  const durable=path.join(root,'.durable-test-outside-workspace');
  return {root,durable,cleanup:()=>fs.rm(root,{recursive:true,force:true})};
}

test('durable APPLIED transaction remains exact-Undo-able after engine restart',async()=>{
  const t=await tempWorkspace();try{const file=path.join(t.root,'fixture.txt');const before=Buffer.from('VALUE=12345\n');await fs.writeFile(file,before);const adapter=createLocalWorkspaceAdapter({root:t.root});const engine1=createTransactionEngine({adapter,durableDir:t.durable});const prepared=await engine1.prepare({version:1,summary:'change',operations:[{type:'MODIFY',path:'fixture.txt',content:'VALUE=22222\n'}]});await engine1.apply(prepared.id);assert.equal(await fs.readFile(file,'utf8'),'VALUE=22222\n');const engine2=createTransactionEngine({adapter,durableDir:t.durable});const status=await engine2.status();assert.equal(status.undoAvailable,true);assert.equal(status.lastTransaction.id,prepared.id);assert.equal(status.durable,true);await engine2.undo(prepared.id);assert.deepEqual(await fs.readFile(file),before);}finally{await t.cleanup();}
});

test('interrupted APPLYING transaction rolls back automatically on restart',async()=>{
  const t=await tempWorkspace();try{const file=path.join(t.root,'fixture.txt');const before=Buffer.from('STATUS=BEFORE\n');await fs.writeFile(file,before);const adapter=createLocalWorkspaceAdapter({root:t.root});const engine=createTransactionEngine({adapter,durableDir:t.durable});const prepared=await engine.prepare({version:1,summary:'crash simulation',operations:[{type:'MODIFY',path:'fixture.txt',content:'STATUS=HALF_APPLIED\n'}]});const durableFile=path.join(t.durable,`${prepared.id}.json`);const raw=JSON.parse(await fs.readFile(durableFile,'utf8'));raw.status='APPLYING';await fs.writeFile(durableFile,JSON.stringify(raw));await fs.writeFile(file,'STATUS=HALF_APPLIED\n');const recovered=createTransactionEngine({adapter,durableDir:t.durable});await recovered.status();assert.deepEqual(await fs.readFile(file),before);const recoveredRaw=JSON.parse(await fs.readFile(durableFile,'utf8'));assert.equal(recoveredRaw.status,'RECOVERED_ROLLBACK');}finally{await t.cleanup();}
});

test('nested CREATE is root locked and Undo removes directories created by the transaction',async()=>{
  const t=await tempWorkspace();try{const adapter=createLocalWorkspaceAdapter({root:t.root});const engine=createTransactionEngine({adapter,durableDir:t.durable});const tx=await engine.prepare({version:1,summary:'nested create',operations:[{type:'CREATE',path:'src/components/demo/file.txt',content:'hello\n'}]});await engine.apply(tx.id);assert.equal(await fs.readFile(path.join(t.root,'src/components/demo/file.txt'),'utf8'),'hello\n');await engine.undo(tx.id);await assert.rejects(fs.stat(path.join(t.root,'src')),/ENOENT/);}finally{await t.cleanup();}
});

test('RENAME with final content is one atomic transaction and Undo restores source bytes',async()=>{
  const t=await tempWorkspace();try{const before=Buffer.from('OLD\n');await fs.writeFile(path.join(t.root,'old.txt'),before);const adapter=createLocalWorkspaceAdapter({root:t.root});const engine=createTransactionEngine({adapter,durableDir:t.durable});const tx=await engine.prepare({version:1,summary:'rename edit',operations:[{type:'RENAME',path:'old.txt',to:'nested/new.txt',content:'NEW\n'}]});await engine.apply(tx.id);assert.equal(await fs.readFile(path.join(t.root,'nested/new.txt'),'utf8'),'NEW\n');await assert.rejects(fs.stat(path.join(t.root,'old.txt')),/ENOENT/);await engine.undo(tx.id);assert.deepEqual(await fs.readFile(path.join(t.root,'old.txt')),before);await assert.rejects(fs.stat(path.join(t.root,'nested')),/ENOENT/);}finally{await t.cleanup();}
});

test('same-value literal task returns NO_CHANGE instead of an error transaction',async()=>{
  const t=await tempWorkspace();try{await fs.writeFile(path.join(t.root,'fixture.txt'),'VALUE=12345\n');const agent=createWorkspaceAgent({root:t.root,journalPath:path.join(t.root,'.journal','journal.jsonl')});const result=await agent.plan('ubah VALUE menjadi 12345');assert.equal(result.status,'NO_CHANGE');assert.equal(result.id,null);assert.deepEqual(result.changeSet.operations,[]);assert.equal((await agent.status()).transaction.undoAvailable,false);}finally{await t.cleanup();}
});

test('NO_AI_API availability never enables provider or CLI fallback',async()=>{
  const t=await tempWorkspace();try{await fs.writeFile(path.join(t.root,'fixture.txt'),'VALUE=1\n');const adapter=createLocalWorkspaceAdapter({root:t.root});const context=createWorkspaceRetriever({root:t.root});const runner=createAgentRunner({root:t.root,projectContext:context,adapter});const status=runner.availability();assert.equal(status.routing.mode,'NO_AI_API');assert.equal(status.routing.providerApi,false);assert.equal(status.routing.providerAutomation,false);assert.equal(status.routing.cliFallback,false);assert.equal(status.routing.providerWeb,'MANUAL_ONLY');assert.deepEqual(runner.allowlist,[]);}finally{await t.cleanup();}
});

test('privileged shell has global sender/frame IPC guard and exact navigation pin',()=>{
  assert.match(ipcGuardSource,/ipcMain\.handle\s*=/);assert.match(ipcGuardSource,/untrusted sender/);assert.match(ipcGuardSource,/untrusted frame/);assert.match(ipcGuardSource,/SHELL_ENTRY/);assert.match(ipcGuardSource,/will-navigate/);assert.match(ipcGuardSource,/will-redirect/);
});

test('UI binds Undo to source identity, requires Review Apply, and remote Explorer stays read-only',()=>{
  assert.match(agentSource,/appliedBySource/);assert.match(agentSource,/transactionSourceById/);assert.match(agentSource,/preparedIdentity!==currentIdentity\(\)/);assert.match(agentSource,/NO_CHANGE/);assert.match(agentSource,/Review ChangeSet/);assert.match(agentSource,/agentApplyButton/);assert.doesNotMatch(agentSource,/agentMode|auto.*apply/i);
  assert.match(explorerSource,/@(?:GitHub|GoogleDrive) Explorer is read-only|Explorer is read-only/);assert.match(explorerSource,/showContextMenu/);assert.doesNotMatch(explorerSource,/chat-first-active|rwacode\.chat-first\.v2/);
});

test('transaction budgets are finite',()=>{assert.equal(MAX_TRANSACTION_BYTES,8*1024*1024);assert.equal(MAX_DIFF_BYTES,384*1024);});
