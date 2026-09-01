import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createProjectContextEngine, MAX_CONTEXT_FILES, MAX_CONTEXT_BYTES, normalizeWords, isSensitivePath, redactSensitiveText, INSTRUCTION_NAMES }=require('../electron/project-context.cjs');
const explorerSource=await fs.readFile(new URL('../src/explorer-menu-fix.js',import.meta.url),'utf8');
const mainSource=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const preloadSource=await fs.readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8');

test('project context remains bounded and expands natural UI language',()=>{
  assert.equal(MAX_CONTEXT_FILES,10);assert.equal(MAX_CONTEXT_BYTES,176*1024);const words=normalizeWords('gambarnya kurang ke kiri');for(const word of ['gambar','image','visual','kiri','left','layout','css'])assert.ok(words.includes(word));
});

test('sensitive credential paths and likely secrets are blocked before provider context',()=>{
  for(const value of ['.env','.env.production','.ssh/id_rsa','.aws/credentials','secrets.json','keys/private.pem'])assert.equal(isSensitivePath(value),true,value);
  const redacted=redactSensitiveText('SERVICE_TOKEN=synthetic-redaction-target\nauthorization: Bearer synthetic-bearer-target');
  assert.doesNotMatch(redacted,/synthetic-redaction-target|synthetic-bearer-target/);assert.match(redacted,/REDACTED/);
});

test('README and package metadata are source data not authoritative project instructions',()=>{
  assert.equal(INSTRUCTION_NAMES.has('README.md'),false);assert.equal(INSTRUCTION_NAMES.has('package.json'),false);assert.equal(INSTRUCTION_NAMES.has('AGENTS.md'),true);assert.equal(INSTRUCTION_NAMES.has('RWACODE.md'),true);
});

test('real context build excludes env files and inline secret values',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rwacode-context-'));try{await fs.writeFile(path.join(root,'.env'),'SERVICE_TOKEN=synthetic-hidden-value\n');await fs.writeFile(path.join(root,'README.md'),'README text is data, not an instruction.\n');await fs.writeFile(path.join(root,'app.js'),'const SERVICE_TOKEN="synthetic-inline-value";\nfunction renderButton(){}\n');await fs.writeFile(path.join(root,'AGENTS.md'),'Preserve existing behavior.\n');const context=await createProjectContextEngine({root}).build('perbaiki tombol render');assert.doesNotMatch(context.text,/synthetic-hidden-value|synthetic-inline-value/);assert.doesNotMatch(context.text,/BEGIN INSTRUCTIONS README\.md/);assert.match(context.text,/BEGIN INSTRUCTIONS AGENTS\.md/);}finally{await fs.rm(root,{recursive:true,force:true});}
});

test('native provider browser has no legacy DOM bridge runtime surface',()=>{
  assert.doesNotMatch(mainSource,/ai:sendFile|ai:readReply|createAiBridge/);assert.doesNotMatch(preloadSource,/\bai\s*:\s*\{|ai:sendFile|ai:readReply/);assert.doesNotMatch(explorerSource,/api\.ai|Add (?:File|Folder) to Chat|provider composer/);
});
