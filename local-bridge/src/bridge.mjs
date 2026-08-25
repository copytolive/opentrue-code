import {spawn} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {approvedRoot,commandFor} from "./policy.mjs";

const URL=(process.env.CONTROL_PLANE_URL||"").replace(/\/$/,"");
const TOKEN=process.env.CONTROL_PLANE_TOKEN||"";
const ROOTS=(process.env.APPROVED_WORKSPACE_ROOTS||"").split(":").filter(Boolean);
const WORKER=process.env.BRIDGE_ID||randomUUID();
const LEASE_MS=Math.max(30000,Number(process.env.WORKER_LEASE_MS||90000));
if(!URL.startsWith("https://")&&!URL.startsWith("http://localhost")){
  console.error("CONTROL_PLANE_URL must use HTTPS or localhost");process.exit(1);
}
if(TOKEN.length<24||!ROOTS.length){
  console.error("Token and APPROVED_WORKSPACE_ROOTS are required");process.exit(1);
}
const headers={authorization:`Bearer ${TOKEN}`,"content-type":"application/json"};
const post=async(path,data)=>{
  const r=await fetch(`${URL}${path}`,{method:"POST",headers,body:JSON.stringify(data)});
  if(!r.ok&&r.status!==204)throw Error(`${path} returned ${r.status}: ${await r.text()}`);
  return r;
};

async function execute(job){
  const cwd=await approvedRoot(job.args[0]||ROOTS[0],ROOTS);
  const [cmd,args]=commandFor(job.task,job.args.slice(1));
  const started=Date.now(),output=[];let timedOut=false;
  const heartbeat=setInterval(()=>post(`/v1/workers/jobs/${job.id}/heartbeat`,{workerId:WORKER,leaseMs:LEASE_MS}).catch(e=>console.error("heartbeat",String(e))),Math.max(10000,Math.floor(LEASE_MS/3)));
  heartbeat.unref();
  const result=await new Promise(resolve=>{
    const child=spawn(cmd,args,{cwd,env:{PATH:process.env.PATH||"/usr/local/bin:/usr/bin:/bin",CI:"true"},stdio:["ignore","pipe","pipe"]});
    const add=(stream,data)=>output.push({stream,at:new Date().toISOString(),text:String(data).slice(0,16000)});
    child.stdout.on("data",d=>add("stdout",d));child.stderr.on("data",d=>add("stderr",d));
    const timer=setTimeout(()=>{timedOut=true;child.kill("SIGTERM");setTimeout(()=>child.kill("SIGKILL"),3000).unref()},job.timeoutMs);
    child.on("error",e=>resolve({code:-1,error:String(e)}));
    child.on("close",code=>{clearTimeout(timer);resolve({code:code??-1})});
  });
  clearInterval(heartbeat);
  const receipt={
    exitCode:result.code,timedOut,error:result.error||null,durationMs:Date.now()-started,output,
    outputHash:createHash("sha256").update(JSON.stringify(output)).digest("hex")
  };
  await post(`/v1/workers/jobs/${job.id}/complete`,receipt);
}

console.log(`OpenTrue Local Bridge ${WORKER} ready with ${ROOTS.length} approved root(s)`);
for(;;){
  try{
    const r=await post("/v1/workers/claim",{target:"local-bridge",workerId:WORKER,leaseMs:LEASE_MS});
    if(r.status===200)await execute(await r.json());
    else await new Promise(x=>setTimeout(x,1500));
  }catch(e){
    console.error(new Date().toISOString(),String(e));
    await new Promise(x=>setTimeout(x,5000));
  }
}
