import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source=await fs.readFile(new URL('../electron/ipc-guard.cjs',import.meta.url),'utf8');
const bootstrap=await fs.readFile(new URL('../electron/bootstrap.cjs',import.meta.url),'utf8');
const preload=await fs.readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8');
const smoke=await fs.readFile(new URL('../scripts/smoke-launch.mjs',import.meta.url),'utf8');
const agentUi=await fs.readFile(new URL('../src/agent-ui.js',import.meta.url),'utf8');

test('packaged shell IPC bootstraps only from BrowserWindow-owned exact shell frame',()=>{
  const ownerCheck=source.indexOf('!isBrowserWindowSender(webContents)');
  const frameCheck=source.indexOf('frameUrl !== normalizeFrameUrl(SHELL_ENTRY)');
  const trust=source.indexOf('if (!trustedSenderId) trustedSenderId = webContents.id');
  assert.ok(ownerCheck>=0,'BrowserWindow ownership validation missing');
  assert.ok(frameCheck>ownerCheck,'exact shell frame must be checked after BrowserWindow ownership');
  assert.ok(trust>frameCheck,'sender trust must occur only after ownership + exact frame checks');
  assert.match(source,/BrowserWindow\.fromWebContents\(webContents\)/);
  assert.match(source,/webContents\.id !== trustedSenderId/);
});

test('packaged READY requires a real renderer privileged IPC round-trip',()=>{
  assert.match(preload,/ipcRenderer\.invoke\('app:getState'\)/);
  assert.match(preload,/rwacode:ci-renderer-ready/);
  assert.match(bootstrap,/assertTrustedIpc\(event\)/);
  assert.match(bootstrap,/ipcRoundTrip:true/);
  assert.match(smoke,/ready\.ipcRoundTrip !== true/);
  assert.match(smoke,/RWACODE_SHELL_IPC_ROUNDTRIP=PASS/);
});

test('provider API selector is physically absent and manual review is visible',()=>{
  assert.doesNotMatch(agentUi,/agentProvider|ChatGPT API|Claude API|Gemini API|DeepSeek API/);
  assert.match(agentUi,/Paste ChangeSet/);
  assert.match(agentUi,/Review ChangeSet/);
  assert.match(agentUi,/NO_AI_API/);
});

test('IPC trust fix does not add provider automation paths',()=>{
  assert.doesNotMatch(source,/executeJavaScript|MutationObserver|click\(|keydown|cookie/i);
  assert.doesNotMatch(preload,/executeJavaScript|MutationObserver|auto.?send|readReply|sendFile/i);
});
