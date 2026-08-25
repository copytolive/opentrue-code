import {mkdir,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {buildRepoIndex,searchIndex,walkRepo} from "./runtime.mjs";

const endpoint=()=>String(process.env.OLLAMA_URL||"http://127.0.0.1:11434").replace(/\/$/,"");
const model=()=>process.env.OPENTRUE_EMBED_MODEL||"embeddinggemma";
function cosine(a,b){let dot=0,aa=0,bb=0;for(let i=0;i<Math.min(a.length,b.length);i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}return dot/((Math.sqrt(aa)*Math.sqrt(bb))||1)}
function chunks(path,text,max=5000){const out=[];const lines=text.split(/\r?\n/);let buf=[],size=0,start=1;for(let i=0;i<lines.length;i++){const line=lines[i],n=line.length+1;if(buf.length&&size+n>max){out.push({path,start,end:i,text:buf.join("\n")});buf=[];size=0;start=i+1}buf.push(line);size+=n}if(buf.length)out.push({path,start,end:lines.length,text:buf.join("\n")});return out}
async function embed(input){
  const r=await fetch(`${endpoint()}/api/embed`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:model(),input,truncate:true})});
  if(!r.ok)throw Error(`Ollama embed ${r.status}: ${await r.text()}`);const data=await r.json();if(!Array.isArray(data.embeddings)||data.embeddings.length!==input.length)throw Error("invalid embedding response");return data.embeddings;
}

export async function buildSemanticIndex(root,{persist=true,batchSize=24}={}){
  root=resolve(root);const files=await walkRepo(root,{maxFiles:6000,maxBytes:500000}),items=files.flatMap(f=>chunks(f.path,f.text));const vectors=[];
  for(let i=0;i<items.length;i+=batchSize){const batch=items.slice(i,i+batchSize);vectors.push(...await embed(batch.map(x=>`${x.path}\n${x.text}`)))}
  const index={version:1,root,model:model(),endpoint:endpoint(),createdAt:new Date().toISOString(),items:items.map((x,i)=>({...x,vector:vectors[i]}))};
  if(persist){const dir=join(root,".opentrue","index");await mkdir(dir,{recursive:true});await writeFile(join(dir,"semantic.json"),JSON.stringify(index));}
  return index;
}
export async function semanticSearch(root,query,{limit=12,fallback=true}={}){
  try{const index=await buildSemanticIndex(root);const [q]=await embed([query]);return {mode:"embedding",model:index.model,hits:index.items.map(x=>({path:x.path,start:x.start,end:x.end,score:cosine(q,x.vector),snippet:x.text.slice(0,1600)})).sort((a,b)=>b.score-a.score).slice(0,limit)};}
  catch(e){if(!fallback)throw e;const index=await buildRepoIndex(root);return {mode:"offline-hash-fallback",error:String(e),hits:searchIndex(index,query,limit)};}
}
