import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {delimiter,dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,realpath,rename,stat,writeFile} from 'node:fs/promises';
import {AgentCore,GitAgent,buildRepoIndex,createCheckpoint,runProfile,run} from '../../agent-runtime/src/runtime.mjs';
import {ProviderRouter,providerDefaults} from './providers.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const BRIDGE=resolve(HERE,'../../local-bridge/src/bridge.mjs');
const HOST=process.env.OPENTRUE_ENGINE_HOST||'127.0.0.1';
const REQUEST_LIMIT=1_500_000;

function isLoopbackHost(host){return ['127.0.0.1','localhost','::1','[::1]'].includes(String(host).toLowerCase())}
function remoteUrl(value){
  const url=new URL(String(value||''));
  if(url.protocol!=='https:' && !(url.protocol==='http:'&&isLoopbackHost(url.hostname))){
    throw Error('control plane must use HTTPS unless it is loopback');
  }
  return url.toString().replace(/\/$/,'');
}
function inside(root,path){const a=resolve(root),b=resolve(path);return b===a||b.startsWith(a+sep)}
async function body(req){
  const chunks=[];let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>REQUEST_LIMIT)throw Object.assign(Error('request too large'),{statusCode:413});
    chunks.push(chunk);
  }
  if(!chunks.length)return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
  catch{throw Object.assign(Error('invalid JSON'),{statusCode:400})}
}
function send(res,status,data){
  const text=JSON.stringify(data);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(text);
}
function safeError(e){return {error:String(e?.message||e).slice(0,500),attempts:Array.isArray(e?.attempts)?e.attempts:undefined}}
async function assertGitRoot(path){
  const root=await realpath(resolve(path));
  const s=await stat(root);
  if(!s.isDirectory())throw Error('workspace must be a directory');
  const check=await run('git',['rev-parse','--show-toplevel'],{cwd:root,timeoutMs:10000});
  if(check.code!==0)throw Error('workspace must be a Git repository');
  const top=await realpath(resolve(check.stdout.trim()));
  if(top!==root)throw Error('choose the repository root, not a nested directory');
  return root;
}
async function existingFile(root,relativePath){
  const requested=resolve(root,String(relativePath||''));
  const file=await realpath(requested);
  if(!inside(root,file))throw Error('file escapes approved workspace');
  const s=await stat(file);
  if(!s.isFile())throw Error('path is not a file');
  if(s.size>1_000_000)throw Error('file exceeds 1 MB editor limit');
  return {file,s};
}
function routerFrom(config){
  return new ProviderRouter({
    provider:config.provider,model:config.model,endpoint:config.endpoint,apiKey:config.apiKey
  });
}

