import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source=await fs.readFile(new URL('../electron/ipc-guard.cjs',import.meta.url),'utf8');

test('packaged shell IPC can bootstrap trust only after exact preload and frame validation',()=>{
  const preloadCheck=source.indexOf('!hasTrustedShellPreload(webContents)');
  const frameCheck=source.indexOf('frameUrl !== normalizeFrameUrl(SHELL_ENTRY)');
  const bootstrap=source.indexOf('if (!trustedSenderId) trustedSenderId = webContents.id');
  assert.ok(preloadCheck>=0,'trusted preload validation missing');
  assert.ok(frameCheck>preloadCheck,'exact shell frame must be checked after preload identity');
  assert.ok(bootstrap>frameCheck,'sender bootstrap must occur only after preload + frame validation');
  assert.match(source,/webContents\.id !== trustedSenderId/);
});

test('IPC trust fallback does not add provider automation paths',()=>{
  assert.doesNotMatch(source,/executeJavaScript|MutationObserver|click\(|keydown|cookie/i);
});
