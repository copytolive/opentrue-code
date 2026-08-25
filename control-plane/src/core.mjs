import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const now=()=>new Date().toISOString();
export const safeEqual=(a="",b="")=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};

export class Store{
  constructor(path){this.path=path;this.state={jobs:[],audit:[]};this.write=Promise.resolve()}
  async load(){try{this.state=JSON.parse(await readFile(this.path,"utf8"))}catch(e){if(e.code!=="ENOENT")throw e;await this.persist()}return this}
  async persist(){this.write=this.write.then(async()=>{await mkdir(dirname(this.path),{recursive:true});const tmp=`${this.path}.tmp`;await writeFile(tmp,JSON.stringify(this.state,null,2),{mode:0o600});await rename(tmp,this.path)});return this.write}
  audit(action,details={}){const row={id:randomUUID(),at:now(),action,details};this.state.audit.push(row);return row}
  createJob(input,actor={tenantId:"legacy",userId:"legacy"}){const target=["control-plane","local-bridge","vast"].includes(input.target)?input.target:"control-plane";const job={id:randomUUID(),tenantId:actor.tenantId,userId:actor.userId,projectId:String(input.projectId||"default"),createdAt:now(),updatedAt:now(),status:input.requiresApproval===false?"QUEUED":"WAITING_APPROVAL",attempt:0,maxAttempts:Math.max(1,Math.min(input.maxAttempts||2,5)),timeoutMs:Math.max(1000,Math.min(input.timeoutMs||120000,900000)),target,task:input.task,args:Array.isArray(input.args)?input.args.map(String):[],receipt:null,error:null};this.state.jobs.push(job);this.audit("job.created",{tenantId:job.tenantId,userId:job.userId,jobId:job.id,target,task:job.task,status:job.status});return job}
  job(id){return this.state.jobs.find(x=>x.id===id)}
  update(job,status,extra={}){Object.assign(job,extra,{status,updatedAt:now()});this.audit(`job.${status.toLowerCase()}`,{jobId:job.id,...extra});return job}
}
