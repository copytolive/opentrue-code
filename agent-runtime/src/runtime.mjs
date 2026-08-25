import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {basename, dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_SKIP = new Set(['.git','node_modules','.next','dist','build','coverage','vendor']);
const TEXT_EXT = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|kts|rb|php|swift|c|cc|cpp|h|hpp|cs|css|scss|html?|vue|svelte|json|ya?ml|toml|ini|md|mdx|sql|sh|bash|zsh|txt)$/i;
const MODES = new Set(['ask','plan','agent','debug']);
const sha = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function run(cmd, args = [], opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const timeoutMs = Math.max(1000, Number(opts.timeoutMs || 120000));
  const maxOutput = Math.max(1024, Number(opts.maxOutput || 2_000_000));
  return await new Promise(resolveRun => {
    const started = Date.now();
    let stdout = '', stderr = '', timedOut = false, settled = false;
    const child = spawn(cmd, args, {cwd, env:{...process.env, ...(opts.env||{})}, stdio:['ignore','pipe','pipe'], shell:false});
    const append = (kind, data) => {
      const text = String(data);
      if (kind === 'stdout' && stdout.length < maxOutput) stdout += text.slice(0, maxOutput - stdout.length);
      if (kind === 'stderr' && stderr.length < maxOutput) stderr += text.slice(0, maxOutput - stderr.length);
    };
    child.stdout?.on('data', d => append('stdout', d));
    child.stderr?.on('data', d => append('stderr', d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, timeoutMs);
    const finish = (code, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({code: code ?? -1, stdout, stderr, timedOut, error:error?String(error):null, durationMs:Date.now()-started});
    };
    child.on('error', e => finish(-1, e));
    child.on('close', code => finish(code));
  });
}

export async function repoRoot(cwd = process.cwd()) {
  const r = await run('git',['rev-parse','--show-toplevel'],{cwd,timeoutMs:10000});
  if (r.code !== 0) throw Error('not inside a git repository');
  return resolve(r.stdout.trim());
}

function isInside(root, path) {
  const a = resolve(root), b = resolve(path);
  return b === a || b.startsWith(a + sep);
}
function assertInside(root, path) {
  if (!isInside(root, path)) throw Error('path escapes workspace');
  return resolve(path);
}
async function readText(path, maxBytes = 600_000) {
  try {
    const s = await stat(path);
    if (!s.isFile() || s.size > maxBytes) return null;
    const b = await readFile(path);
    if (b.includes(0)) return null;
    return b.toString('utf8');
  } catch { return null; }
}
async function readJson(path, fallback) { try { return JSON.parse(await readFile(path,'utf8')); } catch { return fallback; } }
async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), {recursive:true});
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value,null,2)+'\n');
  await rename(tmp,path);
}

