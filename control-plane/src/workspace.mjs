import {createHash} from "node:crypto";import {mkdir,realpath} from "node:fs/promises";import {join,resolve,sep} from "node:path";
const safe=id=>createHash("sha256").update(String(id)).digest("hex").slice(0,32);
export async function tenantWorkspace(root,tenantId,projectId){const base=resolve(root),path=join(base,safe(tenantId),safe(projectId));await mkdir(path,{recursive:true,mode:0o700});const real=await realpath(path);if(real!==base&&!real.startsWith(base+sep))throw Error("workspace escape");return real}
