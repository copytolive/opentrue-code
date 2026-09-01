'use strict';

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const PROVIDERS = ['chatgpt','claude','gemini','deepseek'];
const OFFICIAL_HOSTS = { chatgpt:'api.openai.com', claude:'api.anthropic.com', gemini:'generativelanguage.googleapis.com', deepseek:'api.deepseek.com' };

function clean(value) { return String(value || '').trim(); }
function assertOfficialEndpoint(provider, endpoint) {
  let parsed; try { parsed = new URL(endpoint); } catch { throw new Error(`${provider} provider endpoint is invalid`); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== OFFICIAL_HOSTS[provider]) throw new Error(`${provider} provider endpoint must use official host ${OFFICIAL_HOSTS[provider]}`);
  return endpoint;
}
function rawConfig(env = process.env) {
  return {
    chatgpt:{ key:clean(env.OPENAI_API_KEY), model:clean(env.RWACODE_OPENAI_MODEL), endpoint:clean(env.RWACODE_OPENAI_ENDPOINT) || 'https://api.openai.com/v1/responses', mode:'official-openai-responses-api' },
    claude:{ key:clean(env.ANTHROPIC_API_KEY), model:clean(env.RWACODE_ANTHROPIC_MODEL), endpoint:clean(env.RWACODE_ANTHROPIC_ENDPOINT) || 'https://api.anthropic.com/v1/messages', mode:'official-anthropic-messages-api' },
    gemini:{ key:clean(env.GEMINI_API_KEY), model:clean(env.RWACODE_GEMINI_MODEL), endpoint:clean(env.RWACODE_GEMINI_ENDPOINT) || 'https://generativelanguage.googleapis.com/v1beta', mode:'official-gemini-generate-content-api' },
    deepseek:{ key:clean(env.DEEPSEEK_API_KEY), model:clean(env.RWACODE_DEEPSEEK_MODEL), endpoint:clean(env.RWACODE_DEEPSEEK_ENDPOINT) || 'https://api.deepseek.com/chat/completions', mode:'official-deepseek-chat-api' },
  };
}
function configFromEnv(env = process.env) {
  const result = rawConfig(env);
  for (const id of PROVIDERS) {
    try { result[id].endpoint = assertOfficialEndpoint(id, result[id].endpoint); }
    catch (error) { result[id].error = error.message; }
  }
  return result;
}
function availability(env = process.env) {
  const config = configFromEnv(env); const result = {};
  for (const id of PROVIDERS) {
    const item=config[id]; result[id]={ available:Boolean(!item.error && item.key && item.model), configuredKey:Boolean(item.key), configuredModel:Boolean(item.model), mode:item.error ? 'invalid-official-endpoint' : item.mode, error:item.error || null };
  }
  return result;
}
function extractJsonObject(text) {
  const raw=String(text || '').trim(); if (!raw) throw new Error('provider returned an empty response');
  const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fenced) return JSON.parse(fenced[1]);
  const start=raw.indexOf('{'); const end=raw.lastIndexOf('}'); if (start >= 0 && end > start) return JSON.parse(raw.slice(start,end+1));
  throw new Error('provider did not return a JSON ChangeSet');
}
async function readBoundedResponse(response) {
  const declared=Number(response.headers?.get?.('content-length') || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error('provider response exceeded safety limit');
  if (!response.body?.getReader) {
    const text=await response.text(); if (Buffer.byteLength(text,'utf8') > MAX_RESPONSE_BYTES) throw new Error('provider response exceeded safety limit'); return text;
  }
  const reader=response.body.getReader(); const chunks=[]; let total=0;
  while (true) {
    const { done, value }=await reader.read(); if (done) break;
    total += value.byteLength; if (total > MAX_RESPONSE_BYTES) { try { await reader.cancel(); } catch {} throw new Error('provider response exceeded safety limit'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks,total).toString('utf8');
}
async function fetchJson(url, options, { fetchImpl=global.fetch, timeoutMs=DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('provider fetch is unavailable in this runtime');
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(url,{...options,signal:controller.signal,redirect:'error'});
    const text=await readBoundedResponse(response);
    if (!response.ok) throw new Error(`provider HTTP ${response.status}: ${text.slice(0,600)}`);
    return JSON.parse(text);
  } catch (error) { if (error?.name === 'AbortError') throw new Error('provider request timed out'); throw error; }
  finally { clearTimeout(timer); }
}
function openAIText(json) { if (typeof json?.output_text === 'string') return json.output_text; const parts=[]; for (const item of json?.output || []) for (const content of item?.content || []) { if (typeof content?.text === 'string') parts.push(content.text); else if (typeof content?.value === 'string') parts.push(content.value); } return parts.join('\n'); }
function anthropicText(json) { return (json?.content || []).map((item)=>item?.text || '').filter(Boolean).join('\n'); }
function geminiText(json) { return (json?.candidates?.[0]?.content?.parts || []).map((part)=>part?.text || '').filter(Boolean).join('\n'); }
function deepSeekText(json) { return json?.choices?.[0]?.message?.content || ''; }
async function planChatGPT(config,prompt,options) { const json=await fetchJson(config.endpoint,{method:'POST',headers:{authorization:`Bearer ${config.key}`,'content-type':'application/json'},body:JSON.stringify({model:config.model,input:prompt})},options); return extractJsonObject(openAIText(json)); }
async function planClaude(config,prompt,options) { const json=await fetchJson(config.endpoint,{method:'POST',headers:{'x-api-key':config.key,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:config.model,max_tokens:16000,messages:[{role:'user',content:prompt}]})},options); return extractJsonObject(anthropicText(json)); }
async function planGemini(config,prompt,options) { const base=config.endpoint.replace(/\/$/,''); const url=`${base}/models/${encodeURIComponent(config.model)}:generateContent`; const json=await fetchJson(url,{method:'POST',headers:{'x-goog-api-key':config.key,'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}})},options); return extractJsonObject(geminiText(json)); }
async function planDeepSeek(config,prompt,options) { const json=await fetchJson(config.endpoint,{method:'POST',headers:{authorization:`Bearer ${config.key}`,'content-type':'application/json'},body:JSON.stringify({model:config.model,messages:[{role:'user',content:prompt}],response_format:{type:'json_object'}})},options); return extractJsonObject(deepSeekText(json)); }
function createProviderChatRunner({ env=process.env, fetchImpl=global.fetch, timeoutMs=DEFAULT_TIMEOUT_MS } = {}) {
  function status() { return availability(env); }
  async function plan(provider,prompt) {
    const id=clean(provider).toLowerCase(); if (!PROVIDERS.includes(id)) throw new Error(`unsupported chat provider: ${id || '(empty)'}`);
    const config=configFromEnv(env); const cfg=config[id];
    if (cfg.error) throw new Error(cfg.error);
    if (!cfg.key || !cfg.model) throw new Error(`${id} official automation requires its provider API credential and RWACode model environment setting; no API-key UI or browser-session fallback is used`);
    const options={fetchImpl,timeoutMs};
    if (id==='chatgpt') return planChatGPT(cfg,prompt,options);
    if (id==='claude') return planClaude(cfg,prompt,options);
    if (id==='gemini') return planGemini(cfg,prompt,options);
    return planDeepSeek(cfg,prompt,options);
  }
  return { plan, availability:status };
}
module.exports={ PROVIDERS,OFFICIAL_HOSTS,assertOfficialEndpoint,configFromEnv,availability,extractJsonObject,createProviderChatRunner,openAIText,anthropicText,geminiText,deepSeekText,readBoundedResponse,MAX_RESPONSE_BYTES };
