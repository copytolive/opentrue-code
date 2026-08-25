const WORD=/[A-Za-z_$][\w$]*/g;

export function completionContext(text,offset,{maxPrefix=12000,maxSuffix=2000}={}){
  const source=String(text||""),at=Math.max(0,Math.min(source.length,Number(offset)||0));
  return {prefix:source.slice(Math.max(0,at-maxPrefix),at),suffix:source.slice(at,at+maxSuffix),offset:at};
}

export function localInlineCompletion(text,offset){
  const {prefix,suffix}=completionContext(text,offset),line=prefix.split(/\r?\n/).at(-1)||"";
  const partial=(line.match(/[A-Za-z_$][\w$]*$/)||[""])[0];
  if(partial.length<2)return null;
  const counts=new Map();
  for(const word of prefix.match(WORD)||[]){
    if(word!==partial&&word.startsWith(partial))counts.set(word,(counts.get(word)||0)+1);
  }
  const candidate=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0];
  if(!candidate||suffix.startsWith(candidate.slice(partial.length)))return null;
  return {insertText:candidate.slice(partial.length),candidate,source:"local-context"};
}

export function completionPrompt({path,text,offset,related=[]}){
  const context=completionContext(text,offset);
  return [
    "Complete code at <CURSOR>. Return only the text to insert. Never repeat the prefix or add Markdown fences.",
    `FILE ${String(path||"untitled")}`,
    `${context.prefix}<CURSOR>${context.suffix}`,
    ...related.slice(0,6).map(x=>`RELATED ${x.path}\n${String(x.text||"").slice(0,4000)}`)
  ].join("\n\n");
}
