import {applyHunks,createCheckpoint,previewHunks,restoreCheckpoint} from "./runtime.mjs";

export async function previewPatchSet(root,patchset){
  if(!Array.isArray(patchset?.files)||!patchset.files.length)throw Error("patchset.files must be a non-empty array");
  const files=[];
  for(const change of patchset.files){
    if(!change.file||!Array.isArray(change.hunks))throw Error("each patchset file requires file and hunks[]");
    const accepted=Array.isArray(change.acceptedIds)?change.acceptedIds:change.hunks.map(h=>h.id);
    files.push(await previewHunks(root,change.file,change.hunks,accepted));
  }
  return {label:String(patchset.label||"patchset").slice(0,200),files};
}

export async function* streamPatchSet(root,patchset){
  const preview=await previewPatchSet(root,patchset);
  yield {type:"patchset.start",label:preview.label,files:preview.files.length};
  for(const file of preview.files){
    yield {type:"file.start",file:file.file,hash:file.hash,hunks:file.hunks};
    const before=file.original.split("\n"),after=file.proposed.split("\n"),max=Math.max(before.length,after.length);
    for(let i=0;i<max;i++){
      const a=before[i],b=after[i];if(a===b)continue;
      if(a!==undefined)yield {type:"diff.line",file:file.file,line:i+1,kind:"remove",text:a};
      if(b!==undefined)yield {type:"diff.line",file:file.file,line:i+1,kind:"add",text:b};
    }
    yield {type:"file.end",file:file.file,hash:file.hash};
  }
  yield {type:"patchset.end",label:preview.label};
}

export async function applyPatchSet(root,patchset,{approved=false}={}){
  if(!approved)throw Error("patchset apply requires explicit approval");
  const preview=await previewPatchSet(root,patchset),checkpoint=await createCheckpoint(root,`patchset:${preview.label}`),results=[];
  try{
    for(const change of patchset.files){
      const accepted=Array.isArray(change.acceptedIds)?change.acceptedIds:change.hunks.map(h=>h.id);
      const result=await applyHunks(root,change.file,change.hunks,accepted,{approved:true});results.push({file:result.file,hash:result.hash,hunks:result.hunks});
    }
    return {status:"APPLIED",checkpoint,results};
  }catch(e){
    await restoreCheckpoint(root,checkpoint.id,{force:true});
    throw Object.assign(Error(`patchset failed and was restored: ${e.message||e}`),{checkpoint});
  }
}
