import {AgentCore,BrowserAgent,GitAgent,ModelRouter,bugbot,createCheckpoint,qualityLoop} from "./runtime.mjs";

export async function runAutopilot(root,manifest,{approvedWrites=false,approvedRemote=false,approvedMerge=false,router=new ModelRouter()}={}){
  if(!manifest?.task)throw Error("autopilot manifest requires task");
  if(!approvedWrites)return {status:"WAITING_APPROVAL",stage:"writes",task:manifest.task};
  const checkpoint=await createCheckpoint(root,`autopilot:${String(manifest.task).slice(0,80)}`),git=new GitAgent(root),timeline=[];
  let branch=null;
  if(manifest.git?.branch!==false){branch=await git.branch(manifest.git?.branchName||manifest.task);timeline.push({stage:"branch",status:"PASS",branch});}
  const core=new AgentCore(root,{router});
  const agent=await core.run({mode:manifest.mode==="debug"?"debug":"agent",task:manifest.task,approved:true,maxTurns:Number(manifest.maxTurns||12)});
  timeline.push({stage:"agent",status:agent.ok?"PASS":"FAIL",result:agent});if(!agent.ok)return {status:"FAILED",checkpoint,branch,timeline};
  const verify=await qualityLoop(root,manifest.verifyProfiles||["lint","typecheck","test","build"],async({round,failed})=>{
    const fix=await core.run({mode:"debug",task:`Autopilot verification round ${round} failed in ${failed.profile}. Fix it.\nSTDOUT:\n${failed.stdout.slice(-12000)}\nSTDERR:\n${failed.stderr.slice(-12000)}`,approved:true,maxTurns:10});
    if(!fix.ok)throw Error(`auto-debug failed: ${fix.status||"unknown"}`);
  },Number(manifest.verifyRounds||3));
  timeline.push({stage:"verify",status:verify.ok?"PASS":"FAIL",result:verify});if(!verify.ok)return {status:"FAILED",checkpoint,branch,timeline};
  if(manifest.browser?.url){
    const browser=new BrowserAgent(root,{allowedHosts:manifest.browser.allowedHosts||[]});const results=[];
    try{await browser.start(manifest.browser.url);for(const action of manifest.browser.actions||[]){if(action.type==="navigate")results.push(await browser.navigate(action.url));else if(action.type==="click")results.push(await browser.click(action.selector));else if(action.type==="type")results.push(await browser.type(action.selector,action.text||""));else if(action.type==="evaluate")results.push(await browser.evaluate(action.expression));else if(action.type==="screenshot")results.push(await browser.screenshot(action.path||".opentrue/receipts/autopilot.png"));else throw Error(`unsupported browser action: ${action.type}`);}timeline.push({stage:"browser",status:"PASS",results,events:browser.events().slice(-100)});}catch(e){timeline.push({stage:"browser",status:"FAIL",error:String(e)});return {status:"FAILED",checkpoint,branch,timeline};}finally{await browser.stop();}
  }
  const status=await git.status();
  if(status.stdout.trim()){
    const commitMessage=manifest.git?.commitMessage||`OpenTrue: ${String(manifest.task).slice(0,120)}`;const output=await git.commit(commitMessage);timeline.push({stage:"commit",status:"PASS",output});
    const review=await bugbot(root,{base:"HEAD~1"});timeline.push({stage:"bugbot",status:review.ok?"PASS":"FAIL",result:review});if(!review.ok)return {status:"FAILED",checkpoint,branch,timeline};
  }else timeline.push({stage:"commit",status:"SKIP",reason:"no workspace changes"});
  let pr=null;
  if(manifest.git?.push||manifest.git?.pr||manifest.git?.merge){if(!approvedRemote)return {status:"WAITING_APPROVAL",stage:"remote",checkpoint,branch,timeline};await git.push({approved:true});timeline.push({stage:"push",status:"PASS"});}
  if(manifest.git?.pr||manifest.git?.merge){pr=await git.createPr({approved:true,title:manifest.git?.prTitle||String(manifest.task).slice(0,120),body:manifest.git?.prBody||"Created by OpenTrue Autopilot after local verification."});timeline.push({stage:"pr",status:"PASS",pr});const checks=await git.checks();timeline.push({stage:"checks",status:checks.code===0?"PASS":"FAIL",checks});if(checks.code!==0)return {status:"FAILED",checkpoint,branch,pr,timeline};}
  if(manifest.git?.merge){if(!approvedMerge)return {status:"WAITING_APPROVAL",stage:"merge",checkpoint,branch,pr,timeline};await git.merge({approved:true});timeline.push({stage:"merge",status:"PASS"});}
  return {status:"SUCCEEDED",checkpoint,branch,pr,timeline};
}