async function loadIgnore(root) {
  const patterns=[];
  for (const name of ['.gitignore','.opentrueignore']) {
    try {
      for (const raw of (await readFile(join(root,name),'utf8')).split(/\r?\n/)) {
        const x=raw.trim(); if (x && !x.startsWith('#') && !x.startsWith('!')) patterns.push(x.replace(/^\//,''));
      }
    } catch {}
  }
  return patterns;
}
function globIgnored(rel, patterns) {
  const p=rel.replaceAll('\\','/');
  return patterns.some(raw => {
    const esc = raw.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'.*').replace(/\*/g,'[^/]*').replace(/\?/g,'.');
    try { return new RegExp(`(^|/)${esc}($|/)`).test(p); } catch { return false; }
  });
}

export async function walkRepo(root, opts = {}) {
  root=resolve(root);
  const patterns=await loadIgnore(root), out=[];
  const maxFiles=Number(opts.maxFiles||6000), maxBytes=Number(opts.maxBytes||600_000);
  async function walk(dir) {
    if (out.length >= maxFiles) return;
    for (const e of await readdir(dir,{withFileTypes:true})) {
      const abs=join(dir,e.name), rel=relative(root,abs).replaceAll('\\','/');
      if (DEFAULT_SKIP.has(e.name) || rel.startsWith('.opentrue/checkpoints/') || rel.startsWith('.opentrue/browser/') || globIgnored(rel,patterns)) continue;
      if (e.isDirectory()) { await walk(abs); continue; }
      if (!e.isFile()) continue;
      if (!TEXT_EXT.test(e.name) && !/[Dd]ockerfile$/.test(e.name) && !/[Mm]akefile$/.test(e.name)) continue;
      const text=await readText(abs,maxBytes); if (text!=null) out.push({path:rel,text,bytes:Buffer.byteLength(text)});
      if (out.length >= maxFiles) return;
    }
  }
  await walk(root); return out;
}

function terms(s) { return [...String(s).toLowerCase().matchAll(/[a-z_$][a-z0-9_$.-]{1,}/g)].map(x=>x[0]); }
function vector(s, size=256) {
  const v=new Float64Array(size);
  for (const t of terms(s)) { const h=createHash('sha1').update(t).digest(); v[h.readUInt16BE(0)%size] += 1; }
  let n=0; for (const x of v) n+=x*x; n=Math.sqrt(n)||1; for(let i=0;i<v.length;i++) v[i]/=n; return v;
}
function cosine(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function extractSymbols(text){const set=new Set();const re=/(?:function|class|interface|type|enum|const|let|var|def|struct|trait)\s+([A-Za-z_$][\w$]*)/g;let m;while((m=re.exec(text)))set.add(m[1]);return [...set];}
function extractImports(text){const out=new Set();for(const re of [/\bfrom\s+["']([^"']+)["']/g,/\brequire\(["']([^"']+)["']\)/g,/\bimport\s+["']([^"']+)["']/g]){let m;while((m=re.exec(text)))out.add(m[1]);}return [...out];}
function snippet(text, qterms){const lines=text.split(/\r?\n/);let at=0;for(let i=0;i<lines.length;i++){if(qterms.some(t=>lines[i].toLowerCase().includes(t))){at=i;break;}}return lines.slice(Math.max(0,at-2),Math.min(lines.length,at+5)).join('\n').slice(0,1400);}

export async function buildRepoIndex(root, opts={}) {
  const files=await walkRepo(root,opts);
  return {root:resolve(root),createdAt:new Date().toISOString(),files:files.map(f=>({...f,symbols:extractSymbols(f.text),imports:extractImports(f.text),vector:vector(`${f.path}\n${f.text}`)}))};
}
export function searchIndex(index, query, limit=12) {
  const qv=vector(query), qt=terms(query);
  return index.files.map(f=>{
    const lowPath=f.path.toLowerCase(), lowText=f.text.toLowerCase();
    const lexical=qt.reduce((n,t)=>n+(lowPath.includes(t)?5:0)+(lowText.includes(t)?1:0),0);
    return {path:f.path,score:cosine(qv,f.vector)+lexical*0.15,symbols:f.symbols.slice(0,20),snippet:snippet(f.text,qt)};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export function dependencyGraph(index){return Object.fromEntries(index.files.map(f=>[f.path,f.imports]));}
export function findSymbol(index, name) {
  const safe=String(name).replace(/[^A-Za-z0-9_$]/g,'\\$&'); if(!safe) return [];
  const re=new RegExp(`\\b${safe}\\b`);
  return index.files.flatMap(f=>{const refs=[];f.text.split(/\r?\n/).forEach((line,i)=>{if(re.test(line))refs.push({line:i+1,text:line.slice(0,500)});});return refs.length?[{path:f.path,defined:f.symbols.includes(name),refs}]:[];});
}
export async function multiRepoContext(roots, query, limit=6){const all=[];for(const root of roots){const idx=await buildRepoIndex(root);for(const hit of searchIndex(idx,query,limit))all.push({...hit,root:resolve(root)});}return all.sort((a,b)=>b.score-a.score).slice(0,limit*Math.max(1,roots.length));}

export async function loadContext(root,cwd=root){
  const rules=[];
  for(const p of [join(root,'AGENTS.md'),join(cwd,'AGENTS.md')]){const t=await readText(p,200_000);if(t&&!rules.some(x=>x.path===p))rules.push({path:p,text:t});}
  try{for(const e of await readdir(join(root,'.opentrue','rules'))){if(e.endsWith('.md')){const p=join(root,'.opentrue','rules',e),t=await readText(p,200_000);if(t)rules.push({path:p,text:t});}}}catch{}
  const memory=await readJson(join(root,'.opentrue','memory.json'),{}), skills=[];
  try{for(const e of await readdir(join(root,'.opentrue','skills'),{withFileTypes:true})){if(!e.isDirectory())continue;const p=join(root,'.opentrue','skills',e.name,'SKILL.md'),t=await readText(p,300_000);if(t)skills.push({name:e.name,text:t});}}catch{}
  return {rules,memory,skills};
}
export async function remember(root,key,value){const p=join(root,'.opentrue','memory.json'),m=await readJson(p,{});m[String(key)]=value;await writeJsonAtomic(p,m);return m;}

export async function createCheckpoint(root,label='checkpoint') {
  root=resolve(root); const dir=join(root,'.opentrue','checkpoints',`${Date.now()}-${randomUUID().slice(0,8)}`); await mkdir(join(dir,'untracked'),{recursive:true});
  const headRun=await run('git',['rev-parse','HEAD'],{cwd:root}); if(headRun.code!==0) throw Error(headRun.stderr||'git rev-parse failed');
  const diff=await run('git',['diff','--binary','HEAD'],{cwd:root}); if(diff.code!==0) throw Error(diff.stderr||'git diff failed');
  await writeFile(join(dir,'changes.diff'),diff.stdout);
  const untrackedRun=await run('git',['ls-files','--others','--exclude-standard','-z'],{cwd:root});
  const untracked=untrackedRun.stdout.split('\0').filter(Boolean);
  for(const rel of untracked){const src=assertInside(root,join(root,rel)),dst=join(dir,'untracked',rel);await mkdir(dirname(dst),{recursive:true});await copyFile(src,dst);}
  const manifest={id:basename(dir),label:String(label).slice(0,200),head:headRun.stdout.trim(),createdAt:new Date().toISOString(),untracked,diffHash:sha(diff.stdout)};
  await writeJsonAtomic(join(dir,'manifest.json'),manifest); return manifest;
}
export async function restoreCheckpoint(root,id,{force=false}={}) {
  if(!force) throw Error('checkpoint restore requires explicit force approval'); root=resolve(root);
  const base=join(root,'.opentrue','checkpoints'),dir=assertInside(base,join(base,String(id||''))),m=await readJson(join(dir,'manifest.json'),null); if(!m) throw Error('checkpoint not found');
  const current=(await run('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(); if(current!==m.head) throw Error('checkpoint base HEAD differs; refusing destructive restore');
  let r=await run('git',['reset','--hard',m.head],{cwd:root}); if(r.code!==0) throw Error(r.stderr||'reset failed');
  r=await run('git',['clean','-fd','-e','.opentrue/'],{cwd:root}); if(r.code!==0) throw Error(r.stderr||'clean failed');
  const patch=await readFile(join(dir,'changes.diff'),'utf8');
  if(patch){await new Promise((ok,fail)=>{const p=spawn('git',['apply','--binary','-'],{cwd:root,stdio:['pipe','pipe','pipe']});let err='';p.stderr.on('data',d=>err+=String(d));p.on('error',fail);p.on('close',c=>c===0?ok():fail(Error(err||'git apply checkpoint failed')));p.stdin.end(patch);});}
  for(const rel of m.untracked||[]){const src=join(dir,'untracked',rel),dst=assertInside(root,join(root,rel));await mkdir(dirname(dst),{recursive:true});await copyFile(src,dst);} return m;
}

export async function previewHunks(root,file,hunks,acceptedIds=null){
  const path=assertInside(root,join(root,file)), original=await readFile(path,'utf8'), selected=acceptedIds?new Set(acceptedIds):null;
  const chosen=hunks.filter(h=>!selected||selected.has(h.id)), lines=original.split('\n');
  for(const h of [...chosen].sort((a,b)=>Number(b.start)-Number(a.start))){const start=Number(h.start),end=Number(h.end);if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start-1||end>lines.length)throw Error(`invalid hunk ${h.id}`);lines.splice(start-1,end-start+1,...String(h.replacement??'').split('\n'));}
  const proposed=lines.join('\n'); return {file,original,proposed,hunks:chosen.map(h=>h.id),hash:sha(proposed)};
}
export async function applyHunks(root,file,hunks,acceptedIds,{approved=false}={}){if(!approved)throw Error('edit requires approval');const p=await previewHunks(root,file,hunks,acceptedIds);const path=assertInside(root,join(root,file)),tmp=`${path}.${randomUUID()}.tmp`;await writeFile(tmp,p.proposed);await rename(tmp,path);return p;}

async function packageScripts(root){return (await readJson(join(root,'package.json'),{})).scripts||{};}
export async function runProfile(root,profile,args=[]){
  const scripts=await packageScripts(root), map={test:'test',build:'build',lint:'lint',typecheck:'typecheck'};
  if(map[profile]){if(!scripts[map[profile]])return {code:0,stdout:`SKIP: npm script ${map[profile]} not defined\n`,stderr:'',durationMs:0,skipped:true};return run('npm',['run',map[profile],'--',...args],{cwd:root,timeoutMs:300000});}
  if(profile==='git-status')return run('git',['status','--short'],{cwd:root}); throw Error('profile is not allowlisted');
}
export async function qualityLoop(root,profiles=['lint','typecheck','test','build'],fixer=null,maxRounds=3){const rounds=[];for(let round=1;round<=maxRounds;round++){const results=[];for(const profile of profiles){const r=await runProfile(root,profile);results.push({profile,...r});if(r.code!==0)break;}rounds.push(results);const failed=results.find(x=>x.code!==0);if(!failed)return {ok:true,rounds};if(!fixer||round===maxRounds)return {ok:false,rounds,failed};await fixer({round,failed,results});}return {ok:false,rounds};}

export function allowedBrowserUrl(raw,extraHosts=[]){let u;try{u=new URL(raw);}catch{return false;}if(!['http:','https:'].includes(u.protocol))return false;const host=u.hostname.toLowerCase();return host==='localhost'||host==='127.0.0.1'||host==='::1'||extraHosts.map(x=>String(x).toLowerCase()).includes(host);}
async function browserBinary(){for(const p of [process.env.OPENTRUE_BROWSER_BIN,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean)){try{if((await stat(p)).isFile())return p;}catch{}}throw Error('Chrome/Chromium not found; set OPENTRUE_BROWSER_BIN');}
class CdpClient{
  constructor(url){this.ws=new WebSocket(url);this.seq=0;this.pending=new Map();this.eventLog=[];this.bound=false;}
  async ready(){if(this.ws.readyState!==1)await new Promise((ok,fail)=>{this.ws.addEventListener('open',ok,{once:true});this.ws.addEventListener('error',fail,{once:true});});if(!this.bound){this.bound=true;this.ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method)this.eventLog.push(m);});}}
  async call(method,params={}){await this.ready();const id=++this.seq;return await new Promise((resolveCall,reject)=>{this.pending.set(id,{resolve:resolveCall,reject});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){try{this.ws.close();}catch{}}
}
export class BrowserAgent{
  constructor(root,{allowedHosts=[]}={}){this.root=resolve(root);this.allowedHosts=allowedHosts;this.child=null;this.cdp=null;}
  async start(url='http://localhost:3000'){if(!allowedBrowserUrl(url,this.allowedHosts))throw Error('browser URL is not allowlisted');const bin=await browserBinary(),port=43000+Math.floor(Math.random()*5000),profile=join(this.root,'.opentrue','browser',randomUUID());await mkdir(profile,{recursive:true});this.child=spawn(bin,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});let info=null;for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'});if(r.ok){info=await r.json();break;}}catch{}await sleep(250);}if(!info?.webSocketDebuggerUrl)throw Error('browser DevTools endpoint did not become ready');this.cdp=new CdpClient(info.webSocketDebuggerUrl);await this.cdp.call('Page.enable');await this.cdp.call('Runtime.enable');await this.cdp.call('Network.enable');return {port,url};}
  navigate(url){if(!allowedBrowserUrl(url,this.allowedHosts))throw Error('browser URL is not allowlisted');return this.cdp.call('Page.navigate',{url});}
  evaluate(expression){return this.cdp.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});}
  click(selector){return this.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('selector not found');e.click();return true})()`);}
  type(selector,text){return this.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('selector not found');e.focus();e.value=${JSON.stringify(String(text))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);}
  async screenshot(path){const dst=assertInside(this.root,resolve(this.root,path)),r=await this.cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await mkdir(dirname(dst),{recursive:true});await writeFile(dst,Buffer.from(r.data,'base64'));return dst;}
  events(){return this.cdp?.eventLog||[];}
  async stop(){this.cdp?.close();try{this.child?.kill('SIGTERM');}catch{}}
}

function safeBranch(task){return `opentrue/${String(task).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||randomUUID().slice(0,8)}`;}
export class GitAgent{
  constructor(root){this.root=resolve(root);} status(){return run('git',['status','--short'],{cwd:this.root});} diff(){return run('git',['diff','--stat','HEAD'],{cwd:this.root});}
  async branch(task){const name=safeBranch(task),r=await run('git',['switch','-c',name],{cwd:this.root});if(r.code!==0)throw Error(r.stderr||'branch failed');return name;}
  async commit(message){let r=await run('git',['add','-A'],{cwd:this.root});if(r.code!==0)throw Error(r.stderr);r=await run('git',['commit','-m',String(message).slice(0,240)],{cwd:this.root});if(r.code!==0)throw Error(r.stderr);return r.stdout;}
  async push({approved=false}={}){if(!approved)throw Error('push requires explicit approval');const r=await run('git',['push','-u','origin','HEAD'],{cwd:this.root,timeoutMs:180000});if(r.code!==0)throw Error(r.stderr);return r.stdout;}
  async createPr({approved=false,title='',body=''}={}){if(!approved)throw Error('PR creation requires explicit approval');const args=['pr','create','--fill'];if(title)args.push('--title',title);if(body)args.push('--body',body);const r=await run('gh',args,{cwd:this.root,timeoutMs:120000});if(r.code!==0)throw Error(r.stderr);return r.stdout.trim();}
  checks(){return run('gh',['pr','checks','--watch','--fail-fast'],{cwd:this.root,timeoutMs:900000});}
  async merge({approved=false}={}){if(!approved)throw Error('merge requires explicit approval');const r=await run('gh',['pr','merge','--squash','--delete-branch'],{cwd:this.root,timeoutMs:180000});if(r.code!==0)throw Error(r.stderr);return r.stdout;}
  async worktree(task,base='HEAD'){const branch=safeBranch(task),dir=join(this.root,'.opentrue','worktrees',branch.split('/')[1]);await mkdir(dirname(dir),{recursive:true});const r=await run('git',['worktree','add','-b',branch,dir,base],{cwd:this.root});if(r.code!==0)throw Error(r.stderr);return {branch,dir};}
}

export class McpClient{
  constructor(command,args=[],cwd=process.cwd()){this.command=command;this.args=args;this.cwd=cwd;this.seq=0;this.pending=new Map();this.buffer='';this.child=null;}
  async start(){this.child=spawn(this.command,this.args,{cwd:this.cwd,stdio:['pipe','pipe','inherit'],shell:false});this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',d=>{this.buffer+=d;for(;;){const i=this.buffer.indexOf('\n');if(i<0)break;const line=this.buffer.slice(0,i).trim();this.buffer=this.buffer.slice(i+1);if(!line)continue;try{const m=JSON.parse(line);if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}catch{}}});await this.request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'OpenTrue Code',version:'0.2.0'}});this.notify('notifications/initialized',{});return this;}
  request(method,params={}){const id=++this.seq;return new Promise((resolveRequest,reject)=>{this.pending.set(id,{resolve:resolveRequest,reject});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
  notify(method,params={}){this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');}
  tools(){return this.request('tools/list',{});} callTool(name,args={}){return this.request('tools/call',{name,arguments:args});} stop(){this.child?.kill('SIGTERM');}
}

export class ModelRouter{
  constructor(models=null){this.models=models||String(process.env.OPENTRUE_MODELS||'qwen3-coder:30b,qwen2.5-coder:14b').split(',').filter(Boolean).map(model=>({model,endpoint:process.env.OLLAMA_URL||'http://127.0.0.1:11434'}));}
  async chat(messages,opts={}){const attempts=[];for(const m of this.models){const started=Date.now();try{const r=await fetch(`${m.endpoint.replace(/\/$/,'')}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:m.model,messages,stream:false,format:opts.json?'json':undefined,options:{temperature:opts.temperature??0.15,num_ctx:opts.numCtx||32768}})});if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();return {model:m.model,content:data.message?.content||'',durationMs:Date.now()-started,attempts:[...attempts,{model:m.model,ok:true}]};}catch(e){attempts.push({model:m.model,ok:false,error:String(e)});}}const err=Error('all local/open model routes failed');err.attempts=attempts;throw err;}
}

