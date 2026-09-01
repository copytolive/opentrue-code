import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repoRoot = path.resolve(root, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fail = (message) => { throw new Error(message); };

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) fail(`Node >=22 required; got ${process.versions.node}`);
if (!lock?.packages?.['']) fail('package-lock.json root package metadata missing');
if (lock.packages[''].version !== pkg.version) fail(`package-lock version ${lock.packages[''].version} != package version ${pkg.version}`);
if (lock.packages[''].name !== pkg.name) fail('package-lock package name mismatch');

const requiredPaths = [
  'electron/bootstrap.cjs',
  'electron/ipc-guard.cjs',
  'electron/main.cjs',
  'electron/preload.cjs',
  'electron/transaction-engine.cjs',
  'src/index.html',
  'src/agent-ui.js',
  'package-lock.json'
];
for (const relative of requiredPaths) {
  if (!fs.existsSync(path.join(root, relative))) fail(`required runtime path missing: ${relative}`);
}

const forbiddenPaths = [
  'electron/ai-bridge.cjs',
  'src/chat-first-ui.js',
  'src/chat-first-v2.css'
];
for (const relative of forbiddenPaths) {
  if (fs.existsSync(path.join(root, relative))) fail(`legacy runtime path must remain absent: ${relative}`);
}

const runtimeFiles = [
  'electron/bootstrap.cjs',
  'electron/main.cjs',
  'electron/preload.cjs',
  'src/index.html',
  'src/renderer.js',
  'src/browser-menu.js',
  'src/agent-ui.js'
];
const forbiddenRuntimePatterns = [
  ['ai:sendFile', /ai:sendFile/],
  ['ai:readReply', /ai:readReply/],
  ['createAiBridge', /createAiBridge/],
  ['provider composer selector bridge', /composerSelectors\s*\(/],
  ['provider send selector bridge', /sendSelectors\s*\(/],
  ['fake chat-first runtime load', /chat-first-(?:ui\.js|v2\.css)/]
];
for (const relative of runtimeFiles) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  for (const [label, pattern] of forbiddenRuntimePatterns) {
    if (pattern.test(text)) fail(`${label} found in production runtime: ${relative}`);
  }
}

const workflowPath = path.join(repoRoot, '.github', 'workflows', 'rwacode-desktop.yml');
if (!fs.existsSync(workflowPath)) fail('RWACode Desktop workflow missing');
const workflow = fs.readFileSync(workflowPath, 'utf8');
if (!/RWACODE_CANDIDATE_SHA/.test(workflow)) fail('workflow must freeze an explicit candidate SHA');
if (!/cancel-in-progress:\s*true/.test(workflow)) fail('workflow must cancel superseded candidate runs');
if (/RWACode-\d+\.\d+\.\d+/.test(workflow)) fail('workflow must not hard-code RWACode artifact version');

const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const expectedSha = String(process.env.RWACODE_CANDIDATE_SHA || '').trim();
if (expectedSha && actualSha !== expectedSha) fail(`candidate SHA mismatch: expected ${expectedSha}, got ${actualSha}`);

console.log(`RWACODE_PREFLIGHT=PASS version=${pkg.version} sha=${actualSha}`);
