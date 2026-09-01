import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const shippedRoots=['electron','lib','control','src'];
const shippedFiles=['package.json'];
const textExtensions=new Set(['.cjs','.mjs','.js','.json','.html','.css','.md','.txt']);

// These literals intentionally live only in this non-shipped gate. Production files
// are not allowed to contain provider API endpoints, credential environment names,
// or provider SDK imports. Provider website names/URLs remain allowed because the
// product intentionally embeds their normal browser applications.
const forbidden=[
  ['OpenAI API hostname','api'+'.openai.com'],
  ['Anthropic API hostname','api'+'.anthropic.com'],
  ['Gemini API hostname','generativelanguage'+'.googleapis.com'],
  ['DeepSeek API hostname','api'+'.deepseek.com'],
  ['OpenAI API credential','OPENAI'+'_API_KEY'],
  ['Anthropic API credential','ANTHROPIC'+'_API_KEY'],
  ['Gemini API credential','GEMINI'+'_API_KEY'],
  ['DeepSeek API credential','DEEPSEEK'+'_API_KEY'],
  ['RWACode OpenAI model env','RWACODE_'+'OPENAI_MODEL'],
  ['RWACode Anthropic model env','RWACODE_'+'ANTHROPIC_MODEL'],
  ['RWACode Gemini model env','RWACODE_'+'GEMINI_MODEL'],
  ['RWACode DeepSeek model env','RWACODE_'+'DEEPSEEK_MODEL'],
  ['OpenAI SDK import',"require('"+'openai'+"')"],
  ['OpenAI SDK import','from '+"'"+'openai'+"'"],
  ['Anthropic SDK import','@anthropic-ai/'+'sdk'],
  ['Google generative SDK import','@google/'+'generative-ai'],
  ['Google GenAI SDK import','@google/'+'genai'],
];

function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const absolute=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(absolute));
    else if(textExtensions.has(path.extname(entry.name).toLowerCase()))out.push(absolute);
  }
  return out;
}

const targets=[];
for(const relative of shippedRoots){const absolute=path.join(root,relative);if(fs.existsSync(absolute))targets.push(...walk(absolute));}
for(const relative of shippedFiles){const absolute=path.join(root,relative);if(fs.existsSync(absolute))targets.push(absolute);}

const removedModule=path.join(root,'electron','provider-chat-runner.cjs');
if(fs.existsSync(removedModule))throw new Error('NO_AI_API gate failed: provider-chat-runner.cjs is still shipped');

const failures=[];
for(const file of targets){
  const text=fs.readFileSync(file,'utf8');
  for(const [label,needle] of forbidden)if(text.includes(needle))failures.push(`${path.relative(root,file)}: ${label}`);
}
if(failures.length)throw new Error(`NO_AI_API gate failed:\n${failures.join('\n')}`);

console.log(`RWACODE_NO_AI_API_STATIC=PASS files=${targets.length}`);
console.log('RWACODE_PROVIDER_API_RUNTIME=ABSENT');
console.log('RWACODE_PROVIDER_WEB=MANUAL_ONLY');
