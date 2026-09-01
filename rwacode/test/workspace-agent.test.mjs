import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createWorkspaceRetriever }=require('../electron/workspace-retriever.cjs');
const { createLocalWorkspaceAdapter }=require('../electron/workspace-adapter.cjs');
const { createAgentRunner, parseLiteralTask }=require('../electron/agent-runner.cjs');
const { createTransactionEngine }=require('../electron/transaction-engine.cjs');
const { createWorkspaceAgent, parseManualChangeSet }=require('../electron/workspace-agent.cjs');
function root(){return fs.mkdtempSync(path.join(os.tmpdir(),'rwacode-agent-'));}

test('natural task locates VALUE assignment edits real disk and Undo restores exact BEFORE bytes',async()=>{
  const workspace=root();try{
    const evidenceDir=path.join(workspace,'05_HANDOFF_EVIDENCE');fs.mkdirSync(evidenceDir);const target=path.join(evidenceDir,'RWACODE_AGENT_BRIDGE_E2E.txt');const before=Buffer.from('RWACODE_AGENT_BRIDGE_E2E\nVERSION=1\nSTATUS=BEFORE\nVALUE=12345\n');fs.writeFileSync(target,before);fs.mkdirSync(path.join(workspace,'src'));fs.writeFileSync(path.join(workspace,'src','unrelated.js'),'const other = 1;\n');
    const agent=createWorkspaceAgent({root:workspace,journalPath:path.join(workspace,'.rwacode','transactions.jsonl')});const planned=await agent.plan('ubah VALUE menjadi 22222');assert.equal(planned.status,'PREPARED');assert.equal(planned.runner,'local-literal');assert.deepEqual(planned.touched,['05_HANDOFF_EVIDENCE/RWACODE_AGENT_BRIDGE_E2E.txt']);assert.match(planned.diff,/-VALUE=12345/);assert.match(planned.diff,/\+VALUE=22222/);assert.deepEqual(fs.readFileSync(target),before);
    const applied=await agent.apply(planned.id);assert.equal(applied.status,'APPLIED');assert.match(fs.readFileSync(target,'utf8'),/VALUE=22222/);assert.equal((await agent.status()).transaction.undoAvailable,true);const undone=await agent.undo(applied.id);assert.equal(undone.status,'UNDONE');assert.deepEqual(fs.readFileSync(target),before);
  }finally{fs.rmSync(workspace,{recursive:true,force:true});}
});

test('safe Indonesian literal shorthand is accepted',()=>{
  assert.deepEqual(parseLiteralTask('RWACODEGITHUBVALUE menjadi 22222'),{key:'RWACODEGITHUBVALUE',value:'22222'});assert.deepEqual(parseLiteralTask('VALUE ke 20'),{key:'VALUE',value:'20'});assert.equal(parseLiteralTask('tolong ubah sesuatu'),null);
});

test('same-value literal returns NO_CHANGE without disk mutation',async()=>{
  const workspace=root();try{const target=path.join(workspace,'config.txt');fs.writeFileSync(target,'VALUE=10\n');const agent=createWorkspaceAgent({root:workspace});const result=await agent.plan('ubah VALUE menjadi 10');assert.equal(result.status,'NO_CHANGE');assert.equal(result.id,null);assert.deepEqual(result.touched,[]);assert.equal(fs.readFileSync(target,'utf8'),'VALUE=10\n');}finally{fs.rmSync(workspace,{recursive:true,force:true});}
});

test('free-form task is fail-closed NO_AI_API and does not mutate disk',async()=>{
  const workspace=root();try{const target=path.join(workspace,'index.html');const before=Buffer.from('<!doctype html>\n<button>Old</button>\n');fs.writeFileSync(target,before);const adapter=createLocalWorkspaceAdapter({root:workspace});const retriever=createWorkspaceRetriever({root:workspace});const runner=createAgentRunner({root:workspace,projectContext:retriever,adapter});await assert.rejects(runner.plan('tambahkan tombol Full Screen yang kompleks'),/NO_AI_API/);assert.deepEqual(fs.readFileSync(target),before);assert.equal(runner.availability().routing.mode,'NO_AI_API');assert.equal(runner.availability().routing.providerApi,false);assert.deepEqual(runner.allowlist,[]);}finally{fs.rmSync(workspace,{recursive:true,force:true});}
});

test('manual ChangeSet review uses Transaction Engine and exact Undo',async()=>{
  const workspace=root();try{const target=path.join(workspace,'index.html');const before=Buffer.from('<!doctype html>\n<button id="old">Old</button>\n');fs.writeFileSync(target,before);const agent=createWorkspaceAgent({root:workspace,journalPath:path.join(workspace,'.journal','tx.jsonl')});const planned=await agent.prepareChangeSet({version:1,summary:'Add fullscreen',operations:[{type:'MODIFY',path:'index.html',content:'<!doctype html>\n<button id="old">Old</button>\n<button id="fullscreen">Full Screen</button>\n'}]});assert.equal(planned.status,'PREPARED');assert.equal(planned.runner,'manual-changeset');assert.deepEqual(fs.readFileSync(target),before);await agent.apply(planned.id);assert.match(fs.readFileSync(target,'utf8'),/id="fullscreen"/);await agent.undo(planned.id);assert.deepEqual(fs.readFileSync(target),before);}finally{fs.rmSync(workspace,{recursive:true,force:true});}
});

