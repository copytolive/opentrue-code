import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error(`packaged smoke launch requires macOS, got ${process.platform}`);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const executable = path.join(root, 'dist', 'mac', 'RWACode.app', 'Contents', 'MacOS', 'RWACode');
if (!fs.existsSync(executable)) throw new Error(`packaged Intel executable missing: ${executable}`);

const canonical = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
fs.mkdirSync(canonical, { recursive: true });
fs.writeFileSync(path.join(canonical, 'RWACODE_PACKAGED_LAUNCH_SMOKE.txt'), 'RWACODE_PACKAGED_LAUNCH_SMOKE\nVALUE=12345\n');

const marker = path.join(os.tmpdir(), `rwacode-ready-${crypto.randomUUID()}.json`);
const logPath = path.join(os.tmpdir(), `rwacode-launch-${crypto.randomUUID()}.log`);
const log = fs.openSync(logPath, 'w');
const child = spawn(executable, [], {
  cwd: root,
  env: { ...process.env, RWACODE_CI_SMOKE: '1', RWACODE_SMOKE_READY_FILE: marker },
  stdio: ['ignore', log, log]
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let exited = false;
let exitCode = null;
child.once('exit', (code) => { exited = true; exitCode = code; });

let ready = null;
for (let elapsed = 0; elapsed < 30000; elapsed += 250) {
  if (exited) break;
  if (fs.existsSync(marker)) {
    ready = JSON.parse(fs.readFileSync(marker, 'utf8'));
    break;
  }
  await sleep(250);
}

if (!ready) {
  const logs = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  try { child.kill('SIGKILL'); } catch {}
  throw new Error(`RWACode did not reach shell READY within 30s; exited=${exited} code=${exitCode}\n${logs}`);
}
if (ready.pid !== child.pid) throw new Error(`READY marker pid mismatch: ${ready.pid} != ${child.pid}`);
if (ready.version !== pkg.version) throw new Error(`READY marker version mismatch: ${ready.version} != ${pkg.version}`);
if (typeof ready.url !== 'string' || !ready.url.startsWith('file:') || !ready.url.includes('index.html')) throw new Error(`READY marker shell URL invalid: ${ready.url}`);

console.log(`RWACODE_SHELL_READY=PASS pid=${child.pid} version=${ready.version}`);

// Launch readiness is the gate. SIGTERM semantics are not equivalent to a user
// choosing Quit on macOS, so cleanup is deliberately non-assertive after READY.
// Real-Mac acceptance separately proves normal quit/restart persistence.
let cleanupMode = 'already-exited';
if (!exited) {
  cleanupMode = 'SIGTERM';
  child.kill('SIGTERM');
  for (let elapsed = 0; elapsed < 2000 && !exited; elapsed += 250) await sleep(250);
}
if (!exited) {
  cleanupMode = 'SIGKILL';
  child.kill('SIGKILL');
  for (let elapsed = 0; elapsed < 3000 && !exited; elapsed += 250) await sleep(250);
}
if (!exited) throw new Error('RWACode packaged smoke process could not be cleaned up after READY');

fs.closeSync(log);
fs.rmSync(marker, { force: true });
console.log(`RWACODE_PACKAGED_CLEANUP=${cleanupMode}`);
console.log('RWACODE_PACKAGED_LAUNCH_SMOKE=PASS');
