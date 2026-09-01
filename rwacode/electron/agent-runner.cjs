'use strict';

const NO_AI_API_ERROR='NO_AI_API: free-form AI planning is disabled in RWACode production. Use ChatGPT, Claude, Gemini, or DeepSeek as a native/manual browser page, then explicitly copy a ChangeSet JSON into RWACode Review ChangeSet. No provider API, API key, browser scraping, cookie/session reuse, CLI fallback, or automated Send is permitted.';

function escapeRegex(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function parseLiteralTask(task){
  const source=String(task||'').trim();
  let match=source.match(/^(?:(?:ubah|ganti|set)\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s+(?:menjadi|ke)\s+(.+)$/i);
  if(!match)match=source.match(/^(?:change|set)\s+([A-Za-z_][A-Za-z0-9_.-]*)\s+(?:to|=)\s+(.+)$/i);
  if(!match)return null;
  let value=match[2].trim();
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  if(!value||value.includes('\n')||value.includes('\r'))return null;
  return{key:match[1],value};
}

async function deterministicLiteralPlan(task,projectContext,adapter){
  const parsed=parseLiteralTask(task);
  if(!parsed||typeof projectContext.searchText!=='function')return null;
  const candidates=await projectContext.searchText(`${parsed.key}=`,{limit:80});
  const matches=[];
  const key=escapeRegex(parsed.key);
  const assignment=new RegExp(`(^|\\n)([\\t ]*${key}[\\t ]*=[\\t ]*)([^\\r\\n]*)`,'g');
  for(const candidate of candidates){
    const file=await adapter.readText(candidate.path).catch(()=>null);
    if(!file)continue;
    const found=[...file.content.matchAll(assignment)];
    if(found.length===1)matches.push({file,match:found[0]});
  }
  if(matches.length!==1)return null;
  const{file,match}=matches[0];
  const start=match.index+match[1].length;
  const prefix=match[2];
  const oldValue=match[3];
  if(oldValue===parsed.value)return{runner:'local-literal',changeSet:{version:1,summary:`${parsed.key} is already ${parsed.value}`,operations:[]},evidence:{path:file.path,key:parsed.key,before:oldValue,after:parsed.value,noChange:true}};
  const replacement=`${prefix}${parsed.value}`;
  const content=file.content.slice(0,start)+replacement+file.content.slice(start+prefix.length+oldValue.length);
  return{runner:'local-literal',changeSet:{version:1,summary:`Set ${parsed.key} to ${parsed.value}`,operations:[{type:'MODIFY',path:file.path,content}]},evidence:{path:file.path,key:parsed.key,before:oldValue,after:parsed.value}};
}

function createAgentRunner({root,projectContext,adapter}={}){
  if(!root||!projectContext||!adapter)throw new Error('AgentRunner requires root, projectContext, and adapter');
  function availability(){
    return{
      localLiteral:{available:true,mode:'deterministic-safe-replacement'},
      manualChangeSet:{available:true,mode:'user-supplied-review'},
      routing:{mode:'NO_AI_API',providerWeb:'MANUAL_ONLY',providerApi:false,cliFallback:false,providerAutomation:false},
    };
  }
  async function plan(task){
    const cleanTask=String(task||'').trim();
    if(!cleanTask)throw new Error('agent task is empty');
    const literal=await deterministicLiteralPlan(cleanTask,projectContext,adapter);
    if(literal)return literal;
    throw new Error(NO_AI_API_ERROR);
  }
  return{plan,availability,allowlist:[]};
}

module.exports={createAgentRunner,parseLiteralTask,deterministicLiteralPlan,NO_AI_API_ERROR};
