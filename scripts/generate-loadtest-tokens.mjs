import {randomUUID} from "node:crypto";
import {signClaims} from "../control-plane/src/auth.mjs";

const secret=process.env.AUTH_SIGNING_SECRET||"";
if(secret.length<32)throw Error("AUTH_SIGNING_SECRET must match the staging control-plane secret and be at least 32 characters");
const users=Math.max(1,Math.min(Number(process.env.LOADTEST_USERS||1000),5000));
const tenantId=process.env.LOADTEST_TENANT_ID||randomUUID();
const ttl=Math.max(600,Math.min(Number(process.env.LOADTEST_TTL_SECONDS||7200),86400));
const tokens=[];
for(let i=0;i<users;i++){
  const userId=randomUUID();
  tokens.push({tenantId,userId,token:signClaims({tenantId,userId,role:"developer",plan:"free"},secret,ttl)});
}
process.stdout.write(JSON.stringify(tokens));
