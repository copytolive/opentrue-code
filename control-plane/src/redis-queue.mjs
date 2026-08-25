import {createClient} from "redis";

const queueKey=(target,tenantId)=>`jobs:${target}:${tenantId}`;
const processingKey=(target,tenantId)=>`processing:${target}:${tenantId}`;
const leaseKey=(tenantId,jobId)=>`lease:${tenantId}:${jobId}`;
const eventChannel=tenantId=>`events:${tenantId}`;

export class RedisQueue{
  constructor(url){
    this.client=createClient({url});
    this.client.on("error",e=>console.error("redis",e.message));
    this.subscriber=null;
  }
  async connect(){
    if(!this.client.isOpen)await this.client.connect();
    return this;
  }
  async ping(){return this.client.ping()}
  async takeRateLimit(namespace,key,limit,windowMs=60000){
    const redisKey=`rate:${namespace}:${key}`;
    const script=`local n=redis.call('INCR',KEYS[1]);
      if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end;
      local ttl=redis.call('PTTL',KEYS[1]);
      return {n,ttl}`;
    const result=await this.client.eval(script,{keys:[redisKey],arguments:[String(windowMs)]});
    const count=Number(result?.[0]||0),retryAfterMs=Math.max(0,Number(result?.[1]||windowMs));
    return {allowed:count<=limit,count,remaining:Math.max(0,limit-count),retryAfterMs};
  }
  async enqueue(target,tenantId,jobId,priority=0){
    const item=JSON.stringify({tenantId,jobId});
    await this.client.zAdd(queueKey(target,tenantId),[{score:Date.now()-Math.max(0,priority)*1000,value:item}]);
    return item;
  }
  async recover(target,tenantId){
    const key=processingKey(target,tenantId);
    const expired=await this.client.zRangeByScore(key,0,Date.now());
    for(const item of expired){
      const {jobId}=JSON.parse(item);
      if(!await this.client.exists(leaseKey(tenantId,jobId))){
        await this.client.zRem(key,item);
        await this.client.zAdd(queueKey(target,tenantId),[{score:Date.now(),value:item}]);
      }
    }
    return expired.length;
  }
  async claim(target,tenantId,workerId,leaseMs=60000){
    await this.recover(target,tenantId);
    const script=`local v=redis.call('ZRANGE',KEYS[1],0,0)[1];
      if not v then return nil end;
      if redis.call('ZREM',KEYS[1],v)==0 then return nil end;
      local j=cjson.decode(v);
      local lease='lease:'..ARGV[4]..':'..j.jobId;
      redis.call('SET',lease,ARGV[1]..'|'..v,'PX',ARGV[2]);
      redis.call('ZADD',KEYS[2],ARGV[3],v);
      return v`;
    const item=await this.client.eval(script,{
      keys:[queueKey(target,tenantId),processingKey(target,tenantId)],
      arguments:[workerId,String(leaseMs),String(Date.now()+leaseMs),tenantId]
    });
    return item?JSON.parse(item):null;
  }
  async heartbeat(target,tenantId,jobId,workerId,leaseMs=60000){
    const key=leaseKey(tenantId,jobId),value=await this.client.get(key);
    if(!value?.startsWith(`${workerId}|`))return false;
    const item=value.slice(value.indexOf("|")+1);
    await this.client.pExpire(key,leaseMs);
    await this.client.zAdd(processingKey(target,tenantId),[{score:Date.now()+leaseMs,value:item}]);
    return true;
  }
  async ack(target,tenantId,jobId,workerId){
    const key=leaseKey(tenantId,jobId),value=await this.client.get(key);
    if(!value?.startsWith(`${workerId}|`))return false;
    await this.client.zRem(processingKey(target,tenantId),value.slice(value.indexOf("|")+1));
    await this.client.del(key);
    return true;
  }
  async publishEvent(tenantId,event){
    return this.client.publish(eventChannel(tenantId),JSON.stringify(event));
  }
  async subscribeEvents(handler){
    if(this.subscriber)return;
    this.subscriber=this.client.duplicate();
    this.subscriber.on("error",e=>console.error("redis-subscriber",e.message));
    await this.subscriber.connect();
    await this.subscriber.pSubscribe("events:*",(message,channel)=>{
      const tenantId=String(channel).slice("events:".length);
      try{handler(tenantId,JSON.parse(message))}catch(e){console.error("redis-event",e.message)}
    });
  }
  async aggregateStats(){
    const countPattern=async(pattern,type)=>{
      let total=0;
      for await(const batch of this.client.scanIterator({MATCH:pattern,COUNT:100})){
        const keys=Array.isArray(batch)?batch:[batch];
        for(const key of keys)total+=type==="zset"?await this.client.zCard(key):1;
      }
      return total;
    };
    const [queued,processing,leases]=await Promise.all([
      countPattern("jobs:*","zset"),countPattern("processing:*","zset"),countPattern("lease:*","keys")
    ]);
    return {queued,processing,leases};
  }
  async close(){
    if(this.subscriber?.isOpen)await this.subscriber.quit();
    if(this.client.isOpen)await this.client.quit();
  }
}
