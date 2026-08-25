import {createHash,randomUUID} from "node:crypto";

const URL=(process.env.CONTROL_PLANE_URL||"").replace(/\/$/,"");
const TOKEN=process.env.CONTROL_PLANE_TOKEN||"";
const OLLAMA=(process.env.OLLAMA_URL||"http://127.0.0.1:11434").replace(/\/$/,"");
const MODELS=(process.env.OLLAMA_MODELS||process.env.OLLAMA_MODEL||"qwen3-coder:30b").split(",").map(x=>x.trim()).filter(Boolean);
const ID=process.env.WORKER_ID||`vast-${randomUUID()}`;
const LEASE_MS=Math.max(30000,Number(process.env.WORKER_LEASE_MS||90000));
const MODEL_ATTEMPT_TIMEOUT_MS=Math.max(5000,Number(process.env.MODEL_ATTEMPT_TIMEOUT_MS||60000));
if((!URL.startsWith("https://")&&!URL.startsWith("http://localhost"))||TOKEN.length<24||!MODELS.length){
  console.error("CONTROL_PLANE_URL must be HTTPS/localhost, a strong token and at least one Ollama model are required");process.exit(1);
}
const headers={authorization:`Bearer ${TOKEN}`,"content-type":"application/json"};
const post=async(path,data)=>{
  const r=await fetch(`${URL}${path}`,{method:"POST",headers,body:JSON.stringify(data)});
  if(!r.ok&&r.status!==204)throw Error(`${path} returned ${r.status}: ${await r.text()}`);
  return r;
};
const tps=(count,durationNs)=>durationNs?Number(count||0)/(Number(durationNs)/1_000_000_000):0;

async function complete(job,receipt){await post(`/v1/workers/jobs/${job.id}/complete`,receipt)}
async function infer(model,prompt,timeoutMs){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(`${OLLAMA}/api/generate`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({model,prompt,stream:false,options:{temperature:0}}),signal:controller.signal
    });
    if(!r.ok)throw Error(`Ollama ${r.status}: ${await r.text()}`);
    return await r.json();
  }finally{clearTimeout(timeout)}
}

async function run(job){
  const started=Date.now(),deadline=Date.now()+Math.max(1000,job.timeoutMs);
  const heartbeat=setInterval(()=>post(`/v1/workers/jobs/${job.id}/heartbeat`,{workerId:ID,leaseMs:LEASE_MS}).catch(e=>console.error("heartbeat",String(e))),Math.max(10000,Math.floor(LEASE_MS/3)));
  heartbeat.unref();
  try{
    if(job.task!=="infer")throw Error("Vast worker only accepts infer");
    const prompt=job.args.join("\n").slice(0,200000);
    const attemptedModels=[];let data=null,modelUsed=null,lastError=null;
    for(const model of MODELS){
      const remaining=deadline-Date.now();
      if(remaining<1000)break;
      attemptedModels.push(model);
      try{
        data=await infer(model,prompt,Math.min(remaining,MODEL_ATTEMPT_TIMEOUT_MS));
        modelUsed=model;break;
      }catch(e){
        lastError=e;
        console.error(`model ${model} failed`,e?.name==="AbortError"?"timeout":String(e));
      }
    }
    if(!data||!modelUsed)throw lastError||Error("all configured Ollama models failed");
    const text=String(data.response||"");
    await complete(job,{
      exitCode:0,durationMs:Date.now()-started,
      outputHash:createHash("sha256").update(text).digest("hex"),
      output:[{stream:"stdout",at:new Date().toISOString(),text:text.slice(0,100000)}],
      metadata:{
        model:modelUsed,attemptedModels,
        promptTokens:Number(data.prompt_eval_count||0),outputTokens:Number(data.eval_count||0),
        outputTokensPerSecond:Number(tps(data.eval_count,data.eval_duration).toFixed(2)),
        totalDurationNs:Number(data.total_duration||0),loadDurationNs:Number(data.load_duration||0)
      }
    });
  }catch(e){
    const timedOut=e?.name==="AbortError"||Date.now()>=deadline;
    await complete(job,{
      exitCode:1,timedOut,durationMs:Date.now()-started,error:String(e),
      outputHash:createHash("sha256").update(String(e)).digest("hex"),output:[],
      metadata:{attemptedModels:MODELS}
    });
  }finally{clearInterval(heartbeat)}
}

console.log(`Vast worker ${ID} · models=${MODELS.join(",")}`);
for(;;){
  try{
    const r=await post("/v1/workers/claim",{target:"vast",workerId:ID,leaseMs:LEASE_MS});
    if(r.status===200)await run(await r.json());
    else await new Promise(x=>setTimeout(x,1500));
  }catch(e){
    console.error(String(e));
    await new Promise(x=>setTimeout(x,5000));
  }
}