test('manual ChangeSet parser accepts JSON and rejects invalid input',()=>{
  assert.equal(parseManualChangeSet('{"version":1,"operations":[{"type":"CREATE","path":"x.txt","content":"x"}]}').version,1);
  assert.throws(()=>parseManualChangeSet('not json'),/valid JSON/);
  assert.throws(()=>parseManualChangeSet(''),/Paste a ChangeSet/);
});

test('bounded index includes root files before deep content exhausts cap',async()=>{
  const workspace=root();try{const target=path.join(workspace,'RWACODE_REAL_MAC_E2E.txt');fs.writeFileSync(target,'RWACODE_REAL_MAC_E2E\nRWACODEVALUE=12345\n');const crowded=path.join(workspace,'00_CROWDED');fs.mkdirSync(crowded);for(let index=0;index<2610;index+=1)fs.writeFileSync(path.join(crowded,`f-${String(index).padStart(4,'0')}.txt`),`FILLER_${index}=1\n`);const agent=createWorkspaceAgent({root:workspace});const planned=await agent.plan('ubah RWACODEVALUE menjadi 22222');assert.equal(planned.status,'PREPARED');assert.deepEqual(planned.touched,['RWACODE_REAL_MAC_E2E.txt']);assert.match(fs.readFileSync(target,'utf8'),/RWACODEVALUE=12345/);}finally{fs.rmSync(workspace,{recursive:true,force:true});}
});

test('Run Local never auto-applies; explicit Apply is required',async()=>{
  const workspace=root();try{fs.writeFileSync(path.join(workspace,'config.txt'),'VALUE=10\n');const agent=createWorkspaceAgent({root:workspace,journalPath:path.join(workspace,'.journal','tx.jsonl')});const prepared=await agent.plan('ubah VALUE menjadi 20');assert.equal(prepared.status,'PREPARED');assert.equal(fs.readFileSync(path.join(workspace,'config.txt'),'utf8'),'VALUE=10\n');await agent.apply(prepared.id);assert.equal(fs.readFileSync(path.join(workspace,'config.txt'),'utf8'),'VALUE=20\n');await agent.undo(prepared.id);assert.equal(fs.readFileSync(path.join(workspace,'config.txt'),'utf8'),'VALUE=10\n');}finally{fs.rmSync(workspace,{recursive:true,force:true});}
});

test('multi-file transaction restores every BEFORE state',async()=>{
  const workspace=root();try{fs.writeFileSync(path.join(workspace,'a.txt'),'A=1\n');fs.writeFileSync(path.join(workspace,'b.txt'),'B=1\n');const adapter=createLocalWorkspaceAdapter({root:workspace});const tx=createTransactionEngine({adapter});const prepared=await tx.prepare({version:1,summary:'two files',operations:[{type:'MODIFY',path:'a.txt',content:'A=2\n'},{type:'MODIFY',path:'b.txt',content:'B=2\n'}]});await tx.apply(prepared.id);await tx.undo(prepared.id);assert.equal(fs.readFileSync(path.join(workspace,'a.txt'),'utf8'),'A=1\n');assert.equal(fs.readFileSync(path.join(workspace,'b.txt'),'utf8'),'B=1\n');}finally{fs.rmSync(workspace,{recursive:true,force:true});}
});

test('agent transaction rejects traversal and symlink escape paths',async()=>{
  const workspace=root();const outside=root();try{fs.writeFileSync(path.join(workspace,'safe.txt'),'ok\n');fs.writeFileSync(path.join(outside,'outside.txt'),'outside\n');fs.symlinkSync(path.join(outside,'outside.txt'),path.join(workspace,'escape.txt'));const adapter=createLocalWorkspaceAdapter({root:workspace});const tx=createTransactionEngine({adapter});await assert.rejects(tx.prepare({version:1,operations:[{type:'MODIFY',path:'../oops.txt',content:'x'}]}));await assert.rejects(tx.prepare({version:1,operations:[{type:'MODIFY',path:'escape.txt',content:'x'}]}));}finally{fs.rmSync(workspace,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
});

test('runner availability is explicit NO_AI_API with manual review and no fallback',()=>{
  const workspace=root();try{fs.writeFileSync(path.join(workspace,'demo.txt'),'hello\n');const adapter=createLocalWorkspaceAdapter({root:workspace});const retriever=createWorkspaceRetriever({root:workspace});const runner=createAgentRunner({root:workspace,projectContext:retriever,adapter});const status=runner.availability();assert.equal(status.localLiteral.available,true);assert.equal(status.manualChangeSet.available,true);assert.equal(status.routing.mode,'NO_AI_API');assert.equal(status.routing.cliFallback,false);assert.equal(status.routing.providerWeb,'MANUAL_ONLY');assert.equal(status.routing.providerApi,false);assert.deepEqual(runner.allowlist,[]);}finally{fs.rmSync(workspace,{recursive:true,force:true});}
});
