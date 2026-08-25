import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {run} from "../src/runtime.mjs";
import {runAutopilot} from "../src/autopilot.mjs";

async function fixture(){const root=await mkdtemp(join(tmpdir(),"opentrue-autopilot-"));await run("git",["init","-b","main"],{cwd:root});await run("git",["config","user.email","ci@opentrue.invalid"],{cwd:root});await run("git",["config","user.name","CI"],{cwd:root});await writeFile(join(root,"app.js"),"export const value = 1\n");await writeFile(join(root,"package.json"),JSON.stringify({scripts:{}},null,2));await run("git",["add","-A"],{cwd:root});await run("git",["commit","-m","init"],{cwd:root});return root}

test("autopilot requires write approval then edits verifies commits and Bugbot reviews",async()=>{const root=await fixture();try{const manifest={task:"change value to two",verifyProfiles:[],git:{branchName:"value-two",commitMessage:"value two"}};const blocked=await runAutopilot(root,manifest,{approvedWrites:false});assert.equal(blocked.status,"WAITING_APPROVAL");let turn=0;const router={chat:async()=>{turn++;return turn===1?{model:"fake",content:JSON.stringify({action:"apply_hunks",file:"app.js",hunks:[{id:"v",start:1,end:1,replacement:"export const value = 2"}]})}:{model:"fake",content:JSON.stringify({action:"finish",summary:"done"})}}};const result=await runAutopilot(root,manifest,{approvedWrites:true,router});assert.equal(result.status,"SUCCEEDED");assert.match(await readFile(join(root,"app.js"),"utf8"),/value = 2/);assert.ok(result.timeline.some(x=>x.stage==="commit"&&x.status==="PASS"));assert.ok(result.timeline.some(x=>x.stage==="bugbot"&&x.status==="PASS"));}finally{await rm(root,{recursive:true,force:true})}});
