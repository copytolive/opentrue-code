"use client";

import {useEffect,useState} from "react";

type Me={tenantId:string;userId:string;role:string;plan:string;workerTarget:string|null};
type Job={id:string;status:string;target:string;task:string;attempt:number;maxAttempts:number;receipt?:{exitCode:number;durationMs:number;output?:Array<{stream:string;text:string}>}|null;error?:string|null};
type Workspace={projectKey:string;state:Record<string,unknown>;version:number;updatedAt:string|null};

const box={background:"#111827",border:"1px solid #263247",borderRadius:10,padding:16,marginBottom:14} as const;
const input={width:"100%",boxSizing:"border-box" as const,background:"#0b1220",color:"#e5e7eb",border:"1px solid #374151",borderRadius:7,padding:"9px 10px",marginTop:6};
const button={background:"#2563eb",color:"white",border:0,borderRadius:7,padding:"9px 12px",cursor:"pointer",marginRight:8,marginTop:8};

export default function ControlPage(){
  const [token,setToken]=useState("");
  const [me,setMe]=useState<Me|null>(null);
  const [message,setMessage]=useState("Enter a signed OpenTrue token. The token is kept in sessionStorage only.");
  const [version,setVersion]=useState<number|null>(null);
  const [target,setTarget]=useState("sandbox");
  const [task,setTask]=useState("test");
  const [argsText,setArgsText]=useState('["."]');
  const [job,setJob]=useState<Job|null>(null);
  const [entitlement,setEntitlement]=useState<unknown>(null);

  useEffect(()=>{const saved=sessionStorage.getItem("opentrue.control.token");if(saved)setToken(saved)},[]);
  useEffect(()=>{if(token)sessionStorage.setItem("opentrue.control.token",token);else sessionStorage.removeItem("opentrue.control.token")},[token]);

  async function api(path:string,init:RequestInit={}){
    if(!token)throw Error("token is required");
    const r=await fetch(`/api${path}`,{...init,headers:{authorization:`Bearer ${token}`,"content-type":"application/json",...(init.headers||{})},cache:"no-store"});
    if(r.status===204)return null;
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(data.error||`${r.status} ${r.statusText}`);
    return data;
  }
  async function connect(){
    try{const data=await api("/v1/me") as Me;setMe(data);setMessage(`Connected: ${data.role} · ${data.plan}`)}catch(e){setMe(null);setMessage(`Connection failed: ${String(e)}`)}
  }
  async function pushWorkspace(){
    try{
      const raw=localStorage.getItem("opentrue.workspace.v1")||"{}",files=JSON.parse(raw);
      const current=await api("/v1/workspace/browser") as Workspace;
      const saved=await api("/v1/workspace/browser",{method:"PUT",body:JSON.stringify({state:{files},expectedVersion:current.version})}) as Workspace;
      setVersion(saved.version);setMessage(`Workspace uploaded · version ${saved.version}`);
    }catch(e){setMessage(`Workspace upload failed: ${String(e)}`)}
  }
  async function pullWorkspace(){
    try{
      const remote=await api("/v1/workspace/browser") as Workspace;
      const files=(remote.state as {files?:unknown})?.files;
      if(!files||typeof files!=="object")throw Error("remote workspace has no files yet");
      localStorage.setItem("opentrue.workspace.v1",JSON.stringify(files));setVersion(remote.version);setMessage(`Workspace downloaded · version ${remote.version}. Open the editor to load it.`);
    }catch(e){setMessage(`Workspace download failed: ${String(e)}`)}
  }
  async function createJob(){
    try{
      const args=JSON.parse(argsText);if(!Array.isArray(args))throw Error("args must be a JSON array");
      const data=await api("/v1/jobs",{method:"POST",body:JSON.stringify({target,task,args,requiresApproval:true})}) as Job;
      setJob(data);setMessage(`Job ${data.id} created; approval required.`);
    }catch(e){setMessage(`Create job failed: ${String(e)}`)}
  }
  async function approveJob(){
    if(!job)return;
    try{const data=await api(`/v1/jobs/${job.id}/approve`,{method:"POST",body:"{}"}) as Job;setJob(data);setMessage(`Job approved: ${data.status}`)}catch(e){setMessage(`Approve failed: ${String(e)}`)}
  }
  async function refreshJob(){
    if(!job)return;
    try{const data=await api(`/v1/jobs/${job.id}`) as Job;setJob(data);setMessage(`Job ${data.status}`)}catch(e){setMessage(`Refresh failed: ${String(e)}`)}
  }
  async function cancelJob(){
    if(!job)return;
    try{const data=await api(`/v1/jobs/${job.id}/cancel`,{method:"POST",body:"{}"}) as Job;setJob(data);setMessage(`Job ${data.status}`)}catch(e){setMessage(`Cancel failed: ${String(e)}`)}
  }
  async function loadBilling(){
    try{const data=await api("/v1/billing/entitlement");setEntitlement(data);setMessage("Entitlement loaded") }catch(e){setMessage(`Billing read failed: ${String(e)}`)}
  }

  return <main style={{minHeight:"100vh",background:"#07101f",color:"#e5e7eb",fontFamily:"system-ui",padding:24}}>
    <div style={{maxWidth:980,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:18}}><div><h1 style={{margin:0}}>OpenTrue Control</h1><p style={{color:"#93a4bd"}}>Real control-plane connection for workspace, jobs, workers and entitlement.</p></div><a href="/" style={{color:"#93c5fd"}}>← Browser IDE</a></div>
      <div style={{...box,borderColor:"#1d4ed8"}}><b>Status</b><p style={{marginBottom:0,color:"#bfdbfe"}}>{message}</p></div>

      <section style={box}><h2>1. Connect</h2><label>Signed bearer token<input type="password" value={token} onChange={e=>setToken(e.target.value)} style={input} placeholder="eyJ..."/></label><button style={button} onClick={connect}>Verify token</button>{me&&<pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(me,null,2)}</pre>}<small style={{color:"#9ca3af"}}>Generate on the trusted server with scripts/mint-token.mjs. Never put AUTH_SIGNING_SECRET in this browser.</small></section>

      <section style={box}><h2>2. Browser workspace cloud sync</h2><p>Pushes/pulls the actual Monaco browser workspace through tenant/user-scoped PostgreSQL state with optimistic versioning.</p><button style={button} onClick={pushWorkspace}>Upload this browser</button><button style={{...button,background:"#374151"}} onClick={pullWorkspace}>Download remote</button>{version!==null&&<p>Remote version: {version}</p>}</section>

      <section style={box}><h2>3. Approval-first execution</h2><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Target<select value={target} onChange={e=>setTarget(e.target.value)} style={input}><option value="sandbox">sandbox</option><option value="local-bridge">local-bridge</option><option value="vast">vast</option></select></label><label>Task<input value={task} onChange={e=>setTask(e.target.value)} style={input}/></label></div><label>Args JSON<input value={argsText} onChange={e=>setArgsText(e.target.value)} style={input}/></label><button style={button} onClick={createJob}>Create job</button>{job&&<><button style={{...button,background:"#059669"}} onClick={approveJob} disabled={job.status!=="WAITING_APPROVAL"}>Approve</button><button style={{...button,background:"#374151"}} onClick={refreshJob}>Refresh</button><button style={{...button,background:"#991b1b"}} onClick={cancelJob}>Cancel</button><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",background:"#030712",padding:12,borderRadius:7}}>{JSON.stringify(job,null,2)}</pre></>}</section>

      <section style={box}><h2>4. Subscription entitlement</h2><button style={button} onClick={loadBilling}>Read entitlement</button>{entitlement&&<pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(entitlement,null,2)}</pre>}</section>

      <section style={box}><h2>Worker examples</h2><p><b>sandbox</b>: task <code>test</code>, args <code>["."]</code> against the approved sandbox workspace root. <b>vast</b>: task <code>infer</code>, args contains the prompt. <b>local-bridge</b>: task must be allowlisted by its policy.</p><p style={{color:"#fbbf24"}}>A job is not proof of execution until its status is SUCCEEDED and its worker receipt contains an exit code/output hash.</p></section>
    </div>
  </main>
}
