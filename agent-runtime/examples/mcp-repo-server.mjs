#!/usr/bin/env node
import {buildRepoIndex,run,searchIndex} from "../src/runtime.mjs";
import {semanticSearch} from "../src/semantic-index.mjs";

const root=process.cwd();
const reply=(id,result,error=null)=>process.stdout.write(JSON.stringify(error?{jsonrpc:"2.0",id,error:{code:-32000,message:String(error)}}:{jsonrpc:"2.0",id,result})+"\n");

async function handle(msg){
  if(msg.method==="initialize")return reply(msg.id,{protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"opentrue-repo",version:"0.2.0"}});
  if(msg.method==="notifications/initialized")return;
  if(msg.method==="tools/list")return reply(msg.id,{tools:[
    {name:"repo_status",description:"Read Git working-tree status without modifying it",inputSchema:{type:"object",properties:{},additionalProperties:false}},
    {name:"repo_search",description:"Search repository context using the deterministic offline index",inputSchema:{type:"object",properties:{query:{type:"string"},limit:{type:"integer",minimum:1,maximum:30}},required:["query"],additionalProperties:false}},
    {name:"repo_semantic_search",description:"Search using local Ollama embeddings, with offline hashed-search fallback",inputSchema:{type:"object",properties:{query:{type:"string"},limit:{type:"integer",minimum:1,maximum:30}},required:["query"],additionalProperties:false}}
  ]});
  if(msg.method==="tools/call"){
    const name=msg.params?.name,args=msg.params?.arguments||{};
    if(name==="repo_status"){
      const r=await run("git",["status","--short"],{cwd:root,timeoutMs:10000});
      return reply(msg.id,{content:[{type:"text",text:r.stdout||r.stderr||"clean"}],isError:r.code!==0});
    }
    if(name==="repo_search"){
      const query=String(args.query||"").trim();if(!query)throw Error("query is required");const index=await buildRepoIndex(root);const hits=searchIndex(index,query,Math.min(30,Math.max(1,Number(args.limit||10))));
      return reply(msg.id,{content:[{type:"text",text:JSON.stringify(hits)}],structuredContent:{mode:"offline-hash",hits}});
    }
    if(name==="repo_semantic_search"){
      const query=String(args.query||"").trim();if(!query)throw Error("query is required");const result=await semanticSearch(root,query,{limit:Math.min(30,Math.max(1,Number(args.limit||10))),fallback:true});
      return reply(msg.id,{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result});
    }
    throw Error(`unknown tool: ${name}`);
  }
  if(msg.id!=null)return reply(msg.id,null,`unsupported method: ${msg.method}`);
}

let buffer="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>{buffer+=chunk;for(;;){const at=buffer.indexOf("\n");if(at<0)break;const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);if(!line)continue;try{const msg=JSON.parse(line);Promise.resolve(handle(msg)).catch(e=>reply(msg.id,null,e.message));}catch(e){process.stderr.write(`invalid MCP message: ${e.message}\n`);}}});
