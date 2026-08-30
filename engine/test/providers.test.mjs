import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {ProviderRouter} from '../src/providers.mjs';

async function mock(handler){
  const server=createServer(handler);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {port}=server.address();
  return {url:`http://127.0.0.1:${port}`,close:()=>new Promise(r=>server.close(r))};
}
async function read(req){const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString('utf8'))}

test('ollama route returns assistant content',async()=>{
  const m=await mock(async(req,res)=>{
    assert.equal(req.url,'/api/chat');
    const b=await read(req);assert.equal(b.model,'qwen-test');
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({message:{content:'ollama-ok'}}));
  });
  try{
    const out=await new ProviderRouter({provider:'ollama',model:'qwen-test',endpoint:m.url}).chat([{role:'user',content:'hi'}]);
    assert.equal(out.content,'ollama-ok');assert.equal(out.provider,'ollama');
  }finally{await m.close()}
});

test('OpenAI Responses adapter sends bearer and parses output_text',async()=>{
  const m=await mock(async(req,res)=>{
    assert.equal(req.url,'/v1/responses');
    assert.equal(req.headers.authorization,'Bearer test-key');
    const b=await read(req);assert.equal(b.model,'gpt-test');assert.ok(Array.isArray(b.input));
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({output:[{content:[{type:'output_text',text:'openai-ok'}]}]}));
  });
  try{
    const out=await new ProviderRouter({provider:'openai',model:'gpt-test',endpoint:`${m.url}/v1`,apiKey:'test-key'})
      .chat([{role:'system',content:'system'},{role:'user',content:'hi'}],{json:true});
    assert.equal(out.content,'openai-ok');
  }finally{await m.close()}
});

test('OpenAI-compatible route uses chat completions without provider-specific JSON fields',async()=>{
  const m=await mock(async(req,res)=>{
    assert.equal(req.url,'/v1/chat/completions');
    assert.equal(req.headers.authorization,'Bearer test-key');
    const b=await read(req);assert.equal(b.model,'x');assert.ok(Array.isArray(b.messages));assert.equal(b.response_format,undefined);
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}]}));
  });
  try{
    const out=await new ProviderRouter({provider:'openai-compatible',model:'x',endpoint:`${m.url}/v1`,apiKey:'test-key'})
      .chat([{role:'system',content:'json'},{role:'user',content:'hi'}],{json:true});
    assert.equal(out.content,'{"ok":true}');
  }finally{await m.close()}
});

test('Anthropic adapter maps system and messages',async()=>{
  const m=await mock(async(req,res)=>{
    assert.equal(req.url,'/v1/messages');
    assert.equal(req.headers['x-api-key'],'anthropic-key');
    const b=await read(req);assert.match(b.system,/system/);assert.equal(b.messages[0].role,'user');
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({content:[{type:'text',text:'claude-ok'}]}));
  });
  try{
    const out=await new ProviderRouter({provider:'anthropic',model:'claude-test',endpoint:`${m.url}/v1`,apiKey:'anthropic-key'})
      .chat([{role:'system',content:'system'},{role:'user',content:'hi'}]);
    assert.equal(out.content,'claude-ok');
  }finally{await m.close()}
});

test('Gemini adapter maps system instruction and model role',async()=>{
  const m=await mock(async(req,res)=>{
    assert.match(req.url,/\/v1beta\/models\/gemini-test:generateContent\?key=gem-key/);
    const b=await read(req);assert.equal(b.systemInstruction.parts[0].text,'system');
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({candidates:[{content:{parts:[{text:'gemini-ok'}]}}]}));
  });
  try{
    const out=await new ProviderRouter({provider:'gemini',model:'gemini-test',endpoint:`${m.url}/v1beta`,apiKey:'gem-key'})
      .chat([{role:'system',content:'system'},{role:'user',content:'hi'}]);
    assert.equal(out.content,'gemini-ok');
  }finally{await m.close()}
});

test('non-loopback HTTP endpoint is rejected',()=>{
  assert.throws(()=>new ProviderRouter({provider:'openai-compatible',model:'x',endpoint:'http://example.com/v1'}),/HTTPS/);
});
