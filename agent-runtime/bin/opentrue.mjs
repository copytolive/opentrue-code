#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {AgentCore,BrowserAgent,GitAgent,McpClient,ModelRouter,bugbot,buildRepoIndex,createCheckpoint,dependencyGraph,findSymbol,multiRepoContext,PARITY_CAPABILITIES,qualityLoop,remember,repoRoot,restoreCheckpoint,runProfile,runSubagents,searchIndex} from "../src/runtime.mjs";
import {applyPatchSet,streamPatchSet} from "../src/edit-engine.mjs";
import {runMultiRepo} from "../src/multi-repo.mjs";
import {semanticSearch} from "../src/semantic-index.mjs";
import {localInlineCompletion} from "../src/completion.mjs";

const argv=process.argv.slice(2);
const flags=new Set(argv.filter(x=>x.startsWith("--")));
const args=argv.filter(x=>!x.startsWith("--"));
const cmd=args.shift()||"help";
const cwd=resolve(process.env.OPENTRUE_WORKSPACE||process.cwd());
const json=x=>console.log(JSON.stringify(x,null,2));
const text=x=>console.log(typeof x==="string"?x:JSON.stringify(x,null,2));
const root=async()=>repoRoot(cwd);
const approved=()=>flags.has("--yes");

async function loadJson(path){return JSON.parse(await readFile(resolve(path),"utf8"))}
async function mcpConfig(rootPath,name){
  const cfg=await loadJson(resolve(rootPath,".opentrue/mcp.json"));
  const server=cfg.servers?.[name];if(!server?.command)throw Error(`MCP server not configured: ${name}`);
  return {command:String(server.command),args:Array.isArray(server.args)?server.args.map(String):[],cwd:resolve(rootPath,server.cwd||".")};
}

