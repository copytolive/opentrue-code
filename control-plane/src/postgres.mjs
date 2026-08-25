import pg from "pg";
const {Pool}=pg;
const jobRow=row=>row?({
  id:row.id,tenantId:row.tenant_id,userId:row.user_id,projectId:row.project_id||"default",
  target:row.target,task:row.task,args:row.args,status:row.status,attempt:row.attempt,
  maxAttempts:row.max_attempts,timeoutMs:row.timeout_ms,workerId:row.worker_id,
  receipt:row.receipt,error:row.error,
  createdAt:row.created_at?.toISOString?.()||row.created_at,
  updatedAt:row.updated_at?.toISOString?.()||row.updated_at
}):null;

export class PostgresStore{
  constructor(url){
    this.pool=new Pool({
      connectionString:url,
      max:Number(process.env.DB_POOL_SIZE||20),
      statement_timeout:15000,
      application_name:"opentrue-control-plane"
    });
  }
  async ping(){await this.pool.query("SELECT 1")}
  async withTenant(tenantId,fn){
    const c=await this.pool.connect();
    try{
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
      const value=await fn(c);
      await c.query("COMMIT");
      return value;
    }catch(e){
      await c.query("ROLLBACK");
      throw e;
    }finally{c.release()}
  }
  async ensureActor({tenantId,userId,role="developer",plan="free"}){
    await this.pool.query("INSERT INTO tenants(id,name,plan) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",[tenantId,`tenant-${tenantId}`,plan]);
    await this.pool.query("INSERT INTO users(id,external_subject) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",[userId,`subject-${userId}`]);
    await this.pool.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=EXCLUDED.role",[tenantId,userId,role]);
  }
  async effectivePlan(tenantId,fallback="free"){
    return this.withTenant(tenantId,async c=>{
      const r=await c.query(`SELECT plan FROM billing_entitlements
        WHERE tenant_id=$1 AND status IN('active','trial')
        AND (period_end IS NULL OR period_end>now())`,[tenantId]);
      return r.rows[0]?.plan||fallback;
    });
  }
  async createJob(job){
    return this.withTenant(job.tenantId,async c=>jobRow((await c.query(
      `INSERT INTO jobs(id,tenant_id,user_id,project_id,target,task,args,status,attempt,max_attempts,timeout_ms,created_at,updated_at)
       VALUES($1,$2,$3,NULLIF($4,'default')::uuid,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
      [job.id,job.tenantId,job.userId,job.projectId,job.target,job.task,JSON.stringify(job.args),job.status,job.attempt,job.maxAttempts,job.timeoutMs,job.createdAt]
    )).rows[0]));
  }
  async getJob(tenantId,id){
    return this.withTenant(tenantId,async c=>jobRow((await c.query("SELECT * FROM jobs WHERE id=$1",[id])).rows[0]));
  }
  async updateJob(tenantId,id,status,extra={}){
    return this.withTenant(tenantId,async c=>jobRow((await c.query(
      "UPDATE jobs SET status=$2,attempt=COALESCE($3,attempt),worker_id=COALESCE($4,worker_id),receipt=COALESCE($5,receipt),error=$6,updated_at=now() WHERE id=$1 RETURNING *",
      [id,status,extra.attempt??null,extra.workerId??null,extra.receipt?JSON.stringify(extra.receipt):null,extra.error??null]
    )).rows[0]));
  }
  async getWorkspaceState(tenantId,userId,projectKey){
    return this.withTenant(tenantId,async c=>{
      const r=await c.query("SELECT project_key,state,version,updated_at FROM workspace_states WHERE tenant_id=$1 AND user_id=$2 AND project_key=$3",[tenantId,userId,projectKey]);
      const row=r.rows[0];
      return row?{projectKey:row.project_key,state:row.state,version:Number(row.version),updatedAt:row.updated_at?.toISOString?.()||row.updated_at}:null;
    });
  }
  async putWorkspaceState(tenantId,userId,projectKey,state,expectedVersion=null){
    return this.withTenant(tenantId,async c=>{
      const r=await c.query(`INSERT INTO workspace_states(tenant_id,user_id,project_key,state,version)
        VALUES($1,$2,$3,$4,1)
        ON CONFLICT(tenant_id,user_id,project_key) DO UPDATE
        SET state=EXCLUDED.state,version=workspace_states.version+1,updated_at=now()
        WHERE $5::bigint IS NULL OR workspace_states.version=$5
        RETURNING project_key,state,version,updated_at`,
        [tenantId,userId,projectKey,JSON.stringify(state),expectedVersion]);
      const row=r.rows[0];
      return row?{projectKey:row.project_key,state:row.state,version:Number(row.version),updatedAt:row.updated_at?.toISOString?.()||row.updated_at}:null;
    });
  }
  async getEntitlement(tenantId){
    return this.withTenant(tenantId,async c=>{
      const row=(await c.query("SELECT provider,plan,status,period_end,provider_customer_id,updated_at FROM billing_entitlements WHERE tenant_id=$1",[tenantId])).rows[0];
      return row?{provider:row.provider,plan:row.plan,status:row.status,periodEnd:row.period_end?.toISOString?.()||row.period_end,providerCustomerId:row.provider_customer_id,updatedAt:row.updated_at?.toISOString?.()||row.updated_at}:null;
    });
  }
  async applyBillingWebhook({provider,eventId,tenantId,plan,status,periodEnd=null,providerCustomerId=null,payloadHash}){
    const c=await this.pool.connect();
    try{
      await c.query("BEGIN");
      const seen=await c.query("INSERT INTO webhook_events(provider,event_id,tenant_id,payload_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id",[provider,eventId,tenantId,payloadHash]);
      if(!seen.rowCount){await c.query("ROLLBACK");return {duplicate:true}}
      await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
      await c.query(`INSERT INTO billing_entitlements(tenant_id,provider,plan,status,period_end,provider_customer_id)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(tenant_id) DO UPDATE SET provider=EXCLUDED.provider,plan=EXCLUDED.plan,status=EXCLUDED.status,
        period_end=EXCLUDED.period_end,provider_customer_id=EXCLUDED.provider_customer_id,updated_at=now()`,
        [tenantId,provider,plan,status,periodEnd,providerCustomerId]);
      await c.query("COMMIT");
      return {duplicate:false};
    }catch(e){
      await c.query("ROLLBACK");
      throw e;
    }finally{c.release()}
  }
  async audit(tenantId,userId,action,details={}){
    return this.withTenant(tenantId,async c=>(await c.query(
      "INSERT INTO audit_events(id,tenant_id,user_id,action,details) VALUES(gen_random_uuid(),$1,$2,$3,$4) RETURNING *",
      [tenantId,userId||null,action,JSON.stringify(details)]
    )).rows[0]);
  }
  async listAudit(tenantId,limit=500){
    return this.withTenant(tenantId,async c=>(await c.query("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT $1",[limit])).rows);
  }
  async startUsage(tenantId,userId,limit){
    return this.withTenant(tenantId,async c=>{
      const r=await c.query(`INSERT INTO usage_daily(tenant_id,user_id,day,jobs,active)
        VALUES($1,$2,current_date,1,1)
        ON CONFLICT(tenant_id,user_id,day) DO UPDATE
        SET jobs=usage_daily.jobs+1,active=usage_daily.active+1
        WHERE ($3::integer IS NULL OR usage_daily.jobs<$3) AND usage_daily.active<$4
        RETURNING jobs,active`,[tenantId,userId,limit.jobs,limit.concurrent]);
      return r.rows[0]||null;
    });
  }
  async finishUsage(tenantId,userId,computeMs=0){
    await this.withTenant(tenantId,c=>c.query(
      "UPDATE usage_daily SET active=GREATEST(0,active-1),compute_ms=compute_ms+$3 WHERE tenant_id=$1 AND user_id=$2 AND day=current_date",
      [tenantId,userId,computeMs]
    ));
  }
  async close(){await this.pool.end()}
}
