import http from "node:http";
import {createHash,createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import {WebSocketServer} from "ws";
import {bearer,can,verifyClaims} from "./auth.mjs";
import {PLANS} from "./fair-use.mjs";
import {PostgresStore} from "./postgres.mjs";
import {RedisQueue} from "./redis-queue.mjs";

const PORT=Number(process.env.PORT||8787);
const AUTH=process.env.AUTH_SIGNING_SECRET||"";
const DATABASE_URL=process.env.DATABASE_URL||"";
const REDIS_URL=process.env.REDIS_URL||"";
const BILLING_SECRET=process.env.BILLING_WEBHOOK_SECRET||"";
const METRICS_TOKEN=process.env.METRICS_TOKEN||"";
const RATE_USER=Math.max(60,Number(process.env.RATE_LIMIT_USER_PER_MINUTE||240));
const RATE_WORKER=Math.max(120,Number(process.env.RATE_LIMIT_WORKER_PER_MINUTE||1200));
const RATE_BILLING=Math.max(30,Number(process.env.RATE_LIMIT_BILLING_PER_MINUTE||120));
if(AUTH.length<32||!DATABASE_URL||!REDIS_URL){
  console.error("AUTH_SIGNING_SECRET, DATABASE_URL and REDIS_URL are required");
  process.exit(1);
}
const db=new PostgresStore(DATABASE_URL);
const queue=await new RedisQueue(REDIS_URL).connect();
const clients=new Map();
const metrics={requests:0,errors:0,rateLimited:0,jobsCreated:0,jobsTerminal:0,webhooks:0};
await db.ping();

const now=()=>new Date().toISOString();
const send=(ws,event)=>ws.readyState===1&&ws.send(JSON.stringify(event));
const broadcast=(tenant,event)=>clients.get(tenant)?.forEach(ws=>send(ws,event));
await queue.subscribeEvents((tenant,event)=>broadcast(tenant,event));
const publish=async(tenant,event)=>{
  try{await queue.publishEvent(tenant,event)}
  catch(e){console.error("event-publish",e.message);broadcast(tenant,event)}
};
const safeEqual=(a,b)=>{
  const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));
  return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);
};
const readBody=async req=>{
  const chunks=[];let size=0;
  for await(const c of req){
    size+=c.length;
    if(size>1_000_000)throw Object.assign(Error("body too large"),{status:413});
    chunks.push(c);
  }
  return Buffer.concat(chunks);
};
const parseJson=raw=>JSON.parse(raw.toString()||"{}");
const json=(res,status,data,headers={})=>{
  res.writeHead(status,{
    "content-type":"application/json",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "content-security-policy":"default-src 'none'",
    "referrer-policy":"no-referrer",
    ...headers
  });
  res.end(status===204?undefined:JSON.stringify(data));
};
const text=(res,status,data)=>{
  res.writeHead(status,{"content-type":"text/plain; version=0.0.4; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});
  res.end(data);
};
const auth=req=>verifyClaims(bearer(req),AUTH);
const permit=(c,a)=>{if(!can(c,a))throw Object.assign(Error("forbidden"),{status:403})};
const targets=["control-plane","local-bridge","vast","sandbox","deploy-staging","deploy-production"];
const deploymentTargets=new Set(["deploy-staging","deploy-production"]);
const workerTarget=c=>targets.includes(c.workerTarget)?c.workerTarget:"control-plane";
const makeJob=(input,c,planName)=>{
  const plan=PLANS[planName]||PLANS.free;
  const target=targets.includes(input.target)?input.target:"control-plane";
  const requiresApproval=deploymentTargets.has(target)||input.requiresApproval!==false;
  return {
    id:randomUUID(),tenantId:c.tenantId,userId:c.userId,projectId:String(input.projectId||"default"),
    createdAt:now(),updatedAt:now(),status:requiresApproval?"WAITING_APPROVAL":"QUEUED",
    attempt:0,maxAttempts:Math.max(1,Math.min(input.maxAttempts||2,5)),
    timeoutMs:Math.max(1000,Math.min(input.timeoutMs||120000,plan.maxRuntimeMs)),
    target,
    task:String(input.task||""),args:Array.isArray(input.args)?input.args.map(String):[],
    receipt:null,error:null
  };
};
const receiptMetadata=input=>{
  const src=input&&typeof input.metadata==="object"&&input.metadata&&!Array.isArray(input.metadata)?input.metadata:{};
  const out={};
  const strings=["model","environment","revision","previous","health"];
  const numbers=["promptTokens","outputTokens","outputTokensPerSecond","totalDurationNs","loadDurationNs"];
  for(const key of strings)if(src[key]!=null)out[key]=String(src[key]).slice(0,500);
  for(const key of numbers)if(Number.isFinite(Number(src[key])))out[key]=Number(src[key]);
  if(Array.isArray(src.attemptedModels))out.attemptedModels=src.attemptedModels.slice(0,10).map(x=>String(x).slice(0,200));
  if(src.rolledBack!=null)out.rolledBack=Boolean(src.rolledBack);
  return out;
};
const verifyWebhook=(raw,signature)=>{
  if(BILLING_SECRET.length<32)return false;
  const expected=createHmac("sha256",BILLING_SECRET).update(raw).digest();
  let actual;
  try{actual=Buffer.from(String(signature||"").replace(/^sha256=/,""),"hex")}catch{return false}
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
};
const metricsBody=queueStats=>{
  const mem=process.memoryUsage();
  const sockets=[...clients.values()].reduce((n,set)=>n+set.size,0);
  return [
    "# HELP opentrue_requests_total HTTP requests received by this process",
    "# TYPE opentrue_requests_total counter",
    `opentrue_requests_total ${metrics.requests}`,
    "# HELP opentrue_errors_total Request handler errors",
    "# TYPE opentrue_errors_total counter",
    `opentrue_errors_total ${metrics.errors}`,
    "# HELP opentrue_rate_limited_total Requests rejected by Redis rate limiting",
    "# TYPE opentrue_rate_limited_total counter",
    `opentrue_rate_limited_total ${metrics.rateLimited}`,
    "# HELP opentrue_jobs_created_total Jobs accepted by the control-plane",
    "# TYPE opentrue_jobs_created_total counter",
    `opentrue_jobs_created_total ${metrics.jobsCreated}`,
    "# HELP opentrue_jobs_terminal_total Jobs that reached a terminal state",
    "# TYPE opentrue_jobs_terminal_total counter",
    `opentrue_jobs_terminal_total ${metrics.jobsTerminal}`,
    "# HELP opentrue_billing_webhooks_total Valid billing webhook deliveries",
    "# TYPE opentrue_billing_webhooks_total counter",
    `opentrue_billing_webhooks_total ${metrics.webhooks}`,
    "# HELP opentrue_websocket_connections Current websocket connections",
    "# TYPE opentrue_websocket_connections gauge",
    `opentrue_websocket_connections ${sockets}`,
    "# HELP opentrue_queue_ready_jobs Aggregate queued jobs across tenants/targets without tenant labels",
    "# TYPE opentrue_queue_ready_jobs gauge",
    `opentrue_queue_ready_jobs ${queueStats.queued}`,
    "# HELP opentrue_queue_processing_jobs Aggregate processing jobs across tenants/targets",
    "# TYPE opentrue_queue_processing_jobs gauge",
    `opentrue_queue_processing_jobs ${queueStats.processing}`,
    "# HELP opentrue_worker_leases Aggregate active worker job leases",
    "# TYPE opentrue_worker_leases gauge",
    `opentrue_worker_leases ${queueStats.leases}`,
    "# HELP opentrue_process_resident_memory_bytes Resident memory size",
    "# TYPE opentrue_process_resident_memory_bytes gauge",
    `opentrue_process_resident_memory_bytes ${mem.rss}`,
    "# HELP opentrue_process_uptime_seconds Process uptime",
    "# TYPE opentrue_process_uptime_seconds gauge",
    `opentrue_process_uptime_seconds ${process.uptime()}`
  ].join("\n")+"\n";
};

const server=http.createServer(async(req,res)=>{
  metrics.requests++;
  try{
    const url=new URL(req.url,"http://local");
    if(url.pathname==="/health"){
      await Promise.all([db.ping(),queue.ping()]);
      return json(res,200,{status:"ok",time:now(),database:"ok",redis:"ok"});
    }

    if(req.method==="GET"&&url.pathname==="/metrics"){
      if(METRICS_TOKEN.length<24)return json(res,404,{error:"not found"});
      if(!safeEqual(bearer(req),METRICS_TOKEN))return json(res,401,{error:"unauthorized"});
      return text(res,200,metricsBody(await queue.aggregateStats()));
    }

    if(req.method==="POST"&&url.pathname==="/v1/billing/webhook"){
      const rate=await queue.takeRateLimit("billing",String(req.socket.remoteAddress||"unknown"),RATE_BILLING,60000);
      if(!rate.allowed){
        metrics.rateLimited++;
        return json(res,429,{error:"rate_limit"},{"retry-after":String(Math.max(1,Math.ceil(rate.retryAfterMs/1000)))});
      }
      if(BILLING_SECRET.length<32)return json(res,503,{error:"billing webhook not configured"});
      const raw=await readBody(req);
      if(!verifyWebhook(raw,req.headers["x-opentrue-signature"]))return json(res,401,{error:"invalid webhook signature"});
      const input=parseJson(raw);
      if(!input.eventId||!input.tenantId||!Object.hasOwn(PLANS,input.plan)||!["active","trial","past_due","cancelled","expired"].includes(input.status)){
        return json(res,400,{error:"invalid billing event"});
      }
      const provider=String(input.provider||"generic").slice(0,80);
      const result=await db.applyBillingWebhook({
        provider,eventId:String(input.eventId).slice(0,200),tenantId:String(input.tenantId),
        plan:input.plan,status:input.status,periodEnd:input.periodEnd||null,
        providerCustomerId:input.providerCustomerId?String(input.providerCustomerId).slice(0,200):null,
        payloadHash:createHash("sha256").update(raw).digest("hex")
      });
      metrics.webhooks++;
      return json(res,result.duplicate?200:202,{ok:true,duplicate:result.duplicate});
    }

    const claims=auth(req);
    const rateLimit=claims.role==="worker"?RATE_WORKER:RATE_USER;
    const rate=await queue.takeRateLimit("api",`${claims.tenantId}:${claims.userId}`,rateLimit,60000);
    if(!rate.allowed){
      metrics.rateLimited++;
      return json(res,429,{error:"rate_limit",remaining:rate.remaining},{"retry-after":String(Math.max(1,Math.ceil(rate.retryAfterMs/1000)))});
    }
    await db.ensureActor(claims);

    if(req.method==="GET"&&url.pathname==="/v1/me"){
      const effectivePlan=await db.effectivePlan(claims.tenantId,claims.plan||"free");
      const plan=PLANS[effectivePlan]||PLANS.free;
      return json(res,200,{
        tenantId:claims.tenantId,userId:claims.userId,role:claims.role,
        plan:effectivePlan,workerTarget:claims.workerTarget||null,
        product:{unlimitedChat:plan.unlimitedChat,noTokenBilling:true,concurrency:plan.concurrency,maxRuntimeMs:plan.maxRuntimeMs,priority:plan.priority}
      });
    }

    const w=url.pathname.match(/^\/v1\/workspace\/([^/]+)$/);
    if(w){
      const projectKey=decodeURIComponent(w[1]);
      if(projectKey.length<1||projectKey.length>200)return json(res,400,{error:"invalid project key"});
      if(req.method==="GET"){
        permit(claims,"job:read");
        return json(res,200,(await db.getWorkspaceState(claims.tenantId,claims.userId,projectKey))||{projectKey,state:{},version:0,updatedAt:null});
      }
      if(req.method==="PUT"){
        permit(claims,"job:create");
        const input=parseJson(await readBody(req));
        if(typeof input.state!=="object"||input.state===null||Array.isArray(input.state))return json(res,400,{error:"state must be an object"});
        const saved=await db.putWorkspaceState(claims.tenantId,claims.userId,projectKey,input.state,input.expectedVersion??null);
        if(!saved)return json(res,409,{error:"workspace version conflict"});
        await db.audit(claims.tenantId,claims.userId,"workspace.synced",{projectKey,version:saved.version});
        return json(res,200,saved);
      }
    }

    if(req.method==="GET"&&url.pathname==="/v1/billing/entitlement"){
      permit(claims,"job:read");
      return json(res,200,{entitlement:await db.getEntitlement(claims.tenantId),effectivePlan:await db.effectivePlan(claims.tenantId,claims.plan||"free")});
    }

    if(req.method==="POST"&&url.pathname==="/v1/jobs"){
      permit(claims,"job:create");
      const input=parseJson(await readBody(req));
      const planName=await db.effectivePlan(claims.tenantId,claims.plan||"free");
      const plan=PLANS[planName]||PLANS.free;
      const usage=await db.startUsage(claims.tenantId,claims.userId,{jobs:plan.dailyJobs,concurrent:plan.concurrency});
      if(!usage)return json(res,429,{error:"fair_use",reason:plan.dailyJobs===null?"concurrency_limit":"daily_or_concurrency_limit"});
      let job;
      try{
        job=await db.createJob(makeJob(input,claims,planName));
        await db.audit(claims.tenantId,claims.userId,"job.created",{jobId:job.id,target:job.target,status:job.status});
        if(job.status==="QUEUED")await queue.enqueue(job.target,job.tenantId,job.id,Math.max(plan.priority,Number(input.priority||0)));
      }catch(e){
        await db.finishUsage(claims.tenantId,claims.userId);
        throw e;
      }
      metrics.jobsCreated++;
      return json(res,202,job);
    }

    const m=url.pathname.match(/^\/v1\/jobs\/([^/]+)(?:\/(approve|cancel))?$/);
    if(m){
      let job=await db.getJob(claims.tenantId,m[1]);
      if(!job)return json(res,404,{error:"job not found"});
      if(req.method==="GET"&&!m[2]){
        permit(claims,"job:read");
        return json(res,200,job);
      }
      if(req.method==="POST"&&m[2]==="approve"&&job.status==="WAITING_APPROVAL"){
        permit(claims,"job:approve");
        job=await db.updateJob(claims.tenantId,job.id,"QUEUED");
        await queue.enqueue(job.target,job.tenantId,job.id);
        await db.audit(claims.tenantId,claims.userId,"job.approved",{jobId:job.id});
        return json(res,200,job);
      }
      if(req.method==="POST"&&m[2]==="cancel"&&["WAITING_APPROVAL","QUEUED"].includes(job.status)){
        permit(claims,"job:cancel");
        job=await db.updateJob(claims.tenantId,job.id,"CANCELLED");
        await db.finishUsage(job.tenantId,job.userId);
        await db.audit(claims.tenantId,claims.userId,"job.cancelled",{jobId:job.id});
        metrics.jobsTerminal++;
        return json(res,200,job);
      }
      return json(res,409,{error:"invalid transition",status:job.status});
    }

    if(req.method==="POST"&&url.pathname==="/v1/workers/claim"){
      permit(claims,"worker:claim");
      const input=parseJson(await readBody(req)),target=workerTarget(claims),workerId=String(input.workerId||claims.userId);
      if(input.target!==target)return json(res,403,{error:"worker target mismatch"});
      for(let i=0;i<10;i++){
        const ref=await queue.claim(target,claims.tenantId,workerId,Number(input.leaseMs||90000));
        if(!ref)return json(res,204,{});
        let job=await db.getJob(claims.tenantId,ref.jobId);
        if(!job||job.status!=="QUEUED"){
          await queue.ack(target,claims.tenantId,ref.jobId,workerId);
          continue;
        }
        job=await db.updateJob(claims.tenantId,job.id,"RUNNING",{attempt:job.attempt+1,workerId});
        await db.audit(claims.tenantId,claims.userId,"job.claimed",{jobId:job.id,workerId});
        await publish(job.tenantId,{type:"job",job});
        return json(res,200,job);
      }
      return json(res,204,{});
    }

    const h=url.pathname.match(/^\/v1\/workers\/jobs\/([^/]+)\/heartbeat$/);
    if(req.method==="POST"&&h){
      permit(claims,"worker:complete");
      const input=parseJson(await readBody(req)),job=await db.getJob(claims.tenantId,h[1]),workerId=String(input.workerId||claims.userId);
      if(!job||job.workerId!==workerId)return json(res,404,{error:"job not found"});
      const ok=await queue.heartbeat(job.target,job.tenantId,job.id,workerId,Number(input.leaseMs||90000));
      return json(res,ok?200:409,{ok});
    }

    const c=url.pathname.match(/^\/v1\/workers\/jobs\/([^/]+)\/complete$/);
    if(req.method==="POST"&&c){
      permit(claims,"worker:complete");
      let job=await db.getJob(claims.tenantId,c[1]);
      if(!job||job.status!=="RUNNING")return json(res,404,{error:"job not running"});
      const input=parseJson(await readBody(req));
      const receipt={
        jobId:job.id,task:job.task,attempt:job.attempt,workerId:job.workerId,
        exitCode:Number(input.exitCode),timedOut:Boolean(input.timedOut),
        durationMs:Number(input.durationMs||0),outputHash:String(input.outputHash||""),
        output:Array.isArray(input.output)?input.output.slice(-200):[],metadata:receiptMetadata(input),finishedAt:now()
      };
      const leaseOwned=await queue.ack(job.target,job.tenantId,job.id,job.workerId);
      if(!leaseOwned)return json(res,409,{error:"worker lease lost"});
      const status=receipt.exitCode===0&&!receipt.timedOut?"SUCCEEDED":job.attempt<job.maxAttempts?"QUEUED":"FAILED";
      job=await db.updateJob(claims.tenantId,job.id,status,{receipt,error:input.error||null});
      if(status==="QUEUED")await queue.enqueue(job.target,job.tenantId,job.id);
      else{
        await db.finishUsage(job.tenantId,job.userId,receipt.durationMs);
        metrics.jobsTerminal++;
      }
      await db.audit(claims.tenantId,claims.userId,`job.${status.toLowerCase()}`,{
        jobId:job.id,receipt:{exitCode:receipt.exitCode,durationMs:receipt.durationMs,outputHash:receipt.outputHash}
      });
      await publish(job.tenantId,{type:"job",job});
      return json(res,200,job);
    }

    if(req.method==="GET"&&url.pathname==="/v1/audit"){
      permit(claims,"audit:read");
      return json(res,200,{items:await db.listAudit(claims.tenantId)});
    }
    return json(res,404,{error:"not found"});
  }catch(e){
    metrics.errors++;
    console.error(e);
    return json(res,e.status||401,{error:e.message||"unauthorized"});
  }
});

const wss=new WebSocketServer({noServer:true});
server.on("upgrade",(req,socket,head)=>{
  try{
    req.claims=auth(req);
    wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));
  }catch{
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
});
wss.on("connection",(ws,req)=>{
  const tenant=req.claims.tenantId,set=clients.get(tenant)||new Set();
  set.add(ws);clients.set(tenant,set);
  send(ws,{type:"connected",at:now(),tenantId:tenant});
  ws.on("close",()=>{set.delete(ws);if(!set.size)clients.delete(tenant)});
});

server.listen(PORT,"0.0.0.0",()=>console.log(`control-plane listening on ${PORT}`));
const shutdown=async()=>{
  server.close();
  await Promise.all([db.close(),queue.close()]);
  process.exit(0);
};
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
