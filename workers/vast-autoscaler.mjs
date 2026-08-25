import {randomUUID} from "node:crypto";

const API=(process.env.VAST_API_BASE||"https://console.vast.ai").replace(/\/$/,"");
const VAST_KEY=process.env.VAST_API_KEY||"";
const TEMPLATE=process.env.VAST_TEMPLATE_HASH_ID||"";
const METRICS_URL=process.env.METRICS_URL||"";
const METRICS_TOKEN=process.env.METRICS_TOKEN||"";
const CONTROL_PLANE_URL=(process.env.CONTROL_PLANE_URL||"").replace(/\/$/,"");
const WORKER_TOKEN=process.env.VAST_WORKER_TOKEN||"";
const LABEL_PREFIX=process.env.VAST_LABEL_PREFIX||"opentrue-gpu-";
const MIN=Math.max(0,Number(process.env.VAST_MIN_INSTANCES||0));
const MAX=Math.max(MIN,Math.min(64,Number(process.env.VAST_MAX_INSTANCES||4)));
const JOBS_PER=Math.max(1,Number(process.env.VAST_JOBS_PER_INSTANCE||2));
const MAX_DPH=Math.max(0.01,Number(process.env.VAST_MAX_DPH||0.5));
const DISK=Math.max(16,Number(process.env.VAST_DISK_GB||48));
const RELIABILITY=Math.min(1,Math.max(0.8,Number(process.env.VAST_MIN_RELIABILITY||0.99)));
const GPU_RAM=Math.max(8000,Number(process.env.VAST_MIN_GPU_RAM_MB||24000));
const GPU_NAMES=String(process.env.VAST_GPU_NAMES||"RTX 4090,RTX 3090").split(",").map(x=>x.trim()).filter(Boolean);
const POLL_MS=Math.max(15000,Number(process.env.VAST_AUTOSCALE_POLL_MS||30000));
const IDLE_MS=Math.max(60000,Number(process.env.VAST_SCALE_DOWN_IDLE_MS||600000));
const ALLOW_DESTROY=process.env.VAST_ALLOW_DESTROY==="true";

if(VAST_KEY.length<24||!TEMPLATE||!METRICS_URL||METRICS_TOKEN.length<24||!CONTROL_PLANE_URL||WORKER_TOKEN.length<24){
  console.error("VAST_API_KEY, VAST_TEMPLATE_HASH_ID, METRICS_URL/TOKEN, CONTROL_PLANE_URL and VAST_WORKER_TOKEN are required");process.exit(1);
}
if(!METRICS_URL.startsWith("https://")&&!METRICS_URL.startsWith("http://localhost")){console.error("METRICS_URL must use HTTPS or localhost");process.exit(1)}
if(!CONTROL_PLANE_URL.startsWith("https://")&&!CONTROL_PLANE_URL.startsWith("http://localhost")){console.error("CONTROL_PLANE_URL must use HTTPS or localhost");process.exit(1)}

