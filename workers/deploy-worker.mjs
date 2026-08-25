import {spawn} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {realpath} from "node:fs/promises";

const URL=(process.env.CONTROL_PLANE_URL||"").replace(/\/$/,"");
const TOKEN=process.env.CONTROL_PLANE_TOKEN||"";
const TARGET=process.env.DEPLOY_TARGET||"";
const HEALTH_URL=process.env.HEALTH_URL||"";
const ROOT=await realpath(process.env.DEPLOY_ROOT||".");
const ID=process.env.WORKER_ID||`${TARGET}-${randomUUID()}`;
const LEASE_MS=Math.max(30000,Number(process.env.WORKER_LEASE_MS||180000));
const HEALTH_ATTEMPTS=Math.max(1,Math.min(60,Number(process.env.HEALTH_ATTEMPTS||12)));
const HEALTH_INTERVAL_MS=Math.max(1000,Math.min(30000,Number(process.env.HEALTH_INTERVAL_MS||5000)));
const allowedTargets=new Set(["deploy-staging","deploy-production"]);

if(!allowedTargets.has(TARGET))throw Error("DEPLOY_TARGET must be deploy-staging or deploy-production");
if((!URL.startsWith("https://")&&!URL.startsWith("http://localhost"))||TOKEN.length<24)throw Error("HTTPS/localhost control-plane URL and strong worker token are required");
if(!HEALTH_URL.startsWith("https://")&&!HEALTH_URL.startsWith("http://127.0.0.1")&&!HEALTH_URL.startsWith("http://localhost"))throw Error("HEALTH_URL must be HTTPS or loopback HTTP");

const headers={authorization:`Bearer ${TOKEN}`,"content-type":"application/json"};
const post=async(path,data)=>{
  const r=await fetch(`${URL}${path}`,{method:"POST",headers,body:JSON.stringify(data)});
  if(!r.ok&&r.status!==204)throw Error(`${path} returned ${r.status}: ${await r.text()}`);
  return r;
};
const run=async(cmd,args,{timeoutMs=120000}={})=>new Promise(resolve=>{
  const output=[];let timedOut=false;
  const child=spawn(cmd,args,{cwd:ROOT,env:{PATH:process.env.PATH||"/usr/local/bin:/usr/bin:/bin",HOME:process.env.HOME||"/tmp",CI:"true"},stdio:["ignore","pipe","pipe"]});
  const add=(stream,data)=>output.push({stream,at:new Date().toISOString(),text:String(data).slice(0,16000)});
  child.stdout.on("data",d=>add("stdout",d));child.stderr.on("data",d=>add("stderr",d));
  const timer=setTimeout(()=>{timedOut=true;child.kill("SIGTERM");setTimeout(()=>child.kill("SIGKILL"),3000).unref()},timeoutMs);
  child.on("error",error=>{clearTimeout(timer);resolve({code:-1,timedOut,error:String(error),output})});
  child.on("close",code=>{clearTimeout(timer);resolve({code:code??-1,timedOut,output})});
});
const checked=async(cmd,args,options)=>{
  const result=await run(cmd,args,options);
  if(result.code!==0||result.timedOut){
    const error=new Error(`${cmd} ${args.join(" ")} failed`);error.result=result;throw error;
  }
  return result;
};
const outputText=result=>result.output.map(x=>x.text).join("").trim();
const health=async()=>{
  for(let attempt=1;attempt<=HEALTH_ATTEMPTS;attempt++){
    try{const r=await fetch(HEALTH_URL,{signal:AbortSignal.timeout(10000)});if(r.ok)return {ok:true,status:r.status,attempt}}
    catch{}
    if(attempt<HEALTH_ATTEMPTS)await new Promise(r=>setTimeout(r,HEALTH_INTERVAL_MS));
  }
  return {ok:false,status:0,attempt:HEALTH_ATTEMPTS};
};

async function execute(job){
  const started=Date.now(),logs=[];
  const heartbeat=setInterval(()=>post(`/v1/workers/jobs/${job.id}/heartbeat`,{workerId:ID,leaseMs:LEASE_MS}).catch(e=>console.error("heartbeat",String(e))),Math.max(10000,Math.floor(LEASE_MS/3)));
  heartbeat.unref();
  let previous="",revision="",rolledBack=false;
  try{
    if(job.task!=="deploy")throw Error("deployment worker accepts only deploy task");
    if(job.args.length!==1||!/^[0-9a-f]{40}$/i.test(job.args[0]))throw Error("deploy requires one full 40-character commit SHA");
    revision=job.args[0].toLowerCase();
    const head=await checked("git",["rev-parse","HEAD"]);logs.push(...head.output);previous=outputText(head).split(/\s+/).pop();
    const fetchResult=await checked("git",["fetch","--prune","origin"],{timeoutMs:120000});logs.push(...fetchResult.output);
    const verify=await checked("git",["cat-file","-e",`${revision}^{commit}`]);logs.push(...verify.output);
    const checkout=await checked("git",["checkout","--detach",revision]);logs.push(...checkout.output);
    const pull=await checked("docker",["compose","pull"],{timeoutMs:Math.min(job.timeoutMs,300000)});logs.push(...pull.output);
    const up=await checked("docker",["compose","up","-d","--build"],{timeoutMs:Math.min(job.timeoutMs,600000)});logs.push(...up.output);
    const probe=await health();
    if(!probe.ok){
      rolledBack=true;
      const back=await checked("git",["checkout","--detach",previous]);logs.push(...back.output);
      const rollback=await checked("docker",["compose","up","-d","--build"],{timeoutMs:Math.min(job.timeoutMs,600000)});logs.push(...rollback.output);
      const rollbackHealth=await health();
      if(!rollbackHealth.ok)throw Error(`deployment health failed and rollback health also failed: ${previous}`);
      throw Error(`deployment health failed; rolled back to ${previous}`);
    }
    const outputHash=createHash("sha256").update(JSON.stringify(logs)).digest("hex");
    await post(`/v1/workers/jobs/${job.id}/complete`,{
      exitCode:0,timedOut:false,durationMs:Date.now()-started,outputHash,output:logs.slice(-200),
      metadata:{environment:TARGET.replace(/^deploy-/,""),revision,previous,health:HEALTH_URL,rolledBack:false}
    });
  }catch(error){
    const result=error.result||{};if(Array.isArray(result.output))logs.push(...result.output);
    const outputHash=createHash("sha256").update(JSON.stringify(logs)+String(error)).digest("hex");
    await post(`/v1/workers/jobs/${job.id}/complete`,{
      exitCode:1,timedOut:Boolean(result.timedOut),durationMs:Date.now()-started,error:String(error),outputHash,output:logs.slice(-200),
      metadata:{environment:TARGET.replace(/^deploy-/,""),revision,previous,health:HEALTH_URL,rolledBack}
    });
  }finally{clearInterval(heartbeat)}
}

console.log(`OpenTrue deployment worker ${ID} target=${TARGET} root=${ROOT}`);
for(;;){
  try{
    const r=await post("/v1/workers/claim",{target:TARGET,workerId:ID,leaseMs:LEASE_MS});
    if(r.status===200)await execute(await r.json());
    else await new Promise(r=>setTimeout(r,1500));
  }catch(error){console.error(new Date().toISOString(),String(error));await new Promise(r=>setTimeout(r,5000))}
}
