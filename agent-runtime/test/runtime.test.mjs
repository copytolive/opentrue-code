import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {AgentCore,FleetScheduler,allowedBrowserUrl,applyHunks,bugbot,buildRepoIndex,createCheckpoint,dependencyGraph,findSymbol,previewHunks,repoRoot,restoreCheckpoint,run,searchIndex} from "../src/runtime.mjs";

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),"opentrue-agent-"));
  await run("git",["init","-b","main"],{cwd:root});await run("git",["config","user.email","ci@opentrue.invalid"],{cwd:root});await run("git",["config","user.name","OpenTrue CI"],{cwd:root});
  await mkdir(join(root,"src"),{recursive:true});
  await writeFile(join(root,"package.json"),JSON.stringify({scripts:{test:"node --test"}},null,2));
  await writeFile(join(root,"AGENTS.md"),"# Rules\nNever expose secrets.\n");
  await writeFile(join(root,"src","math.js"),"export function add(a,b){ return a+b }\nexport const answer = 42\n");
  await writeFile(join(root,"src","main.js"),"import {add} from './math.js'\nconsole.log(add(2,3))\n");
  await run("git",["add","-A"],{cwd:root});await run("git",["commit","-m","fixture"],{cwd:root});return root;
}

test("repo intelligence indexes, searches, graphs and resolves symbols",async()=>{const root=await fixture();try{assert.equal(await repoRoot(join(root,"src")),root);const idx=await buildRepoIndex(root);assert.ok(idx.files.length>=4);const hits=searchIndex(idx,"add math",5);assert.equal(hits[0].path,"src/math.js");const deps=dependencyGraph(idx);assert.deepEqual(deps["src/main.js"],["./math.js"]);const refs=findSymbol(idx,"add");assert.ok(refs.some(x=>x.path==="src/math.js"&&x.defined));assert.ok(refs.some(x=>x.path==="src/main.js"));}finally{await rm(root,{recursive:true,force:true})}});

test("edit engine previews and applies only accepted hunks",async()=>{const root=await fixture();try{const hunks=[{id:"a",start:1,end:1,replacement:"export function add(a,b){ return Number(a)+Number(b) }"},{id:"b",start:2,end:2,replacement:"export const answer = 43"}];const p=await previewHunks(root,"src/math.js",hunks,["b"]);assert.match(p.proposed,/answer = 43/);assert.match(p.proposed,/return a\+b/);await assert.rejects(()=>applyHunks(root,"src/math.js",hunks,["a"],{approved:false}),/approval/);await applyHunks(root,"src/math.js",hunks,["a"],{approved:true});const text=await readFile(join(root,"src/math.js"),"utf8");assert.match(text,/Number\(a\)/);assert.match(text,/answer = 42/);}finally{await rm(root,{recursive:true,force:true})}});

test("checkpoint restores tracked and untracked workspace state",async()=>{const root=await fixture();try{await writeFile(join(root,"src","math.js"),"changed-before-checkpoint\n");await writeFile(join(root,"scratch.txt"),"scratch-before\n");const cp=await createCheckpoint(root,"before-agent");await writeFile(join(root,"src","math.js"),"changed-after\n");await writeFile(join(root,"scratch.txt"),"scratch-after\n");await writeFile(join(root,"later.txt"),"remove-me\n");await assert.rejects(()=>restoreCheckpoint(root,cp.id),/explicit force/);await restoreCheckpoint(root,cp.id,{force:true});assert.equal(await readFile(join(root,"src","math.js"),"utf8"),"changed-before-checkpoint\n");assert.equal(await readFile(join(root,"scratch.txt"),"utf8"),"scratch-before\n");await assert.rejects(()=>readFile(join(root,"later.txt"),"utf8"));}finally{await rm(root,{recursive:true,force:true})}});

test("browser policy defaults fail closed",()=>{assert.equal(allowedBrowserUrl("http://localhost:3000"),true);assert.equal(allowedBrowserUrl("https://127.0.0.1:8443"),true);assert.equal(allowedBrowserUrl("https://example.com"),false);assert.equal(allowedBrowserUrl("https://preview.example.com",["preview.example.com"]),true);assert.equal(allowedBrowserUrl("file:///etc/passwd"),false)});

test("fleet scheduler chooses online least-loaded capable worker",()=>{const f=new FleetScheduler(10000);f.heartbeat({id:"a",capabilities:["code","gpu"],queueDepth:3,freeVramMb:20000});f.heartbeat({id:"b",capabilities:["code","gpu"],queueDepth:1,freeVramMb:10000});f.heartbeat({id:"c",capabilities:["code"],queueDepth:0});assert.equal(f.choose({capabilities:["gpu"]}).id,"b");assert.equal(f.snapshot().filter(x=>x.online).length,3)});

test("Bugbot flags newly introduced dangerous code",async()=>{const root=await fixture();try{const name="api"+"Key",value="abcdefghijklmnop";await writeFile(join(root,"src","danger.js"),`const ${name} = '${value}';\neval(userInput);\n`);await run("git",["add","-A"],{cwd:root});await run("git",["commit","-m","danger"],{cwd:root});const r=await bugbot(root,{base:"HEAD~1"});assert.equal(r.ok,false);assert.ok(r.findings.some(x=>x.severity==="critical"));assert.ok(r.findings.some(x=>x.message.includes("eval")));}finally{await rm(root,{recursive:true,force:true})}});

test("Ask and Plan modes are read-only and Agent waits for approval",async()=>{const root=await fixture();try{const replies=[{content:"Repository answer",model:"fake",durationMs:1,attempts:[]},{content:"Implementation plan",model:"fake",durationMs:1,attempts:[]},{content:JSON.stringify({action:"apply_hunks",file:"src/math.js",hunks:[{id:"x",start:2,end:2,replacement:"export const answer = 99"}]}),model:"fake",durationMs:1,attempts:[]}];const router={chat:async()=>replies.shift()};const core=new AgentCore(root,{router});const ask=await core.run({mode:"ask",task:"what is add?"});assert.equal(ask.content,"Repository answer");const plan=await core.run({mode:"plan",task:"change answer"});assert.equal(plan.content,"Implementation plan");const agent=await core.run({mode:"agent",task:"change answer",approved:false,maxTurns:1});assert.equal(agent.status,"WAITING_APPROVAL");assert.match(await readFile(join(root,"src","math.js"),"utf8"),/answer = 42/);}finally{await rm(root,{recursive:true,force:true})}});