export async function startEngine(options={}){
  const token=String(options.token||process.env.OPENTRUE_ENGINE_TOKEN||'');
  if(token.length<24)throw Error('OPENTRUE_ENGINE_TOKEN must be at least 24 characters');

  const state={
    approvedRoots:new Set(),
    config:{
      provider:'ollama',
      model:'qwen3-coder:30b',
      endpoint:'http://127.0.0.1:11434',
      apiKey:''
    },
    remote:{child:null,status:'DISCONNECTED',lastError:null,startedAt:null}
  };

  async function approvedWorkspace(value){
    const root=await realpath(resolve(String(value||'')));
    if(!state.approvedRoots.has(root))throw Error('workspace is not approved');
    return root;
  }
  function stopRemote(){
    if(state.remote.child&&!state.remote.child.killed)state.remote.child.kill('SIGTERM');
    state.remote.child=null;state.remote.status='DISCONNECTED';state.remote.startedAt=null;
  }
  async function handle(req,res){
    try{
      const u=new URL(req.url||'/',`http://${HOST}`);
      if(u.pathname==='/health'&&req.method==='GET'){
        return send(res,200,{ok:true,service:'opentrue-engine',version:'0.3.0',remote:state.remote.status});
      }
      if(req.headers.authorization!==`Bearer ${token}`)return send(res,401,{error:'unauthorized'});

      if(u.pathname==='/v1/capabilities'&&req.method==='GET'){
        return send(res,200,{
          providers:['ollama','openai','anthropic','gemini','openai-compatible','lmstudio'],
          modes:['ask','plan','agent','debug'],
          tasks:['test','build','lint','typecheck','git_status','git_diff','checkpoint','git_commit','git_push','git_pr','git_checks'],
          remoteBridge:true,secureLoopback:true
        });
      }
      if(u.pathname==='/v1/config'&&req.method==='POST'){
        const input=await body(req);
        const provider=String(input.provider||state.config.provider);
        const defaults=providerDefaults(provider);
        state.config={
          provider:defaults.provider,
          model:String(input.model||state.config.model||'').trim(),
          endpoint:String(input.endpoint||defaults.endpoint).trim(),
          apiKey:String(input.apiKey||'')
        };
        routerFrom(state.config);
        return send(res,200,{
          ok:true,provider:state.config.provider,model:state.config.model,endpoint:state.config.endpoint,
          apiKeyStoredInMemory:Boolean(state.config.apiKey)
        });
      }
      if(u.pathname==='/v1/workspaces/approve'&&req.method==='POST'){
        const input=await body(req),root=await assertGitRoot(input.path);
        state.approvedRoots.add(root);
        return send(res,200,{ok:true,path:root});
      }
      if(u.pathname==='/v1/workspaces'&&req.method==='GET'){
        return send(res,200,{roots:[...state.approvedRoots]});
      }
      if(u.pathname==='/v1/files'&&req.method==='GET'){
        const root=await approvedWorkspace(u.searchParams.get('workspace'));
        const idx=await buildRepoIndex(root,{maxFiles:3000,maxBytes:300000});
        return send(res,200,{workspace:root,files:idx.files.map(f=>({path:f.path,bytes:f.bytes,symbols:f.symbols.slice(0,20)}))});
      }
      if(u.pathname==='/v1/file'&&req.method==='GET'){
        const root=await approvedWorkspace(u.searchParams.get('workspace'));
        const {file}=await existingFile(root,u.searchParams.get('path'));
        return send(res,200,{path:file.slice(root.length+1),content:await readFile(file,'utf8')});
      }
      if(u.pathname==='/v1/file'&&req.method==='PUT'){
        const input=await body(req);
        if(input.approved!==true)throw Object.assign(Error('file write requires explicit approval'),{statusCode:403});
        const root=await approvedWorkspace(input.workspace),{file,s}=await existingFile(root,input.path);
        const tmp=`${file}.opentrue-${process.pid}-${Date.now()}.tmp`;
        await writeFile(tmp,String(input.content??''),{mode:s.mode});
        await rename(tmp,file);
        return send(res,200,{ok:true,path:file.slice(root.length+1),bytes:Buffer.byteLength(String(input.content??''))});
      }
      if(u.pathname==='/v1/chat'&&req.method==='POST'){
        const input=await body(req),root=await approvedWorkspace(input.workspace);
        const mode=String(input.mode||'ask').toLowerCase();
        const approved=input.approved===true;
        if((mode==='agent'||mode==='debug')&&approved!==true&&input.requireApproval===false){
          throw Object.assign(Error('write-capable modes require approval policy'),{statusCode:403});
        }
        const core=new AgentCore(root,{router:routerFrom(state.config)});
        const result=await core.run({mode,task:String(input.prompt||''),approved,maxTurns:Number(input.maxTurns||8)});
        return send(res,200,result);
      }
      if(u.pathname==='/v1/tasks'&&req.method==='POST'){
        const input=await body(req),root=await approvedWorkspace(input.workspace),task=String(input.task||'');
        const approved=input.approved===true;
        if(['test','build','lint','typecheck'].includes(task))return send(res,200,await runProfile(root,task,input.args||[]));
        const git=new GitAgent(root);
        if(task==='git_status')return send(res,200,await git.status());
        if(task==='git_diff')return send(res,200,await git.diff());
        if(task==='checkpoint')return send(res,200,await createCheckpoint(root,String(input.label||'desktop')));
        if(task==='git_commit'){
          if(!approved)throw Object.assign(Error('commit requires explicit approval'),{statusCode:403});
          return send(res,200,{output:await git.commit(String(input.message||'OpenTrue Code desktop change'))});
        }
        if(task==='git_push')return send(res,200,{output:await git.push({approved})});
        if(task==='git_pr')return send(res,200,{output:await git.createPr({approved,title:String(input.title||'')})});
        if(task==='git_checks')return send(res,200,await git.checks());
        throw Object.assign(Error('task is not allowlisted'),{statusCode:400});
      }
      if(u.pathname==='/v1/remote/status'&&req.method==='GET'){
        return send(res,200,{status:state.remote.status,startedAt:state.remote.startedAt,lastError:state.remote.lastError});
      }
      if(u.pathname==='/v1/remote/disconnect'&&req.method==='POST'){
        stopRemote();return send(res,200,{ok:true,status:state.remote.status});
      }
      if(u.pathname==='/v1/remote/connect'&&req.method==='POST'){
        const input=await body(req);
        if(state.remote.child)stopRemote();
        const url=remoteUrl(input.url),controlToken=String(input.token||'');
        if(controlToken.length<24)throw Error('control-plane token is required');
        const roots=[...state.approvedRoots];
        if(!roots.length)throw Error('approve at least one workspace before connecting');
        state.remote.status='CONNECTING';state.remote.lastError=null;state.remote.startedAt=new Date().toISOString();
        const child=spawn(process.execPath,[BRIDGE],{
          env:{
            ...process.env,
            CONTROL_PLANE_URL:url,
            CONTROL_PLANE_TOKEN:controlToken,
            APPROVED_WORKSPACE_ROOTS:roots.join(delimiter),
            BRIDGE_ID:String(input.bridgeId||`desktop-${process.platform}-${process.pid}`)
          },
          stdio:['ignore','pipe','pipe'],
          windowsHide:true
        });
        state.remote.child=child;
        const note=data=>{
          const line=String(data).trim();
          if(line.includes('ready with'))state.remote.status='CONNECTED';
        };
        child.stdout.on('data',note);
        child.stderr.on('data',data=>{
          const text=String(data).trim();
          if(text)state.remote.lastError=text.slice(-500);
        });
        child.on('error',e=>{state.remote.status='ERROR';state.remote.lastError=String(e.message||e).slice(0,500)});
        child.on('exit',code=>{
          if(state.remote.child===child){
            state.remote.child=null;
            state.remote.status=code===0?'DISCONNECTED':'ERROR';
            if(code!==0&&!state.remote.lastError)state.remote.lastError=`bridge exited with code ${code}`;
          }
        });
        await new Promise(r=>setTimeout(r,250));
        return send(res,200,{ok:true,status:state.remote.status,url});
      }
      return send(res,404,{error:'not found'});
    }catch(e){
      return send(res,Number(e?.statusCode||500),safeError(e));
    }
  }

  const server=createServer(handle);
  const port=Number(options.port??process.env.OPENTRUE_ENGINE_PORT??0);
  await new Promise((ok,fail)=>{
    server.once('error',fail);
    server.listen(port,HOST,()=>{server.off('error',fail);ok()});
  });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  const close=async()=>{stopRemote();await new Promise(r=>server.close(()=>r()))};
  return {server,port:actualPort,host:HOST,close,state};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startEngine().then(engine=>{
    process.stdout.write(`OPENTRUE_ENGINE_READY ${JSON.stringify({host:engine.host,port:engine.port})}\n`);
    const stop=()=>engine.close().finally(()=>process.exit(0));
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
  }).catch(e=>{console.error(`OpenTrue Engine: ${e.message||e}`);process.exit(1)});
}
