import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

const dbUrl=process.env.TEST_DATABASE_URL,redisUrl=process.env.TEST_REDIS_URL,run=Boolean(dbUrl&&redisUrl);

test("PostgreSQL persists jobs and enforces tenant reads",{skip:!run},async()=>{
  const {PostgresStore}=await import("../src/postgres.mjs");
  let db=new PostgresStore(dbUrl);
  const tenant=randomUUID(),other=randomUUID(),user=randomUUID(),id=randomUUID();
  try{
    await db.ensureActor({tenantId:tenant,userId:user,role:"owner"});
    await db.createJob({id,tenantId:tenant,userId:user,projectId:"default",target:"vast",task:"infer",args:["hello"],status:"QUEUED",attempt:0,maxAttempts:2,timeoutMs:1000,createdAt:new Date().toISOString()});
    await db.close();db=new PostgresStore(dbUrl);
    assert.equal((await db.getJob(tenant,id)).id,id);
    assert.equal(await db.getJob(other,id),null);
  }finally{await db.close().catch(()=>{})}
});

test("Machine worker role can be persisted for tenant-scoped claims",{skip:!run},async()=>{
  const {PostgresStore}=await import("../src/postgres.mjs");
  const db=new PostgresStore(dbUrl),tenant=randomUUID(),worker=randomUUID();
  try{
    await db.ensureActor({tenantId:tenant,userId:worker,role:"worker"});
    const r=await db.pool.query("SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2",[tenant,worker]);
    assert.equal(r.rows[0]?.role,"worker");
  }finally{await db.close()}
});

test("Redis lease recovery stays tenant isolated",{skip:!run},async()=>{
  const {RedisQueue}=await import("../src/redis-queue.mjs");
  const q=await new RedisQueue(redisUrl).connect(),target=`test-${randomUUID()}`,tenantA=randomUUID(),tenantB=randomUUID(),jobA=randomUUID(),jobB=randomUUID();
  try{
    await q.enqueue(target,tenantA,jobA);
    await q.enqueue(target,tenantB,jobB);
    assert.equal((await q.claim(target,tenantA,"worker-a",50)).jobId,jobA);
    assert.equal((await q.claim(target,tenantB,"worker-b",1000)).jobId,jobB);
    assert.equal(await q.ack(target,tenantB,jobB,"worker-b"),true);
    await new Promise(r=>setTimeout(r,80));
    assert.equal((await q.claim(target,tenantA,"worker-c",1000)).jobId,jobA);
    assert.equal(await q.ack(target,tenantA,jobA,"worker-c"),true);
  }finally{await q.close()}
});

test("Redis pubsub carries tenant events across control-plane instances",{skip:!run},async()=>{
  const {RedisQueue}=await import("../src/redis-queue.mjs");
  const publisher=await new RedisQueue(redisUrl).connect(),subscriber=await new RedisQueue(redisUrl).connect(),tenant=randomUUID();
  try{
    const received=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error("event timeout")),2000);
      subscriber.subscribeEvents((gotTenant,event)=>{if(gotTenant===tenant){clearTimeout(timer);resolve(event)}}).catch(reject);
    });
    await new Promise(r=>setTimeout(r,50));
    await publisher.publishEvent(tenant,{type:"job",id:"cross-instance"});
    assert.deepEqual(await received,{type:"job",id:"cross-instance"});
  }finally{await publisher.close();await subscriber.close()}
});

test("Redis aggregate stats expose counts without tenant labels",{skip:!run},async()=>{
  const {RedisQueue}=await import("../src/redis-queue.mjs");
  const q=await new RedisQueue(redisUrl).connect(),target=`stats-${randomUUID()}`,tenant=randomUUID(),job=randomUUID();
  try{
    const before=await q.aggregateStats();
    await q.enqueue(target,tenant,job);
    const queued=await q.aggregateStats();
    assert.ok(queued.queued>=before.queued+1);
    await q.claim(target,tenant,"stats-worker",1000);
    const processing=await q.aggregateStats();
    assert.ok(processing.processing>=before.processing+1);
    assert.ok(processing.leases>=before.leases+1);
    await q.ack(target,tenant,job,"stats-worker");
  }finally{await q.close()}
});

test("Redis request limiter blocks one identity without blocking another",{skip:!run},async()=>{
  const {RedisQueue}=await import("../src/redis-queue.mjs");
  const q=await new RedisQueue(redisUrl).connect(),bucket=`test-${randomUUID()}`,a=randomUUID(),b=randomUUID();
  try{
    assert.equal((await q.takeRateLimit(bucket,a,2,1000)).allowed,true);
    assert.equal((await q.takeRateLimit(bucket,a,2,1000)).allowed,true);
    const blocked=await q.takeRateLimit(bucket,a,2,1000);
    assert.equal(blocked.allowed,false);
    assert.equal(blocked.remaining,0);
    assert.ok(blocked.retryAfterMs>0);
    assert.equal((await q.takeRateLimit(bucket,b,2,1000)).allowed,true);
  }finally{await q.close()}
});

test("Workspace sync is versioned and billing webhook is idempotent",{skip:!run},async()=>{
  const {PostgresStore}=await import("../src/postgres.mjs");
  const db=new PostgresStore(dbUrl),tenant=randomUUID(),user=randomUUID(),event=randomUUID();
  try{
    await db.ensureActor({tenantId:tenant,userId:user,role:"owner"});
    const first=await db.putWorkspaceState(tenant,user,"demo",{open:["README.md"]},0);
    assert.equal(first.version,1);
    const conflict=await db.putWorkspaceState(tenant,user,"demo",{open:["other"]},0);
    assert.equal(conflict,null);
    const second=await db.putWorkspaceState(tenant,user,"demo",{open:["src"]},1);
    assert.equal(second.version,2);
    const billing={provider:"test",eventId:event,tenantId:tenant,plan:"pro",status:"active",payloadHash:"abc"};
    assert.deepEqual(await db.applyBillingWebhook(billing),{duplicate:false});
    assert.deepEqual(await db.applyBillingWebhook(billing),{duplicate:true});
    assert.equal(await db.effectivePlan(tenant,"free"),"pro");
  }finally{await db.close()}
});
