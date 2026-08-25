import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {approvedRoot,commandFor} from "../src/policy.mjs";

test("allowlisted developer and agent commands only",()=>{
  assert.deepEqual(commandFor("git_status"),["git",["status","--short"]]);
  const [node,agent]=commandFor("agent",["fix tests"]);
  assert.equal(node,process.execPath);
  assert.ok(agent[0].endsWith("agent-runtime/bin/opentrue.mjs"));
  assert.deepEqual(agent.slice(1),["agent","--yes","fix tests"]);
  const [,push]=commandFor("git_push");assert.deepEqual(push.slice(-2),["push","--yes"]);
  assert.throws(()=>commandFor("rm"),/allowlisted/);
  assert.throws(()=>commandFor("shell"),/allowlisted/);
});

test("workspace remains inside approved roots and rejects symlink escape",async()=>{
  const root=await mkdtemp(join(tmpdir(),"bridge-")),outside=await mkdtemp(join(tmpdir(),"bridge-outside-"));
  try{
    assert.equal(await approvedRoot(root,[root]),root);
    await assert.rejects(()=>approvedRoot(tmpdir(),[root]),/outside/);
    const link=join(root,"escape");await symlink(outside,link);
    await assert.rejects(()=>approvedRoot(link,[root]),/outside/);
  }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}
});