export class FleetScheduler{
  constructor(ttlMs=90000){this.ttlMs=ttlMs;this.workers=new Map();}
  heartbeat(worker){this.workers.set(worker.id,{...worker,lastSeen:Date.now()});}
  choose(requirements={}){const now=Date.now(),need=new Set(requirements.capabilities||[]);return [...this.workers.values()].filter(w=>now-w.lastSeen<=this.ttlMs&&[...need].every(x=>(w.capabilities||[]).includes(x))).sort((a,b)=>(a.queueDepth||0)-(b.queueDepth||0)||(b.freeVramMb||0)-(a.freeVramMb||0))[0]||null;}
  snapshot(){const now=Date.now();return [...this.workers.values()].map(w=>({...w,online:now-w.lastSeen<=this.ttlMs}));}
}

export async function bugbot(root,{base='HEAD~1'}={}){
  const d=await run('git',['diff','--unified=0',base,'HEAD'],{cwd:root}); const findings=[];
  const checks=[[/\b(api[_-]?key|token|secret|password)\s*[:=]\s*["'][^"']{8,}["']/i,'critical','Possible committed credential'],[/\beval\s*\(/,'high','Dynamic eval introduced'],[/shell\s*:\s*true/i,'high','Shell execution enabled'],[/dangerouslySetInnerHTML/,'medium','Raw HTML injection surface'],[/catch\s*\([^)]*\)\s*\{\s*\}/,'medium','Swallowed exception'],[/TODO.*security|FIXME.*security/i,'medium','Security TODO introduced']];
  let file=''; for(const line of d.stdout.split(/\r?\n/)){if(line.startsWith('+++ b/')){file=line.slice(6);continue;}if(!line.startsWith('+')||line.startsWith('+++'))continue;for(const [re,severity,message] of checks){if(re.test(line))findings.push({file,severity,message,line:line.slice(1,500)});}}
  return {ok:!findings.some(x=>x.severity==='critical'||x.severity==='high'),findings,diffHash:sha(d.stdout)};
}

