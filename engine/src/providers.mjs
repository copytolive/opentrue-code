const ALIASES=new Map([
  ['chatgpt','openai'],['claude','anthropic'],['google','gemini'],
  ['lm-studio','lmstudio'],['openai_compatible','openai-compatible']
]);

function providerName(value){
  const raw=String(value||'ollama').trim().toLowerCase();
  return ALIASES.get(raw)||raw;
}
function localHost(host){return ['127.0.0.1','localhost','::1','[::1]'].includes(String(host).toLowerCase())}
function endpointFor(provider){
  if(provider==='ollama')return 'http://127.0.0.1:11434';
  if(provider==='lmstudio')return 'http://127.0.0.1:1234/v1';
  if(provider==='openai')return 'https://api.openai.com/v1';
  if(provider==='anthropic')return 'https://api.anthropic.com/v1';
  if(provider==='gemini')return 'https://generativelanguage.googleapis.com/v1beta';
  return 'http://127.0.0.1:1234/v1';
}
function checkedEndpoint(value,provider){
  const url=new URL(String(value||endpointFor(provider)));
  if(url.protocol!=='https:' && !(url.protocol==='http:'&&localHost(url.hostname))){
    throw Error('model endpoint must use HTTPS unless it is loopback');
  }
  return url.toString().replace(/\/$/,'');
}
function urlJoin(base,path){return `${String(base).replace(/\/$/,'')}/${String(path).replace(/^\//,'')}`}
async function jsonResponse(r){
  if(!r.ok)throw Error(`HTTP ${r.status}`);
  return await r.json();
}
function systemText(messages){
  return messages.filter(x=>x.role==='system').map(x=>String(x.content||'')).join('\n\n');
}
function nonSystem(messages){
  return messages.filter(x=>x.role!=='system').map(x=>({
    role:x.role==='assistant'?'assistant':'user',
    content:String(x.content||'')
  }));
}
function geminiContents(messages){
  return messages.filter(x=>x.role!=='system').map(x=>({
    role:x.role==='assistant'?'model':'user',
    parts:[{text:String(x.content||'')}]
  }));
}

export function providerDefaults(provider){
  provider=providerName(provider);
  return {provider,endpoint:endpointFor(provider)};
}

export class ProviderRouter{
  constructor(config={}){
    const provider=providerName(config.provider);
    const rawModels=Array.isArray(config.fallbacks)&&config.fallbacks.length
      ? [{...config,provider},...config.fallbacks]
      : [{...config,provider}];
    this.routes=rawModels.map(route=>{
      const p=providerName(route.provider||provider);
      return {
        provider:p,
        model:String(route.model||config.model||defaultModel(p)),
        endpoint:checkedEndpoint(route.endpoint||config.endpoint,p),
        apiKey:String(route.apiKey||config.apiKey||'')
      };
    });
  }
  async chat(messages,opts={}){
    const attempts=[];
    for(const route of this.routes){
      const started=Date.now();
      try{
        const content=await callProvider(route,messages,opts);
        return {
          provider:route.provider,
          model:route.model,
          content,
          durationMs:Date.now()-started,
          attempts:[...attempts,{provider:route.provider,model:route.model,ok:true}]
        };
      }catch(e){
        attempts.push({
          provider:route.provider,
          model:route.model,
          ok:false,
          error:String(e?.message||e).slice(0,240)
        });
      }
    }
    const err=Error('all configured model routes failed');
    err.attempts=attempts;
    throw err;
  }
}

function defaultModel(provider){
  if(provider==='ollama')return 'qwen3-coder:30b';
  if(provider==='lmstudio'||provider==='openai-compatible')return 'local-model';
  if(provider==='anthropic')return 'claude-sonnet-5';
  if(provider==='gemini')return 'gemini-3.7-flash';
  return 'gpt-5.6-sol';
}

async function callProvider(route,messages,opts){
  if(route.provider==='ollama')return callOllama(route,messages,opts);
  if(route.provider==='openai')return callOpenAIResponses(route,messages,opts);
  if(route.provider==='openai-compatible'||route.provider==='lmstudio')return callOpenAICompatible(route,messages,opts);
  if(route.provider==='anthropic')return callAnthropic(route,messages,opts);
  if(route.provider==='gemini')return callGemini(route,messages,opts);
  throw Error(`unsupported provider: ${route.provider}`);
}
async function callOllama(route,messages,opts){
  const r=await fetch(urlJoin(route.endpoint,'api/chat'),{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      model:route.model,messages,stream:false,
      format:opts.json?'json':undefined,
      options:{temperature:opts.temperature??0.15,num_ctx:opts.numCtx||32768}
    })
  });
  const data=await jsonResponse(r);
  return String(data.message?.content||'');
}
function openAIOutputText(data){
  if(typeof data.output_text==='string')return data.output_text;
  const out=[];
  for(const item of data.output||[]){
    for(const part of item.content||[]){
      if(part.type==='output_text'&&part.text)out.push(part.text);
    }
  }
  return out.join('\n');
}
async function callOpenAIResponses(route,messages,opts){
  if(!route.apiKey)throw Error('API key is required');
  const input=messages.map(x=>({role:x.role,content:String(x.content||'')}));
  if(opts.json)input.unshift({role:'system',content:'Return one valid JSON object only.'});
  const data=await jsonResponse(await fetch(urlJoin(route.endpoint,'responses'),{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${route.apiKey}`},
    body:JSON.stringify({model:route.model,input})
  }));
  return String(openAIOutputText(data));
}
async function callOpenAICompatible(route,messages,opts){
  const headers={'content-type':'application/json'};
  if(route.apiKey)headers.authorization=`Bearer ${route.apiKey}`;
  const outbound=opts.json
    ? [{role:'system',content:'Return one valid JSON object only.'},...messages]
    : messages;
  const data=await jsonResponse(await fetch(urlJoin(route.endpoint,'chat/completions'),{
    method:'POST',headers,body:JSON.stringify({model:route.model,messages:outbound,stream:false})
  }));
  return String(data.choices?.[0]?.message?.content||'');
}
async function callAnthropic(route,messages,opts){
  if(!route.apiKey)throw Error('API key is required');
  let system=systemText(messages);
  if(opts.json)system=`${system}\n\nReturn one valid JSON object only.`.trim();
  const data=await jsonResponse(await fetch(urlJoin(route.endpoint,'messages'),{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key':route.apiKey,
      'anthropic-version':'2023-06-01'
    },
    body:JSON.stringify({
      model:route.model,max_tokens:Number(opts.maxTokens||8192),
      system, messages:nonSystem(messages)
    })
  }));
  return String((data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n'));
}
async function callGemini(route,messages,opts){
  if(!route.apiKey)throw Error('API key is required');
  const system=systemText(messages);
  const target=new URL(urlJoin(route.endpoint,`models/${encodeURIComponent(route.model)}:generateContent`));
  target.searchParams.set('key',route.apiKey);
  const body={
    contents:geminiContents(messages),
    generationConfig:{
      temperature:opts.temperature??0.15,
      ...(opts.json?{responseMimeType:'application/json'}:{})
    }
  };
  if(system)body.systemInstruction={parts:[{text:system}]};
  const data=await jsonResponse(await fetch(target,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  }));
  return String(data.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'');
}
