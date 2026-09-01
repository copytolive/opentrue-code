import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createPathGuard }=require('../lib/path-guard.cjs');
const { assertOfficialEndpoint, availability }=require('../electron/provider-chat-runner.cjs');
const { isSensitivePath, redactSensitiveText }=require('../electron/project-context.cjs');

test('path guard allows files inside root and rejects read/write escape attempts',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rwacode-root-'));const outside=fs.mkdtempSync(path.join(os.tmpdir(),'rwacode-outside-'));
  try{
    fs.writeFileSync(path.join(root,'inside.txt'),'ok');fs.writeFileSync(path.join(outside,'outside.txt'),'no');fs.symlinkSync(outside,path.join(root,'escape-link'));fs.symlinkSync(path.join(outside,'outside.txt'),path.join(root,'write-escape.txt'));const guard=createPathGuard(root);
    assert.equal(guard.resolveExisting('inside.txt'),fs.realpathSync.native(path.join(root,'inside.txt')));assert.throws(()=>guard.resolveExisting('../outside.txt'));assert.throws(()=>guard.resolveExisting('escape-link/outside.txt'));assert.throws(()=>guard.resolveExisting('/etc/passwd'));assert.throws(()=>guard.resolveWritable('../new.txt'));assert.throws(()=>guard.resolveWritable('write-escape.txt'));assert.equal(guard.resolveWritable('new-inside.txt'),path.join(fs.realpathSync.native(root),'new-inside.txt'));
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
});

test('external browser webContents stay sandboxed Node-free and have no localhost server',()=>{
  const source=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');assert.match(source,/sandbox:\s*true/);assert.match(source,/contextIsolation:\s*true/);assert.match(source,/nodeIntegration:\s*false/);assert.doesNotMatch(source,/http\.createServer|express\(|fastify\(|listen\(/);
});

test('official provider automation is restricted to exact HTTPS API hosts',()=>{
  assert.equal(assertOfficialEndpoint('chatgpt','https://api.openai.com/v1/responses'),'https://api.openai.com/v1/responses');assert.equal(assertOfficialEndpoint('claude','https://api.anthropic.com/v1/messages'),'https://api.anthropic.com/v1/messages');assert.throws(()=>assertOfficialEndpoint('chatgpt','https://chatgpt.com/'),/official host/);assert.throws(()=>assertOfficialEndpoint('claude','https://example.com/'),/official host/);
  const none=availability({});for(const id of ['chatgpt','claude','gemini','deepseek'])assert.equal(none[id].available,false);
});

test('secret-bearing paths and likely inline credentials are excluded or redacted before provider context',()=>{
  for(const value of ['.env','.env.production','.ssh/id_rsa','.aws/credentials','secret/private.pem'])assert.equal(isSensitivePath(value),true,value);
  const text=redactSensitiveText('OPENAI_API_KEY=sk-secret-value\npassword: hunter2\nghp_abcdefghijklmnopqrstuvwxyz123456');assert.doesNotMatch(text,/sk-secret-value|hunter2|ghp_abcdefghijklmnopqrstuvwxyz123456/);assert.match(text,/REDACTED/);
});

test('native provider bridge implementation is physically absent',()=>{
  const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  for(const source of [main,preload])assert.doesNotMatch(source,/createAiBridge|ai:sendFile|ai:readReply|executeJavaScript|prompt-textarea|send-button/);assert.doesNotMatch(pkg.scripts.check,/ai-bridge\.cjs|chat-first-ui\.js/);
});

test('preload exposes only explicit allowlisted IPC methods',()=>{
  const source=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');assert.match(source,/contextBridge\.exposeInMainWorld\('rwacode'/);assert.doesNotMatch(source,/child_process|exec\(|spawn\(|require\(['"]fs['"]\)|executeJavaScript/);
});
