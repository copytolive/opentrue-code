#!/usr/bin/env node
import {writeFile} from "node:fs/promises";

const base=(process.env.OLLAMA_URL||"http://127.0.0.1:11434").replace(/\/$/,"");
const models=(process.env.OLLAMA_MODELS||process.argv.slice(2).join(",")||process.env.OLLAMA_MODEL||"qwen3-coder:30b")
  .split(",").map(x=>x.trim()).filter(Boolean);
const prompt=process.env.BENCHMARK_PROMPT||`You are editing a JavaScript service. Return only a concise unified-diff-style plan to add input validation, tests, and rollback safety. Do not use external APIs.`;
const timeoutMs=Math.max(10_000,Number(process.env.BENCHMARK_TIMEOUT_MS||180_000));
const outputPath=process.env.BENCHMARK_OUTPUT||"";
const requireAll=String(process.env.REQUIRE_ALL_MODELS||"").toLowerCase()==="true";

const nsToMs=n=>Number(n||0)/1_000_000;
const rate=(count,durationNs)=>durationNs?Number(count||0)/(Number(durationNs)/1_000_000_000):0;
const results=[];

for(const model of models){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const wallStart=performance.now();
  try{
    const response=await fetch(`${base}/api/generate`,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({model,prompt,stream:false,options:{temperature:0}}),
      signal:controller.signal
    });
    if(!response.ok)throw Error(`Ollama ${response.status}: ${await response.text()}`);
    const data=await response.json();
    const item={
      model,status:"PASS",wallMs:Math.round(performance.now()-wallStart),
      totalMs:Math.round(nsToMs(data.total_duration)),loadMs:Math.round(nsToMs(data.load_duration)),
      promptTokens:Number(data.prompt_eval_count||0),promptTokensPerSecond:Number(rate(data.prompt_eval_count,data.prompt_eval_duration).toFixed(2)),
      outputTokens:Number(data.eval_count||0),outputTokensPerSecond:Number(rate(data.eval_count,data.eval_duration).toFixed(2)),
      responseChars:String(data.response||"").length
    };
    results.push(item);
    console.log(JSON.stringify(item));
  }catch(error){
    const item={model,status:"FAIL",wallMs:Math.round(performance.now()-wallStart),error:error?.name==="AbortError"?"timeout":String(error)};
    results.push(item);
    console.error(JSON.stringify(item));
  }finally{clearTimeout(timer)}
}

const passed=results.filter(x=>x.status==="PASS");
const summary={
  generatedAt:new Date().toISOString(),ollamaUrl:base,models:results,
  recommended:passed.sort((a,b)=>b.outputTokensPerSecond-a.outputTokensPerSecond)[0]?.model||null
};
if(outputPath)await writeFile(outputPath,JSON.stringify(summary,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({summary:{passed:passed.length,total:results.length,recommended:summary.recommended}}));
if(!passed.length||(requireAll&&passed.length!==results.length))process.exit(1);
