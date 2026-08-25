const SECRET_KEY=/(secret|password|privateKey|apiKey|token)$/i;

function containsSecret(value){
  if(Array.isArray(value))return value.some(containsSecret);
  if(!value||typeof value!=="object")return false;
  return Object.entries(value).some(([key,item])=>SECRET_KEY.test(key)||containsSecret(item));
}

export function validateTargetReceipt(value){
  const errors=[];
  if(!value||typeof value!=="object"||Array.isArray(value))return {valid:false,errors:["receipt must be an object"]};
  if(value.schemaVersion!==1)errors.push("schemaVersion must be 1");
  if(value.status!=="PASS")errors.push("status must be PASS");
  if(!value.target||typeof value.target!=="string")errors.push("target is required");
  if(!value.observedAt||Number.isNaN(Date.parse(value.observedAt)))errors.push("observedAt must be an ISO timestamp");
  if(!Array.isArray(value.evidence)||value.evidence.length===0)errors.push("evidence must be non-empty");
  if(containsSecret(value))errors.push("receipt contains a secret-like field");
  return {valid:errors.length===0,errors};
}