async function main(){
  if(cmd==="help"){
    console.log(`OpenTrue Code CLI

Usage:
  opentrue ask "question"
  opentrue plan "task"
  opentrue agent "task" [--yes]
  opentrue debug "bug" [--yes]
  opentrue verify [--yes]
  opentrue index
  opentrue search "query"
  opentrue semantic-search "query"
  opentrue complete FILE OFFSET
  opentrue symbol NAME
  opentrue deps
  opentrue checkpoint [label]
  opentrue restore ID --yes
  opentrue patch-preview patchset.json
  opentrue patch-apply patchset.json --yes
  opentrue run test|build|lint|typecheck|git-status
  opentrue browser URL [actions.json]
  opentrue mcp-tools SERVER
  opentrue mcp-call SERVER TOOL [json-args]
  opentrue subagents tasks.json --yes
  opentrue multi-agent manifest.json [--yes]
  opentrue branch "task"
  opentrue status
  opentrue diff
  opentrue commit "message"
  opentrue push --yes
  opentrue pr [title] --yes
  opentrue checks
  opentrue merge --yes
  opentrue worktree "task"
  opentrue bugbot [base]
  opentrue remember KEY VALUE
  opentrue multi-search "query" path1 path2...
  opentrue capabilities

Normal coding uses local/open-weight Ollama routes. Writes, parallel agents, destructive restores, and remote Git mutations require --yes.`);return;
  }
  const r=await root();
  if(["ask","plan","agent","debug"].includes(cmd)){
    const task=args.join(" ").trim();const result=await new AgentCore(r,{router:new ModelRouter()}).run({mode:cmd,task,approved:approved()});json(result);if(result.ok===false)process.exitCode=2;return;
  }
  if(cmd==="verify"){
    const core=new AgentCore(r,{router:new ModelRouter()});
    const result=await qualityLoop(r,["lint","typecheck","test","build"],approved()?async({round,failed})=>{
      const task=`Verification round ${round} failed in ${failed.profile}. Fix the repository so this check passes.\nSTDOUT:\n${failed.stdout.slice(-12000)}\nSTDERR:\n${failed.stderr.slice(-12000)}`;
      const fix=await core.run({mode:"debug",task,approved:true,maxTurns:10});if(!fix.ok)throw Error(`auto-debug failed: ${fix.status||"unknown"}`);
    }:null,3);
    json(result);if(!result.ok)process.exitCode=4;return;
  }
  if(cmd==="index"){const i=await buildRepoIndex(r);json({root:i.root,files:i.files.length,symbols:i.files.reduce((n,f)=>n+f.symbols.length,0),createdAt:i.createdAt});return;}
  if(cmd==="search"){const i=await buildRepoIndex(r);json(searchIndex(i,args.join(" "),20));return;}
  if(cmd==="semantic-search"){json(await semanticSearch(r,args.join(" "),{limit:20,fallback:true}));return;}
  if(cmd==="complete"){const file=args.shift(),offset=Number(args.shift());if(!file||!Number.isInteger(offset))throw Error("complete requires FILE and integer OFFSET");const text=await readFile(resolve(r,file),"utf8");json(localInlineCompletion(text,offset));return;}
  if(cmd==="symbol"){const i=await buildRepoIndex(r);json(findSymbol(i,args[0]||""));return;}
  if(cmd==="deps"){const i=await buildRepoIndex(r);json(dependencyGraph(i));return;}
  if(cmd==="checkpoint"){json(await createCheckpoint(r,args.join(" ")||"manual"));return;}
  if(cmd==="restore"){json(await restoreCheckpoint(r,args[0],{force:approved()}));return;}
  if(cmd==="patch-preview"||cmd==="patch-apply"){
    const path=args.shift();if(!path)throw Error("patchset.json is required");const patchset=await loadJson(path);
    if(cmd==="patch-preview"){for await(const event of streamPatchSet(r,patchset))process.stdout.write(JSON.stringify(event)+"\n");}
    else json(await applyPatchSet(r,patchset,{approved:approved()}));return;
  }
  if(cmd==="run"){const out=await runProfile(r,args[0],args.slice(1));process.stdout.write(out.stdout);process.stderr.write(out.stderr);process.exitCode=out.code;return;}
  if(cmd==="browser"){
    const url=args.shift()||"http://localhost:3000",actionsPath=args.shift();
    const hosts=String(process.env.OPENTRUE_BROWSER_HOSTS||"").split(",").map(x=>x.trim()).filter(Boolean);
    const browser=new BrowserAgent(r,{allowedHosts:hosts});
    try{
      await browser.start(url);const results=[];const actions=actionsPath?await loadJson(actionsPath):[{type:"evaluate",expression:"({title:document.title,url:location.href})"}];
      if(!Array.isArray(actions))throw Error("browser actions must be a JSON array");
      for(const action of actions){
        if(action.type==="navigate")results.push({action,result:await browser.navigate(action.url)});
        else if(action.type==="click")results.push({action,result:await browser.click(action.selector)});
        else if(action.type==="type")results.push({action,result:await browser.type(action.selector,action.text||"")});
        else if(action.type==="evaluate")results.push({action,result:await browser.evaluate(action.expression)});
        else if(action.type==="screenshot")results.push({action,result:await browser.screenshot(action.path||".opentrue/receipts/browser.png")});
        else throw Error(`unsupported browser action: ${action.type}`);
      }
      json({url,results,events:browser.events().slice(-200)});
    }finally{await browser.stop();}return;
  }
  if(cmd==="mcp-tools"||cmd==="mcp-call"){
    const name=args.shift();if(!name)throw Error("MCP server name required");const cfg=await mcpConfig(r,name),client=await new McpClient(cfg.command,cfg.args,cfg.cwd).start();
    try{if(cmd==="mcp-tools")json(await client.tools());else{const tool=args.shift();if(!tool)throw Error("MCP tool name required");const raw=args.join(" ")||"{}";json(await client.callTool(tool,JSON.parse(raw)));}}finally{client.stop();}return;
  }
  if(cmd==="subagents"){
    if(!approved())throw Error("subagents require --yes because each isolated worktree may be edited");const path=args.shift();if(!path)throw Error("tasks.json is required");const tasks=await loadJson(path);if(!Array.isArray(tasks)||!tasks.length)throw Error("tasks.json must be a non-empty array");
    const result=await runSubagents(r,tasks,{concurrency:Number(process.env.OPENTRUE_SUBAGENT_CONCURRENCY||4),runner:async({worktree,task,role})=>{const core=new AgentCore(worktree,{router:new ModelRouter()});const out=await core.run({mode:"agent",task:`Role: ${role||"coding agent"}. ${task}`,approved:true,maxTurns:10});return {role,task,worktree,status:out.ok?"SUCCEEDED":"FAILED",result:out};}});json(result);if(result.some(x=>x.status!=="SUCCEEDED"))process.exitCode=5;return;
  }
  if(cmd==="multi-agent"){
    const path=args.shift();if(!path)throw Error("manifest.json is required");const manifest=await loadJson(path);
    const result=await runMultiRepo(manifest,{approved:approved(),router:new ModelRouter(),concurrency:Number(process.env.OPENTRUE_MULTI_REPO_CONCURRENCY||3)});json(result);if(result.status==="FAILED")process.exitCode=6;return;
  }
  const git=new GitAgent(r);
  if(cmd==="branch"){text(await git.branch(args.join(" ")));return;}
  if(cmd==="status"){const x=await git.status();process.stdout.write(x.stdout);process.stderr.write(x.stderr);process.exitCode=x.code;return;}
  if(cmd==="diff"){const x=await git.diff();process.stdout.write(x.stdout);process.stderr.write(x.stderr);process.exitCode=x.code;return;}
  if(cmd==="commit"){text(await git.commit(args.join(" ")||"OpenTrue Code change"));return;}
  if(cmd==="push"){text(await git.push({approved:approved()}));return;}
  if(cmd==="pr"){text(await git.createPr({approved:approved(),title:args.join(" ")}));return;}
  if(cmd==="checks"){const x=await git.checks();process.stdout.write(x.stdout);process.stderr.write(x.stderr);process.exitCode=x.code;return;}
  if(cmd==="merge"){text(await git.merge({approved:approved()}));return;}
  if(cmd==="worktree"){json(await git.worktree(args.join(" ")||"task"));return;}
  if(cmd==="bugbot"){const x=await bugbot(r,{base:args[0]||"HEAD~1"});json(x);if(!x.ok)process.exitCode=3;return;}
  if(cmd==="remember"){json(await remember(r,args[0],args.slice(1).join(" ")));return;}
  if(cmd==="multi-search"){const query=args.shift()||"",roots=args.map(resolve);json(await multiRepoContext(roots,query));return;}
  if(cmd==="capabilities"){json(PARITY_CAPABILITIES);return;}
  throw Error(`unknown command: ${cmd}`);
}
main().catch(e=>{console.error(`OpenTrue: ${e.message||e}`);if(e.attempts)console.error(JSON.stringify(e.attempts,null,2));process.exitCode=1});