export async function runSubagents(root,tasks,{concurrency=4,runner=null}={}){
  const git=new GitAgent(root),queue=[...tasks],results=[];
  const execute=runner || (async ({worktree,task}) => ({task,worktree,status:'READY'}));
  async function worker(){for(;;){const item=queue.shift();if(!item)return;const wt=await git.worktree(`${item.role||'agent'}-${item.task}`);try{results.push(await execute({worktree:wt.dir,branch:wt.branch,...item}));}catch(e){results.push({task:item.task,branch:wt.branch,error:String(e),status:'FAILED'});}}}
  await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),Math.max(1,tasks.length))},()=>worker())); return results;
}

export class RemoteControlClient{
  constructor(url,token){this.url=String(url).replace(/\/$/,'');this.token=token;}
  async request(path,method='GET',body=null){const r=await fetch(`${this.url}${path}`,{method,headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const text=await r.text();if(!r.ok)throw Error(`${method} ${path}: ${r.status} ${text}`);return text?JSON.parse(text):null;}
  submit(task,{projectId='default',target='local-bridge',args=[],requiresApproval=true,priority=0}={}){return this.request('/v1/jobs','POST',{task,projectId,target,args,requiresApproval,priority});}
  approve(id){return this.request(`/v1/jobs/${id}/approve`,'POST',{});} get(id){return this.request(`/v1/jobs/${id}`);}
}

function parseModelJson(value){return JSON.parse(String(value).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
export class AgentCore{
  constructor(root,{router=new ModelRouter()}={}){this.root=resolve(root);this.router=router;}
  async context(task){const idx=await buildRepoIndex(this.root),ctx=await loadContext(this.root);return {hits:searchIndex(idx,task,10),rules:ctx.rules.map(x=>x.text).join('\n\n').slice(0,16000),memory:ctx.memory,skills:ctx.skills.map(x=>({name:x.name,text:x.text.slice(0,5000)}))};}
  async run({mode='agent',task,approved=false,maxTurns=8}={}){
    mode=String(mode).toLowerCase(); if(!MODES.has(mode))throw Error('mode must be ask, plan, agent, or debug'); if(!String(task||'').trim())throw Error('task is required'); const context=await this.context(task);
    if(mode==='ask'||mode==='plan'){const system=mode==='ask'?'Answer from repository context. Never modify files or execute commands.':'Produce a concrete ordered implementation plan. Never modify files or execute commands.';return {mode,...await this.router.chat([{role:'system',content:`You are OpenTrue Code ${mode.toUpperCase()} mode. ${system} Respect repository rules.`},{role:'user',content:JSON.stringify({task,context})}],{temperature:0.1})};}
    const transcript=[],checkpoint=approved?await createCheckpoint(this.root,`agent:${String(task).slice(0,80)}`):null;
    for(let turn=0;turn<maxTurns;turn++){
      const system=`You are OpenTrue Code autonomous ${mode.toUpperCase()} mode. Return one JSON object only. Actions: search {query}; read {file}; apply_hunks {file,hunks:[{id,start,end,replacement}]}; run {profile:test|build|lint|typecheck|git-status}; git_status {}; finish {summary}. Writes need approval. Never request secrets or escape the workspace.`;
      const model=await this.router.chat([{role:'system',content:system},{role:'user',content:JSON.stringify({task,context,transcript:transcript.slice(-12)})}],{json:true,temperature:0.05});
      let action;try{action=parseModelJson(model.content);}catch{transcript.push({error:'model returned invalid JSON',raw:String(model.content).slice(0,1000)});continue;}
      if(action.action==='finish')return {mode,ok:true,summary:action.summary||'done',checkpoint,transcript,model:model.model};
      if(action.action==='search'){const idx=await buildRepoIndex(this.root);transcript.push({action,result:searchIndex(idx,action.query||task,12)});continue;}
      if(action.action==='read'){const p=assertInside(this.root,join(this.root,String(action.file||'')));transcript.push({action,result:(await readFile(p,'utf8')).slice(0,50000)});continue;}
      if(action.action==='git_status'){transcript.push({action,result:await new GitAgent(this.root).status()});continue;}
      if(action.action==='run'){transcript.push({action,result:await runProfile(this.root,action.profile)});continue;}
      if(action.action==='apply_hunks'){if(!approved)return {mode,ok:false,status:'WAITING_APPROVAL',proposed:action,checkpoint,transcript};const result=await applyHunks(this.root,action.file,action.hunks,action.hunks.map(h=>h.id),{approved:true});transcript.push({action,result:{file:result.file,hash:result.hash,hunks:result.hunks}});continue;}
      transcript.push({action,error:'unsupported action'});
    }
    return {mode,ok:false,status:'MAX_TURNS',checkpoint,transcript};
  }
}

export const PARITY_CAPABILITIES={
  agentModes:['ask','plan','agent','debug'],
  completion:['Tab inline completion','bounded local context','open-weight model routing'],
  repoIntelligence:['lexical-semantic index','dependency graph','symbol references','multi-repo context'],
  edit:['multi-file hunks','per-hunk acceptance','checkpoint','restore'],
  terminal:['allowlisted profiles','quality loop'],
  browser:['CDP navigate','click','type','evaluate','screenshot','console/network events'],
  git:['branch','diff','commit','push','PR','CI checks','merge','worktree'],
  context:['AGENTS.md','project rules','skills','persistent memory'],
  extensions:['MCP stdio'],
  agents:['subagents','worktrees','background control-plane jobs'],
  ops:['Bugbot','model failover','GPU fleet scheduler','deploy worker integration'],
  product:['unlimited chat without token balance','managed concurrency','queue priority','runtime and abuse controls']
};
