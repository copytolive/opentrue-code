import {spawn} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {realpath} from "node:fs/promises";
import {resolve,sep} from "node:path";

const URL=(process.env.CONTROL_PLANE_URL||"").replace(/\/$/,"");
const TOKEN=process.env.CONTROL_PLANE_TOKEN||"";
const ROOT=process.env.SANDBOX_WORKSPACE_ROOT||"";
const ID=process.env.WORKER_ID||`sandbox-${randomUUID()}`;
const LEASE_MS=Math.max(30000,Number(process.env.WORKER_LEASE_MS||90000));
const PAYLOAD_UID=Math.max(1,Math.min(65534,Number(process.env.SANDBOX_PAYLOAD_UID||1000)));
const PAYLOAD_GID=Math.max(1,Math.min(65534,Number(process.env.SANDBOX_PAYLOAD_GID||1000)));
if((!URL.startsWith("https://")&&!URL.startsWith("http://control-plane")&&!URL.startsWith("http://localhost"))||TOKEN.length<24||!ROOT){
  console.error("CONTROL_PLANE_URL, strong token and SANDBOX_WORKSPACE_ROOT are required");process.exit(1);
}
if(process.getuid?.()!==0){console.error("sandbox launcher must run as root; untrusted payload is dropped to SANDBOX_PAYLOAD_UID/GID inside bubblewrap");process.exit(1)}
if(!existsSync("/usr/bin/bwrap")){console.error("bubblewrap (/usr/bin/bwrap) is required; refusing unsafe fallback");process.exit(1)}

const TASKS={
  test:["npm",["test"]],
  build:["npm",["run","build"]],
  lint:["npm",["run","lint"]],
  git_status:["git",["status","--short"]],
  python_version:["python3",["--version"]]
};
const headers={authorization:`Bearer ${TOKEN}`,"content-type":"application/json"};
const post=async(path,data)=>{
  const r=await fetch(`${URL}${path}`,{method:"POST",headers,body:JSON.stringify(data)});
  if(!r.ok&&r.status!==204)throw Error(`${path} returned ${r.status}: ${await r.text()}`);
  return r;
};

async function workspace(requested){
  const base=await realpath(resolve(ROOT));
  const path=await realpath(resolve(base,requested||"."));
  if(path!==base&&!path.startsWith(base+sep))throw Error("workspace is outside sandbox root");
  return path;
}
function commandFor(task,args){
  const spec=TASKS[task];
  if(!spec)throw Error("sandbox task is not allowlisted");
  if(args.some(x=>String(x).includes("\0")))throw Error("invalid argument");
  return [spec[0],[...spec[1],...args.map(String)]];
}
function baseBwrapArgs(){
  const out=["--unshare-all","--die-with-parent","--new-session","--proc","/proc","--dev","/dev","--tmpfs","/tmp"];
  for(const p of ["/usr","/usr/local","/bin","/lib","/lib64"]){if(existsSync(p))out.push("--ro-bind",p,p)}
  if(existsSync("/etc/ssl/certs"))out.push("--ro-bind","/etc/ssl/certs","/etc/ssl/certs");
  return out;
}
function bwrapArgs(cwd,cmd,args){
  return [...baseBwrapArgs(),"--dir","/workspace","--bind",cwd,"/workspace","--chdir","/workspace",
    "--uid",String(PAYLOAD_UID),"--gid",String(PAYLOAD_GID),"--cap-drop","ALL",
    "--setenv","PATH","/usr/local/bin:/usr/bin:/bin","--setenv","HOME","/tmp","--setenv","CI","true","--",cmd,...args];
}
async function preflight(){
  const args=[...baseBwrapArgs(),"--uid",String(PAYLOAD_UID),"--gid",String(PAYLOAD_GID),"--cap-drop","ALL","--","/usr/bin/true"];
  const code=await new Promise(resolveCode=>{
    const child=spawn("/usr/bin/bwrap",args,{env:{PATH:"/usr/local/bin:/usr/bin:/bin"},stdio:["ignore","ignore","pipe"]});
    let error="";child.stderr.on("data",d=>error+=String(d));
    child.on("error",e=>{console.error(String(e));resolveCode(-1)});
    child.on("close",c=>{if(c)console.error(`bubblewrap preflight: ${error.trim()}`);resolveCode(c??-1)});
  });
  if(code!==0)throw Error("bubblewrap preflight failed; refusing to claim untrusted jobs");
}

async function run(job){
  const started=Date.now(),output=[];let timedOut=false;
  const cwd=await workspace(job.args[0]||".");
  const [cmd,args]=commandFor(job.task,job.args.slice(1));
  const heartbeat=setInterval(()=>post(`/v1/workers/jobs/${job.id}/heartbeat`,{workerId:ID,leaseMs:LEASE_MS}).catch(e=>console.error("heartbeat",String(e))),Math.max(10000,Math.floor(LEASE_MS/3)));
  heartbeat.unref();
  const result=await new Promise(resolveResult=>{
    const child=spawn("/usr/bin/bwrap",bwrapArgs(cwd,cmd,args),{env:{PATH:"/usr/local/bin:/usr/bin:/bin"},stdio:["ignore","pipe","pipe"]});
    const add=(stream,data)=>output.push({stream,at:new Date().toISOString(),text:String(data).slice(0,16000)});
    child.stdout.on("data",d=>add("stdout",d));child.stderr.on("data",d=>add("stderr",d));
    const timer=setTimeout(()=>{timedOut=true;child.kill("SIGTERM");setTimeout(()=>child.kill("SIGKILL"),3000).unref()},job.timeoutMs);
    child.on("error",e=>resolveResult({code:-1,error:String(e)}));
    child.on("close",code=>{clearTimeout(timer);resolveResult({code:code??-1})});
  });
  clearInterval(heartbeat);
  await post(`/v1/workers/jobs/${job.id}/complete`,{
    exitCode:result.code,timedOut,error:result.error||null,durationMs:Date.now()-started,
    outputHash:createHash("sha256").update(JSON.stringify(output)).digest("hex"),output
  });
}

await preflight();
console.log(`OpenTrue sandbox worker ${ID} ready · payload ${PAYLOAD_UID}:${PAYLOAD_GID}`);
for(;;){
  try{
    const r=await post("/v1/workers/claim",{target:"sandbox",workerId:ID,leaseMs:LEASE_MS});
    if(r.status===200)await run(await r.json());
    else await new Promise(x=>setTimeout(x,1500));
  }catch(e){
    console.error(new Date().toISOString(),String(e));
    await new Promise(x=>setTimeout(x,5000));
  }
}
