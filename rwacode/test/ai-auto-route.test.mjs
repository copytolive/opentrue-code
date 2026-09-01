import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const agent=fs.readFileSync(new URL('../electron/agent-runner.cjs',import.meta.url),'utf8');
const agentUi=fs.readFileSync(new URL('../src/agent-ui.js',import.meta.url),'utf8');

test('provider WebContents are sandboxed Node-free native pages with no preload bridge',()=>{
  assert.match(main,/new WebContentsView/);
  assert.match(main,/sandbox:true/);
  assert.match(main,/contextIsolation:true/);
  assert.match(main,/nodeIntegration:false/);
  assert.doesNotMatch(main,/executeJavaScript|insertCSS|removeInsertedCSS/);
});

test('legacy provider DOM bridge is absent from production main/preload/UI',()=>{
  for(const source of [main,preload,html,renderer,agentUi]){
    assert.doesNotMatch(source,/ai:sendFile|ai:readReply|api\.ai|Add selected file to Chat|Review latest AI change|AI PROPOSAL|proposalPanel|aiBridgeBadge|MutationObserver|executeJavaScript/);
  }
});

test('free-form automation fails closed with NO_AI_API and no CLI/provider route',()=>{
  assert.match(agent,/mode:'NO_AI_API'/);
  assert.match(agent,/providerWeb:'MANUAL_ONLY'/);
  assert.match(agent,/providerApi:false/);
  assert.match(agent,/cliFallback:false/);
  assert.doesNotMatch(agent,/createProviderChatRunner|official-api|findExecutable|child_process|Codex CLI|Claude Code/);
  assert.doesNotMatch(agentUi,/agentProvider|ChatGPT API|Claude API|Gemini API|DeepSeek API|agentMode/);
  assert.match(agentUi,/Review ChangeSet/);
});

test('shell CSP blocks network and executable content from privileged renderer',()=>{
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/script-src 'self'/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/object-src 'none'/);
});
