import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {run} from "../src/runtime.mjs";
import {semanticSearch} from "../src/semantic-index.mjs";

test("semantic search uses deterministic offline fallback when embedding endpoint is unavailable",async()=>{
  const root=await mkdtemp(join(tmpdir(),"opentrue-semantic-"));
  const old=process.env.OLLAMA_URL;process.env.OLLAMA_URL="http://127.0.0.1:9";
  try{
    await run("git",["init","-b","main"],{cwd:root});await writeFile(join(root,"auth.js"),"export function verifySession(token){ return Boolean(token) }\n");
    const result=await semanticSearch(root,"session token authentication",{limit:5,fallback:true});assert.equal(result.mode,"offline-hash-fallback");assert.equal(result.hits[0].path,"auth.js");
  }finally{if(old===undefined)delete process.env.OLLAMA_URL;else process.env.OLLAMA_URL=old;await rm(root,{recursive:true,force:true});}
});
