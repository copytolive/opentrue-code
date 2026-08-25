import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {run} from "../src/runtime.mjs";
import {applyPatchSet,streamPatchSet} from "../src/edit-engine.mjs";

async function fixture(){const root=await mkdtemp(join(tmpdir(),"opentrue-edit-"));await run("git",["init","-b","main"],{cwd:root});await run("git",["config","user.email","ci@opentrue.invalid"],{cwd:root});await run("git",["config","user.name","CI"],{cwd:root});await writeFile(join(root,"a.txt"),"one\ntwo\n");await writeFile(join(root,"b.txt"),"alpha\nbeta\n");await run("git",["add","-A"],{cwd:root});await run("git",["commit","-m","init"],{cwd:root});return root}

test("patchset streams diff and applies accepted hunks across files",async()=>{const root=await fixture();try{const patchset={label:"two files",files:[{file:"a.txt",hunks:[{id:"a1",start:2,end:2,replacement:"TWO"}]},{file:"b.txt",hunks:[{id:"b1",start:1,end:1,replacement:"ALPHA"},{id:"b2",start:2,end:2,replacement:"BETA"}],acceptedIds:["b2"]}]};const events=[];for await(const e of streamPatchSet(root,patchset))events.push(e);assert.ok(events.some(x=>x.type==="diff.line"&&x.file==="a.txt"&&x.kind==="add"));await assert.rejects(()=>applyPatchSet(root,patchset),/approval/);const result=await applyPatchSet(root,patchset,{approved:true});assert.equal(result.status,"APPLIED");assert.equal(await readFile(join(root,"a.txt"),"utf8"),"one\nTWO\n");assert.equal(await readFile(join(root,"b.txt"),"utf8"),"alpha\nBETA\n");assert.ok(result.checkpoint.id);}finally{await rm(root,{recursive:true,force:true})}});
