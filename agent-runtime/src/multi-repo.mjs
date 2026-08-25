import {resolve} from "node:path";
import {AgentCore,ModelRouter,buildRepoIndex,createCheckpoint,searchIndex} from "./runtime.mjs";

function parseJson(text){return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""))}

export async function planMultiRepo(manifest,{router=new ModelRouter()}={}){
  if(!manifest?.objective||!Array.isArray(manifest.projects)||!manifest.projects.length)throw Error("manifest requires objective and projects[]");
  const projects=[];
  for(const item of manifest.projects){
    const root=resolve(item.root);const index=await buildRepoIndex(root);const hits=searchIndex(index,manifest.objective,8);
    projects.push({name:String(item.name||root),root,role:String(item.role||"coding"),hits:hits.map(h=>({path:h.path,score:h.score,symbols:h.symbols,snippet:h.snippet.slice(0,900)}))});
  }
  const prompt={objective:String(manifest.objective),projects:projects.map(p=>({name:p.name,role:p.role,hits:p.hits}))};
  const result=await router.chat([
    {role:"system",content:"You coordinate changes spanning multiple Git repositories. Return JSON only: {projects:[{name,task,dependsOn?:[name]}],summary}. Every listed project must have a concrete bounded task. Do not include secrets."},
    {role:"user",content:JSON.stringify(prompt)}
  ],{json:true,temperature:0.05});
  const plan=parseJson(result.content);if(!Array.isArray(plan.projects))throw Error("coordinator returned invalid projects plan");
  return {objective:manifest.objective,projects,plan,model:result.model};
}

export async function runMultiRepo(manifest,{approved=false,router=new ModelRouter(),concurrency=3}={}){
  const planned=await planMultiRepo(manifest,{router});
  if(!approved)return {...planned,status:"WAITING_APPROVAL"};
  const byName=new Map(planned.projects.map(p=>[p.name,p]));
  const checkpoints={};for(const project of planned.projects)checkpoints[project.name]=await createCheckpoint(project.root,`multi-repo:${String(manifest.objective).slice(0,80)}`);
  const queue=[...planned.plan.projects],results=[];
  async function worker(){
    for(;;){const step=queue.shift();if(!step)return;const project=byName.get(step.name);if(!project){results.push({name:step.name,status:"FAILED",error:"coordinator referenced unknown project"});continue}
      try{const core=new AgentCore(project.root,{router});const result=await core.run({mode:"agent",task:`Cross-repo objective: ${manifest.objective}\nYour repository: ${project.name}\nRole: ${project.role}\nTask: ${step.task}`,approved:true,maxTurns:12});results.push({name:project.name,root:project.root,status:result.ok?"SUCCEEDED":"FAILED",checkpoint:checkpoints[project.name],result});}
      catch(e){results.push({name:project.name,root:project.root,status:"FAILED",checkpoint:checkpoints[project.name],error:String(e)})}
    }
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),planned.plan.projects.length||1)},()=>worker()));
  return {...planned,status:results.every(x=>x.status==="SUCCEEDED")?"SUCCEEDED":"FAILED",checkpoints,results};
}
