import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {run} from "../src/runtime.mjs";
import {runMultiRepo} from "../src/multi-repo.mjs";

async function repo(name){
  const root=await mkdtemp(join(tmpdir(),`opentrue-${name}-`));await run("git",["init","-b","main"],{cwd:root});await run("git",["config","user.email","ci@opentrue.invalid"],{cwd:root});await run("git",["config","user.name","CI"],{cwd:root});
  await mkdir(join(root,"src"),{recursive:true});await writeFile(join(root,"src",`${name}.js`),`export const ${name} = true\n`);await writeFile(join(root,"AGENTS.md"),"# Rules\nKeep changes scoped.\n");await run("git",["add","-A"],{cwd:root});await run("git",["commit","-m","init"],{cwd:root});return root;
}

test("multi-repo coordinator plans read-only, then executes approved repos",async()=>{
  const frontend=await repo("frontend"),backend=await repo("backend");
  try{
    const router={chat:async messages=>{
      const system=messages[0]?.content||"";
      if(system.includes("coordinate changes spanning multiple"))return {model:"fake",content:JSON.stringify({summary:"split work",projects:[{name:"front",task:"inspect frontend"},{name:"back",task:"inspect backend"}]})};
      return {model:"fake",content:JSON.stringify({action:"finish",summary:"verified"})};
    }};
    const manifest={objective:"keep API and UI aligned",projects:[{name:"front",root:frontend,role:"frontend"},{name:"back",root:backend,role:"backend"}]};
    const plan=await runMultiRepo(manifest,{approved:false,router});assert.equal(plan.status,"WAITING_APPROVAL");assert.equal(plan.plan.projects.length,2);
    const result=await runMultiRepo(manifest,{approved:true,router,concurrency:2});assert.equal(result.status,"SUCCEEDED");assert.equal(result.results.length,2);assert.ok(result.checkpoints.front.id);assert.ok(result.checkpoints.back.id);
  }finally{await rm(frontend,{recursive:true,force:true});await rm(backend,{recursive:true,force:true});}
});
