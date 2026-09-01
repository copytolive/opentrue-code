import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const preload=fs.readFileSync(new URL('../electron/preload.cjs',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('provider cosmetics/DOM bridge code is absent from production runtime',()=>{
  assert.doesNotMatch(main,/executeJavaScript|insertCSS|removeInsertedCSS|MutationObserver|prompt-textarea|send-button/);
  assert.doesNotMatch(preload,/executeJavaScript|providerCosmetics|cosmeticScript|ai:sendFile|ai:readReply/);
  assert.doesNotMatch(pkg.scripts.check,/ai-bridge\.cjs|chat-first-ui\.js|chat-first-v2\.css/);
});

test('native provider pages are never hidden rewritten inspected or restyled by RWACode',()=>{
  assert.doesNotMatch(main,/document\.querySelector|querySelectorAll\(|style\.display|style\.visibility|execCommand\(|dispatchEvent\(/);
  assert.match(main,/new WebContentsView/);
  assert.match(main,/sandbox:true/);
  assert.match(main,/nodeIntegration:false/);
});
