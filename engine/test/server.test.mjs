import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {startEngine} from '../src/server.mjs';

const TOKEN=['engine','test','token','abcdefghijklmnopqrstuvwxyz'].join('-');
async function run(cmd,args,cwd){
  return await new Promise((resolve,reject)=>{
    const p=spawn(cmd,args,{cwd,stdio:['ignore','pipe','pipe']});let out='',err='';
    p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
    p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(Error(err||`${cmd} ${args.join(' ')} failed`)));
  });
}
async function request(engine,path,{method='GET',body,auth=true}={}){
  const r=await fetch(`http://127.0.0.1:${engine.port}${path}`,{
    method,
    headers:{...(auth?{authorization:`Bearer ${TOKEN}`} : {}),...(body?{'content-type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined
  });
  const data=await r.json();return {r,data};
}

test('engine is loopback-authenticated and edits only approved git roots',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'opentrue-engine-'));
  await run('git',['init','-q'],dir);
  await run('git',['config','user.email','test@example.invalid'],dir);
  await run('git',['config','user.name','OpenTrue Test'],dir);
  await writeFile(join(dir,'README.md'),'hello\n');
  await run('git',['add','README.md'],dir);await run('git',['commit','-qm','init'],dir);
  const engine=await startEngine({token:TOKEN,port:0});
  try{
    let x=await request(engine,'/health',{auth:false});assert.equal(x.r.status,200);assert.equal(x.data.service,'opentrue-engine');
    x=await request(engine,'/v1/capabilities',{auth:false});assert.equal(x.r.status,401);
    x=await request(engine,'/v1/workspaces/approve',{method:'POST',body:{path:dir}});assert.equal(x.r.status,200);
    x=await request(engine,`/v1/file?workspace=${encodeURIComponent(dir)}&path=README.md`);assert.equal(x.data.content,'hello\n');
    x=await request(engine,'/v1/file',{method:'PUT',body:{workspace:dir,path:'README.md',content:'blocked\n'}});assert.equal(x.r.status,403);
    x=await request(engine,'/v1/file',{method:'PUT',body:{workspace:dir,path:'README.md',content:'approved\n',approved:true}});assert.equal(x.r.status,200);
    assert.equal(await readFile(join(dir,'README.md'),'utf8'),'approved\n');
  }finally{await engine.close();await rm(dir,{recursive:true,force:true});}
});
