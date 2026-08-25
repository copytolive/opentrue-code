import {access,mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {validateTargetReceipt} from "../agent-runtime/src/receipts.mjs";

const root=resolve(process.cwd());
const exists=async path=>{try{await access(resolve(root,path));return true}catch{return false}};
const gates=[
  {id:"P0_SECURITY_FOUNDATION",code:[".github/workflows/security.yml","editor/entrypoint.sh"],targets:[]},
  {id:"P1_AGENT_CORE",code:["agent-runtime/src/runtime.mjs","agent-runtime/test/runtime.test.mjs","agent-runtime/src/completion.mjs","agent-runtime/test/completion.test.mjs"],targets:[]},
  {id:"P1_REPO_INTELLIGENCE",code:["agent-runtime/src/runtime.mjs","agent-runtime/src/semantic-index.mjs"],targets:[]},
  {id:"P1_EDIT_ENGINE",code:["agent-runtime/src/edit-engine.mjs","agent-runtime/test/edit-engine.test.mjs"],targets:[]},
  {id:"P1_TERMINAL_AGENT",code:["agent-runtime/bin/opentrue.mjs"],targets:["receipts/target/terminal-auto-fix.json"]},
  {id:"P1_BROWSER_AGENT",code:["agent-runtime/src/runtime.mjs"],targets:["receipts/target/browser-agent.json"]},
  {id:"P1_GIT_AGENT",code:["agent-runtime/src/runtime.mjs"],targets:["receipts/target/github-e2e.json"]},
  {id:"P2_RULES_CONTEXT",code:["AGENTS.md",".opentrue/rules/default.md",".opentrue/skills/repository-review/SKILL.md"],targets:[]},
  {id:"P2_MCP_SKILLS",code:[".opentrue/mcp.json","agent-runtime/examples/mcp-repo-server.mjs","agent-runtime/test/mcp.test.mjs"],targets:[]},
  {id:"P2_SUBAGENTS",code:["agent-runtime/src/runtime.mjs"],targets:["receipts/target/subagents.json"]},
  {id:"P2_WORKTREES",code:["agent-runtime/src/runtime.mjs"],targets:[]},
  {id:"P2_BACKGROUND_AGENTS",code:["scripts/install-background-agent-linux.sh","local-bridge/src/bridge.mjs"],targets:["receipts/target/background-agent.json"]},
  {id:"P2_CLI",code:["agent-runtime/bin/opentrue.mjs","agent-runtime/package.json"],targets:[]},
  {id:"P2_BUGBOT",code:[".github/workflows/bugbot.yml"],targets:[]},
  {id:"P3_AUTOMATIONS",code:[".github/workflows/maintenance.yml",".github/dependabot.yml"],targets:[]},
  {id:"P3_WEB_MOBILE",code:["ui/app/agent/page.tsx"],targets:["receipts/target/web-mobile-agent.json"]},
  {id:"P3_MULTI_REPO",code:["agent-runtime/src/multi-repo.mjs","agent-runtime/test/multi-repo.test.mjs"],targets:["receipts/target/multi-repo.json"]},
  {id:"P3_DEPLOY_AGENT",code:["workers/deploy-worker.mjs","scripts/install-deploy-worker-linux.sh"],targets:["receipts/target/deploy-staging.json","receipts/target/deploy-production-rollback.json"]},
  {id:"P4_MODEL_ROUTER",code:["agent-runtime/src/runtime.mjs","workers/vast-worker.mjs","scripts/model-benchmark.mjs"],targets:["receipts/target/model-benchmark.json"]},
  {id:"P4_GPU_FLEET",code:["workers/vast-autoscaler.mjs","scripts/install-vast-autoscaler-linux.sh"],targets:["receipts/target/gpu-fleet.json"]},
  {id:"P4_TEAM_PLATFORM",code:["control-plane/src/auth.mjs","control-plane/src/postgres.mjs","control-plane/src/redis-queue.mjs","control-plane/src/fair-use.mjs","docs/BUSINESS_MODEL.md","docs/CURSOR_FEATURE_MATRIX.md"],targets:["receipts/target/billing-provider.json","receipts/target/monitoring-alerts.json"]},
  {id:"P4_EVIDENCE_GA",code:[".github/workflows/capacity.yml","scripts/backup-restore-drill.sh","SECURITY.md"],targets:["receipts/target/capacity-100.json","receipts/target/capacity-500.json","receipts/target/capacity-1000.json","receipts/target/dr-restore.json","receipts/target/red-team.json","receipts/target/domain-https.json"]}
];

const results=[];
for(const gate of gates){
  const codeChecks=await Promise.all(gate.code.map(async path=>({path,exists:await exists(path)})));
  const targetChecks=await Promise.all(gate.targets.map(async path=>{const present=await exists(path);if(!present)return {path,exists:false,valid:false,errors:["missing"]};try{const validation=validateTargetReceipt(JSON.parse(await readFile(resolve(root,path),"utf8")));return {path,exists:true,...validation}}catch(e){return {path,exists:true,valid:false,errors:[String(e)]}}}));
  const repoPass=codeChecks.every(x=>x.exists),targetPass=!gate.targets.length||targetChecks.every(x=>x.valid);
  results.push({...gate,code:codeChecks,targets:targetChecks,repoStatus:repoPass?"REPO_PASS":"REPO_FAIL",targetStatus:!gate.targets.length?"NOT_REQUIRED":targetPass?"TARGET_PASS":"NEEDS_TARGET_EVIDENCE"});
}
const report={schemaVersion:1,revision:process.env.GITHUB_SHA||null,generatedAt:new Date().toISOString(),repoPass:results.every(x=>x.repoStatus==="REPO_PASS"),targetPass:results.every(x=>x.targetStatus==="NOT_REQUIRED"||x.targetStatus==="TARGET_PASS"),gates:results};
await mkdir(resolve(root,"receipts"),{recursive:true});await writeFile(resolve(root,"receipts/cursor-parity.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(process.argv.includes("--require-repo")&&!report.repoPass)process.exitCode=2;
if(process.argv.includes("--require-target")&&!report.targetPass)process.exitCode=3;