const headers={authorization:`Bearer ${VAST_KEY}`,"content-type":"application/json"};
async function vast(path,init={}){
  const r=await fetch(`${API}${path}`,{...init,headers:{...headers,...(init.headers||{})}});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text.slice(0,1000)}}
  if(!r.ok)throw Error(`Vast ${init.method||"GET"} ${path}: ${r.status} ${JSON.stringify(data).slice(0,1000)}`);return data;
}
async function metrics(){
  const r=await fetch(METRICS_URL,{headers:{authorization:`Bearer ${METRICS_TOKEN}`}});if(!r.ok)throw Error(`metrics ${r.status}`);const body=await r.text();
  const get=name=>{const m=body.match(new RegExp(`^${name}\\s+([0-9.eE+-]+)$`,`m`));return m?Number(m[1]):0};
  return {queued:get("opentrue_queue_ready_jobs"),processing:get("opentrue_queue_processing_jobs"),leases:get("opentrue_worker_leases")};
}
async function instances(){
  const q=new URLSearchParams({limit:"25",select_cols:JSON.stringify(["id","label","actual_status","dph_total","gpu_name","start_date"])});
  const data=await vast(`/api/v1/instances/?${q}`);return (data.instances||[]).filter(x=>String(x.label||"").startsWith(LABEL_PREFIX));
}
async function offers(){
  const payload={gpu_name:{in:GPU_NAMES},num_gpus:{gte:1},gpu_ram:{gte:GPU_RAM},reliability:{gte:RELIABILITY},verified:{eq:true},rentable:{eq:true},type:"ondemand",limit:20};
  const data=await vast("/api/v0/bundles/",{method:"POST",body:JSON.stringify(payload)});
  return (data.offers||[]).filter(x=>Number(x.dph_total)<=MAX_DPH).sort((a,b)=>Number(a.dph_total)-Number(b.dph_total));
}
async function scaleUp(){
  const list=await offers();if(!list.length)throw Error(`no Vast offer satisfies GPU=${GPU_NAMES.join("|")} RAM>=${GPU_RAM} reliability>=${RELIABILITY} price<=${MAX_DPH}/h`);
  const offer=list[0],label=`${LABEL_PREFIX}${Date.now()}-${randomUUID().slice(0,6)}`;
  const data=await vast(`/api/v0/asks/${offer.id}/`,{method:"PUT",body:JSON.stringify({template_hash_id:TEMPLATE,label,disk:DISK,target_state:"running",env:{CONTROL_PLANE_URL,CONTROL_PLANE_TOKEN:WORKER_TOKEN,WORKER_LEASE_MS:String(process.env.WORKER_LEASE_MS||180000),OLLAMA_MODELS:process.env.OLLAMA_MODELS||"qwen3-coder:30b,qwen2.5-coder:14b"}})});
  console.log(JSON.stringify({event:"scale_up",instanceId:data.new_contract,label,gpu:offer.gpu_name,dph:Number(offer.dph_total),at:new Date().toISOString()}));
}
async function destroy(instance){
  if(!ALLOW_DESTROY)return false;
  await vast(`/api/v0/instances/${instance.id}/`,{method:"DELETE"});
  console.log(JSON.stringify({event:"scale_down",instanceId:instance.id,label:instance.label,at:new Date().toISOString()}));return true;
}

let idleSince=null;
console.log(JSON.stringify({event:"autoscaler_start",min:MIN,max:MAX,jobsPerInstance:JOBS_PER,maxDph:MAX_DPH,allowDestroy:ALLOW_DESTROY,labelPrefix:LABEL_PREFIX}));
for(;;){
  try{
    const [load,managed]=await Promise.all([metrics(),instances()]);
    const demand=Math.max(0,Math.ceil((load.queued+load.processing)/JOBS_PER));
    const desired=Math.min(MAX,Math.max(MIN,demand));
    const active=managed.filter(x=>!["exited","offline"].includes(String(x.actual_status))).length;
    console.log(JSON.stringify({event:"fleet_tick",queued:load.queued,processing:load.processing,leases:load.leases,managed:managed.length,active,desired,at:new Date().toISOString()}));
    if(active<desired){idleSince=null;await scaleUp();}
    else if(active>desired&&load.queued===0&&load.processing===0){
      idleSince??=Date.now();
      if(ALLOW_DESTROY&&Date.now()-idleSince>=IDLE_MS){
        const candidates=managed.filter(x=>String(x.actual_status)!=="loading").sort((a,b)=>Number(b.dph_total||0)-Number(a.dph_total||0));
        if(candidates[0]){await destroy(candidates[0]);idleSince=Date.now();}
      }
    }else idleSince=null;
  }catch(e){console.error(JSON.stringify({event:"autoscaler_error",error:String(e),at:new Date().toISOString()}));}
  await new Promise(r=>setTimeout(r,POLL_MS));
}
