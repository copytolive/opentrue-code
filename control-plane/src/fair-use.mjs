export const PLANS={
 free:{concurrency:1,dailyJobs:30,maxRuntimeMs:120000,priority:0,unlimitedChat:false},
 daily:{concurrency:1,dailyJobs:null,maxRuntimeMs:300000,priority:1,unlimitedChat:true},
 personal:{concurrency:2,dailyJobs:null,maxRuntimeMs:600000,priority:1,unlimitedChat:true},
 pro:{concurrency:5,dailyJobs:null,maxRuntimeMs:900000,priority:2,unlimitedChat:true},
 team:{concurrency:12,dailyJobs:null,maxRuntimeMs:900000,priority:2,unlimitedChat:true},
 dedicated:{concurrency:64,dailyJobs:null,maxRuntimeMs:3600000,priority:3,unlimitedChat:true}
};
export class FairUse{
 constructor(clock=()=>Date.now()){this.clock=clock;this.usage=new Map()}
 key(user){return `${user}:${new Date(this.clock()).toISOString().slice(0,10)}`}
 check(user,planName="free"){const plan=PLANS[planName]||PLANS.free,u=this.usage.get(this.key(user))||{active:0,jobs:0};if(u.active>=plan.concurrency)return {allowed:false,reason:"concurrency"};if(plan.dailyJobs!==null&&u.jobs>=plan.dailyJobs)return {allowed:false,reason:"daily_jobs"};return {allowed:true,plan}}
 start(user,planName){const gate=this.check(user,planName);if(!gate.allowed)return gate;const key=this.key(user),u=this.usage.get(key)||{active:0,jobs:0};u.active++;u.jobs++;this.usage.set(key,u);return {allowed:true,usage:{...u},plan:gate.plan}}
 finish(user){const key=this.key(user),u=this.usage.get(key);if(u)u.active=Math.max(0,u.active-1)}
}
