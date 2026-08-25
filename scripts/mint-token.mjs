import {randomUUID} from "node:crypto";
import {signClaims} from "../control-plane/src/auth.mjs";

const secret=process.env.AUTH_SIGNING_SECRET||"";
if(secret.length<32)throw Error("AUTH_SIGNING_SECRET must be at least 32 characters");
const role=process.env.ROLE||"owner";
const roles=new Set(["owner","admin","developer","viewer","worker"]);
if(!roles.has(role))throw Error(`invalid ROLE: ${role}`);
const tenantId=process.env.TENANT_ID||randomUUID();
const userId=process.env.USER_ID||randomUUID();
const ttl=Math.max(60,Math.min(Number(process.env.TTL_SECONDS||3600),86400*30));
const claims={tenantId,userId,role};
if(role!=="worker")claims.plan=process.env.PLAN||"free";
if(role==="worker"){
  const target=process.env.WORKER_TARGET||"sandbox";
  if(!new Set(["local-bridge","vast","sandbox","deploy-staging","deploy-production"]).has(target))throw Error(`invalid WORKER_TARGET: ${target}`);
  claims.workerTarget=target;
}
const token=signClaims(claims,secret,ttl);
process.stdout.write(JSON.stringify({tenantId,userId,role,workerTarget:claims.workerTarget||null,expiresInSeconds:ttl,token})+"\n");
