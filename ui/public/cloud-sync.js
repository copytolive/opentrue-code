(()=>{
  const WORKSPACE_KEY="opentrue.workspace.v1";
  const TOKEN_KEY="opentrue.control.token";
  const VERSION_PREFIX="opentrue.workspace.version.";
  const PROJECT_KEY="opentrue.workspace.project";
  const api="/api";
  const css=`
  #opentrue-cloud{position:fixed;right:12px;bottom:28px;z-index:2147483647;font:12px/1.4 system-ui,-apple-system,sans-serif;color:#e5e7eb}
  #opentrue-cloud button,#opentrue-cloud input{font:inherit}
  #opentrue-cloud .ot-toggle{border:1px solid #374151;background:#111827;color:#e5e7eb;border-radius:6px;padding:6px 9px;cursor:pointer;box-shadow:0 5px 18px #0008}
  #opentrue-cloud .ot-card{display:none;width:300px;margin-bottom:7px;background:#0b1220;border:1px solid #374151;border-radius:8px;padding:10px;box-shadow:0 10px 30px #000b}
  #opentrue-cloud.open .ot-card{display:block}
  #opentrue-cloud .ot-row{display:flex;gap:6px;margin-top:7px}
  #opentrue-cloud input{box-sizing:border-box;width:100%;border:1px solid #374151;background:#030712;color:#e5e7eb;border-radius:5px;padding:6px}
  #opentrue-cloud .ot-row button{flex:1;border:1px solid #374151;background:#111827;color:#e5e7eb;border-radius:5px;padding:6px;cursor:pointer}
  #opentrue-cloud .ot-row button:hover{background:#1f2937}
  #opentrue-cloud .ot-status{min-height:32px;margin-top:7px;color:#9ca3af;white-space:pre-wrap;word-break:break-word}
  #opentrue-cloud .ok{color:#86efac}.bad{color:#fca5a5}`;

  const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
  const root=document.createElement("div");root.id="opentrue-cloud";
  root.innerHTML=`<div class="ot-card">
    <b>OpenTrue Cloud Sync</b>
    <div style="margin-top:6px;color:#9ca3af">Token stays in this browser session only. AI inference remains local/open-weight.</div>
    <div style="margin-top:7px"><input class="ot-project" aria-label="Project key" placeholder="Project key" value="browser-main"></div>
    <div style="margin-top:6px"><input class="ot-token" aria-label="Control-plane token" type="password" autocomplete="off" placeholder="Signed control-plane token"></div>
    <div class="ot-row"><button class="ot-connect">Connect</button><button class="ot-clear">Clear token</button></div>
    <div class="ot-row"><button class="ot-pull">Pull cloud</button><button class="ot-push">Push cloud</button></div>
    <div class="ot-status">Not connected.</div>
  </div><button class="ot-toggle">☁ Cloud</button>`;
  document.body.appendChild(root);

  const $=s=>root.querySelector(s),status=$(".ot-status"),token=$(".ot-token"),project=$(".ot-project");
  const storedProject=localStorage.getItem(PROJECT_KEY);if(storedProject)project.value=storedProject;
  token.value=sessionStorage.getItem(TOKEN_KEY)||"";
  const projectKey=()=>{const v=(project.value||"browser-main").trim().slice(0,200)||"browser-main";localStorage.setItem(PROJECT_KEY,v);return v};
  const versionKey=()=>VERSION_PREFIX+projectKey();
  const setStatus=(text,ok=null)=>{status.textContent=text;status.className="ot-status"+(ok===true?" ok":ok===false?" bad":"")};
  const authToken=()=>sessionStorage.getItem(TOKEN_KEY)||token.value.trim();
  async function request(path,init={}){
    const t=authToken();if(!t)throw Error("Paste a signed token first.");
    const headers={...(init.headers||{}),authorization:`Bearer ${t}`};
    if(init.body)headers["content-type"]="application/json";
    const r=await fetch(api+path,{...init,headers,cache:"no-store"});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
    if(!r.ok)throw Error(`${r.status} ${typeof data==="object"&&data?.error?data.error:text||r.statusText}`);
    return data;
  }
  async function connect(){
    const t=token.value.trim();if(t)sessionStorage.setItem(TOKEN_KEY,t);
    setStatus("Connecting…");
    try{const me=await request("/v1/me");setStatus(`Connected · ${me.role} · ${me.plan}\nTenant ${me.tenantId}`,true)}catch(e){setStatus(String(e),false)}
  }
  async function pull(){
    setStatus("Pulling cloud workspace…");
    try{
      const data=await request(`/v1/workspace/${encodeURIComponent(projectKey())}`);
      if(!data?.state?.files||typeof data.state.files!=="object"||Array.isArray(data.state.files))throw Error("Cloud workspace has no file map yet.");
      localStorage.setItem(WORKSPACE_KEY,JSON.stringify(data.state.files));
      sessionStorage.setItem(versionKey(),String(Number(data.version||0)));
      setStatus(`Pulled version ${data.version||0}. Reloading editor…`,true);
      setTimeout(()=>location.reload(),250);
    }catch(e){setStatus(String(e),false)}
  }
  async function push(){
    setStatus("Pushing workspace…");
    try{
      const files=JSON.parse(localStorage.getItem(WORKSPACE_KEY)||"{}");
      if(!files||typeof files!=="object"||Array.isArray(files))throw Error("Local workspace is invalid.");
      const rawExpected=sessionStorage.getItem(versionKey());
      let expected=rawExpected===null?null:Number(rawExpected);
      if(expected!==null&&!Number.isFinite(expected))expected=null;
      if(expected===null){
        const current=await request(`/v1/workspace/${encodeURIComponent(projectKey())}`);
        expected=Number(current?.version||0);
      }
      const saved=await request(`/v1/workspace/${encodeURIComponent(projectKey())}`,{method:"PUT",body:JSON.stringify({state:{files},expectedVersion:expected})});
      sessionStorage.setItem(versionKey(),String(saved.version));
      setStatus(`Pushed version ${saved.version} · ${Object.keys(files).length} files`,true);
    }catch(e){
      const msg=String(e);setStatus(msg.includes("409")?"Version conflict. Pull cloud first, review, then push again.":msg,false);
    }
  }
  $(".ot-toggle").addEventListener("click",()=>root.classList.toggle("open"));
  $(".ot-connect").addEventListener("click",connect);
  $(".ot-pull").addEventListener("click",pull);
  $(".ot-push").addEventListener("click",push);
  $(".ot-clear").addEventListener("click",()=>{sessionStorage.removeItem(TOKEN_KEY);token.value="";setStatus("Token cleared from this browser session.")});
  project.addEventListener("change",()=>{localStorage.setItem(PROJECT_KEY,projectKey());setStatus("Project changed. Connect or sync.")});
})();
