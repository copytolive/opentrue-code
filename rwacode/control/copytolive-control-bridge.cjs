'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createPathGuard } = require('../lib/path-guard.cjs');
const { createLocalWorkspaceAdapter } = require('../electron/workspace-adapter.cjs');
const { createTransactionEngine } = require('../electron/transaction-engine.cjs');

const PROFILE = 'COPYTOLIVE_LIVE_CONTROL_V1';
const EXPECTED_WORKSPACE_ROOT = '/Users/Shared/WorkspaceBersama/copytolive.com';
const CONTROL_RUNTIME_ROOT = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online/07_RUNTIME/copytolive-control-bridge';
const CONFIG_PATH = path.join(CONTROL_RUNTIME_ROOT, 'config.json');
const TRANSPORT_REPO = path.join(CONTROL_RUNTIME_ROOT, 'repo');
const TRANSPORT_BRANCH = 'copytolive-live-control';
const TRANSPORT_REMOTE = 'https://github.com/copytolive/archive-bridge-private.git';
const MAX_READ_BYTES = 200 * 1024;
const MAX_SEARCH_FILES = 3000;
const MAX_SEARCH_RESULTS = 80;
const MAX_OUTPUT_BYTES = 128 * 1024;
const POLL_MS = 2500;
const DEPLOY_CONFIRM = 'DEPLOY_COPYTOLIVE_PRODUCTION';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.cache', '.next', 'target', 'vendor']);
const DENIED_PARTS = new Set(['.ssh', '.aws', '.gnupg', 'Local Storage', 'Session Storage']);
const DENIED_BASENAME = /^(?:\.env(?:\..*)?|credentials(?:\.json)?|secret(?:s)?(?:\..*)?|id_ed25519|id_rsa|cookies?(?:\.sqlite)?|\.npmrc)$/i;
const DENIED_EXT = /\.(?:pem|key|p12|pfx)$/i;

function digest(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}
function normalizeRelative(value, { allowDot = false } = {}) {
  const raw = String(value == null ? (allowDot ? '.' : '') : value).trim().replace(/\\/g, '/');
  if (allowDot && (!raw || raw === '.')) return '.';
  if (!raw || raw.startsWith('/') || raw.split('/').includes('..')) throw new Error('invalid workspace-relative path');
  return raw.replace(/^\.\//, '').replace(/\/$/, '') || (allowDot ? '.' : '');
}
function pathIsSensitive(relativePath) {
  const rel = normalizeRelative(relativePath, { allowDot:true });
  if (rel === '.') return false;
  const parts = rel.split('/');
  if (parts.some((part) => DENIED_PARTS.has(part))) return true;
  const base = parts[parts.length - 1];
  return DENIED_BASENAME.test(base) || DENIED_EXT.test(base);
}
function assertWorkspacePathAllowed(relativePath, { allowDot = false, directWrite = false } = {}) {
  const rel = normalizeRelative(relativePath, { allowDot });
  if (pathIsSensitive(rel)) throw new Error('sensitive credential path is not available through this bridge');
  const parts = rel === '.' ? [] : rel.split('/');
  if (parts.includes('.git')) throw new Error('.git is not available through workspace control');
  if (directWrite && (parts.includes('node_modules') || parts.includes('dist') || parts.includes('build'))) {
    throw new Error('generated/dependency paths cannot be modified directly; edit source and use the fixed build action');
  }
  return rel;
}
function validateRequestId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(id)) throw new Error('invalid request id');
  return id;
}
function publicError(error) {
  const message = String(error?.message || error || 'unknown error').replace(/[\r\n]+/g, ' ').slice(0, 2000);
  return { name:String(error?.name || 'Error').slice(0, 80), message };
}

function runProcess(executable, args, { cwd = undefined, timeoutMs = 120000, env = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env:env || process.env, stdio:['ignore', 'pipe', 'pipe'], shell:false });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    const append = (current, chunk) => {
      const merged = Buffer.concat([current, Buffer.from(chunk)]);
      return merged.length > MAX_OUTPUT_BYTES ? merged.subarray(merged.length - MAX_OUTPUT_BYTES) : merged;
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { child.kill('SIGTERM'); }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const result = { code, signal, stdout:stdout.toString('utf8'), stderr:stderr.toString('utf8') };
      if (code === 0) resolve(result);
      else {
        const error = new Error(`process failed (${path.basename(executable)} exit ${code == null ? signal : code}): ${result.stderr || result.stdout}`.slice(0, 4000));
        error.result = result;
        reject(error);
      }
    });
  });
}

async function existingRegularFile(filePath) {
  try {
    const stat = await fsp.lstat(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch { return false; }
}
async function existingDirectory(filePath) {
  try {
    const stat = await fsp.lstat(filePath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch { return false; }
}
async function resolveNpm(config = {}) {
  const candidates = [
    config.npm_path,
    '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online/07_RUNTIME/agent-canvas-desktop/node/node-v22.23.0-darwin-x64/bin/npm',
    '/usr/local/bin/npm',
    '/opt/homebrew/bin/npm',
    '/usr/bin/npm',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    if (await existingRegularFile(candidate)) return candidate;
  }
  throw new Error('npm executable not found in the fixed allowlist; set npm_path in the local bridge config');
}
function validateDeployConfig(config) {
  const deploy = config?.deploy || {};
  if (deploy.enabled !== true) throw new Error('production deploy is disabled in local bridge config');
  const server = String(deploy.server || '').trim();
  const remoteRoot = String(deploy.remote_root || '').trim();
  const identityFile = String(deploy.identity_file || '').trim();
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(server)) throw new Error('invalid deploy server in local config');
  if (remoteRoot !== '/var/www/copytolive') throw new Error('remote_root must be exactly /var/www/copytolive');
  if (!path.isAbsolute(identityFile)) throw new Error('identity_file must be an absolute local path');
  return { server, remoteRoot, identityFile, publicUrls:Array.isArray(deploy.public_urls) ? deploy.public_urls.slice(0, 4) : [] };
}

function createCopyToLiveDeployer({ workspaceRoot, config, runner = runProcess } = {}) {
  const root = path.resolve(workspaceRoot || '');
  if (root !== EXPECTED_WORKSPACE_ROOT) throw new Error('CopyToLive deployer is locked to the exact CopyToLive workspace root');
  let lastBuild = null;

  async function verifyLocalDist() {
    const dist = path.join(root, 'frontend', 'dist');
    const index = path.join(dist, 'index.html');
    const compounding = path.join(dist, 'compounding_live.html');
    const assets = path.join(dist, 'assets');
    if (!(await existingRegularFile(index))) throw new Error('frontend/dist/index.html is missing after build');
    if (!(await existingRegularFile(compounding))) throw new Error('frontend/dist/compounding_live.html is missing after build');
    if (!(await existingDirectory(assets))) throw new Error('frontend/dist/assets is missing after build');
    const [indexBytes, compoundingBytes] = await Promise.all([fsp.readFile(index), fsp.readFile(compounding)]);
    return {
      dist, index, compounding, assets,
      sha256:{ index:digest(indexBytes), compounding:digest(compoundingBytes) },
      sizes:{ index:indexBytes.length, compounding:compoundingBytes.length },
    };
  }

  async function build() {
    const npm = await resolveNpm(config);
    const frontend = path.join(root, 'frontend');
    if (!(await existingDirectory(frontend))) throw new Error('frontend directory is missing');
    const startedAt = new Date().toISOString();
    const result = await runner(npm, ['run', 'build'], { cwd:frontend, timeoutMs:15 * 60 * 1000 });
    const dist = await verifyLocalDist();
    lastBuild = { startedAt, completedAt:new Date().toISOString(), ...dist };
    return { ok:true, startedAt, completedAt:lastBuild.completedAt, sha256:dist.sha256, sizes:dist.sizes, outputTail:(result.stdout || result.stderr || '').slice(-6000) };
  }

  async function ssh(server, identityFile, command, timeoutMs = 120000) {
    return runner('/usr/bin/ssh', ['-i', identityFile, '-o', 'BatchMode=yes', server, command], { timeoutMs });
  }
  async function scp(identityFile, source, destination, recursive = false) {
    const args = ['-i', identityFile, '-o', 'BatchMode=yes'];
    if (recursive) args.push('-r');
    args.push(source, destination);
    return runner('/usr/bin/scp', args, { timeoutMs:10 * 60 * 1000 });
  }
  async function smoke(url) {
    if (!/^https:\/\/copytolive\.com(?:\/|$)/.test(String(url || ''))) throw new Error('public smoke URL is outside copytolive.com');
    const result = await runner('/usr/bin/curl', ['-fsSL', '--max-time', '30', String(url)], { timeoutMs:45000 });
    return { url:String(url), bytes:Buffer.byteLength(result.stdout || '') };
  }

  async function rollbackDeployment(receipt) {
    if (!receipt?.backupPath) throw new Error('deployment rollback receipt is missing');
    const { server, remoteRoot, identityFile } = validateDeployConfig(config);
    const backup = receipt.backupPath;
    if (!/^\/var\/backups\/copytolive\/rwacode-[0-9]{14}$/.test(backup)) throw new Error('invalid deployment backup path');
    const cmd = `set -eu; b='${backup}'; r='${remoteRoot}'; test -d "$b"; rm -f "$r/index.html" "$r/compounding_live.html"; rm -rf "$r/assets"; [ ! -e "$b/index.html" ] || cp -p "$b/index.html" "$r/index.html"; [ ! -e "$b/compounding_live.html" ] || cp -p "$b/compounding_live.html" "$r/compounding_live.html"; [ ! -e "$b/assets" ] || cp -a "$b/assets" "$r/assets"; printf 'ROLLBACK=PASS\\n'`;
    await ssh(server, identityFile, cmd, 180000);
    return { ok:true, backupPath:backup };
  }

  async function deploy() {
    const deploy = validateDeployConfig(config);
    if (!(await existingRegularFile(deploy.identityFile))) throw new Error('configured SSH identity file is missing or not a regular file');
    const dist = await verifyLocalDist();
    if (!lastBuild || lastBuild.sha256.index !== dist.sha256.index || lastBuild.sha256.compounding !== dist.sha256.compounding) {
      throw new Error('deploy requires a successful fixed build in this bridge session; run build or build_deploy first');
    }
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const backupPath = `/var/backups/copytolive/rwacode-${stamp}`;
    const backupCmd = `set -eu; b='${backupPath}'; r='${deploy.remoteRoot}'; mkdir -p "$b"; [ ! -e "$r/index.html" ] || cp -p "$r/index.html" "$b/index.html"; [ ! -e "$r/compounding_live.html" ] || cp -p "$r/compounding_live.html" "$b/compounding_live.html"; [ ! -e "$r/assets" ] || cp -a "$r/assets" "$b/assets"; printf 'BACKUP=%s\\n' "$b"`;
    await ssh(deploy.server, deploy.identityFile, backupCmd, 180000);
    const receipt = { backupPath, deployedAt:new Date().toISOString(), localSha256:dist.sha256, server:deploy.server, remoteRoot:deploy.remoteRoot };
    try {
      await scp(deploy.identityFile, dist.compounding, `${deploy.server}:${deploy.remoteRoot}/compounding_live.html`);
      await scp(deploy.identityFile, dist.index, `${deploy.server}:${deploy.remoteRoot}/index.html`);
      await scp(deploy.identityFile, dist.assets, `${deploy.server}:${deploy.remoteRoot}/`, true);
      const verifyCmd = `set -eu; r='${deploy.remoteRoot}'; test -s "$r/index.html"; test -s "$r/compounding_live.html"; test -d "$r/assets"; sha256sum "$r/index.html" "$r/compounding_live.html"`;
      const verified = await ssh(deploy.server, deploy.identityFile, verifyCmd, 120000);
      const smokeResults = [];
      for (const url of deploy.publicUrls) smokeResults.push(await smoke(url));
      return { ok:true, ...receipt, remoteVerify:(verified.stdout || '').trim().slice(0, 6000), smoke:smokeResults };
    } catch (error) {
      await rollbackDeployment(receipt).catch(() => {});
      throw error;
    }
  }

  async function buildDeploy() {
    const buildResult = await build();
    const deployResult = await deploy();
    return { ok:true, build:buildResult, deploy:deployResult };
  }

  return { build, deploy, buildDeploy, rollbackDeployment, verifyLocalDist };
}

function createControlService({ workspaceRoot, config, deployer = null } = {}) {
  const root = path.resolve(workspaceRoot || '');
  if (root !== EXPECTED_WORKSPACE_ROOT) throw new Error('control service is locked to /Users/Shared/WorkspaceBersama/copytolive.com');
  const guard = createPathGuard(root);
  const adapter = createLocalWorkspaceAdapter({ root });
  const transactions = createTransactionEngine({ adapter });
  const deployment = deployer || createCopyToLiveDeployer({ workspaceRoot:root, config });
  let deployedTransaction = null;

  async function stat(relativePath) {
    const rel = assertWorkspacePathAllowed(relativePath, { allowDot:true });
    const absolute = guard.resolveExisting(rel);
    const s = await fsp.lstat(absolute);
    if (s.isSymbolicLink()) throw new Error('symlink paths are not exposed by this bridge');
    return { path:rel, type:s.isDirectory()?'directory':s.isFile()?'file':'other', size:s.size, mtimeMs:s.mtimeMs };
  }
  async function list(relativePath = '.') {
    const rel = assertWorkspacePathAllowed(relativePath, { allowDot:true });
    const result = await adapter.listDirectory(rel);
    result.entries = result.entries.filter((entry) => !pathIsSensitive(entry.path));
    return result;
  }
  async function read(relativePath, maxBytes = MAX_READ_BYTES) {
    const rel = assertWorkspacePathAllowed(relativePath);
    const result = await adapter.readText(rel);
    const limit = clampInt(maxBytes, MAX_READ_BYTES, 1, MAX_READ_BYTES);
    const text = result.content.slice(0, limit);
    return { path:rel, size:result.size, digest:result.digest, truncated:Buffer.byteLength(result.content) > Buffer.byteLength(text), content:text };
  }
  async function search(query, startPath = '.', maxResults = 40) {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle || needle.length > 200) throw new Error('search query must contain 1-200 characters');
    const relRoot = assertWorkspacePathAllowed(startPath, { allowDot:true });
    const absoluteRoot = guard.resolveExisting(relRoot);
    const limit = clampInt(maxResults, 40, 1, MAX_SEARCH_RESULTS);
    const queue = [{ abs:absoluteRoot, rel:relRoot === '.' ? '' : relRoot }];
    const matches = [];
    let scanned = 0;
    while (queue.length && scanned < MAX_SEARCH_FILES && matches.length < limit) {
      const current = queue.shift();
      let entries = [];
      try { entries = await fsp.readdir(current.abs, { withFileTypes:true }); } catch { continue; }
      for (const entry of entries) {
        if (scanned >= MAX_SEARCH_FILES || matches.length >= limit) break;
        if (entry.name === '.DS_Store' || (entry.isDirectory() && SKIP_DIRS.has(entry.name))) continue;
        const rel = [current.rel, entry.name].filter(Boolean).join('/');
        if (pathIsSensitive(rel)) continue;
        const abs = path.join(current.abs, entry.name);
        let lst;
        try { lst = await fsp.lstat(abs); } catch { continue; }
        if (lst.isSymbolicLink()) continue;
        if (entry.isDirectory()) { queue.push({ abs, rel }); continue; }
        if (!entry.isFile()) continue;
        scanned++;
        if (lst.size > MAX_READ_BYTES) {
          if (rel.toLowerCase().includes(needle)) matches.push({ path:rel, kind:'path', size:lst.size });
          continue;
        }
        let content = '';
        try { content = await fsp.readFile(abs, 'utf8'); } catch { continue; }
        const lower = content.toLowerCase();
        const pathHit = rel.toLowerCase().includes(needle);
        const pos = lower.indexOf(needle);
        if (pathHit || pos >= 0) {
          const start = Math.max(0, pos - 140);
          const snippet = pos >= 0 ? content.slice(start, Math.min(content.length, pos + needle.length + 260)).replace(/[\r\n\t]+/g, ' ').slice(0, 500) : '';
          matches.push({ path:rel, kind:pathHit && pos < 0 ? 'path' : 'content', size:lst.size, snippet });
        }
      }
    }
    return { query:String(query), root:relRoot, scannedFiles:scanned, capped:scanned >= MAX_SEARCH_FILES, matches };
  }
  function safeChangeSet(raw) {
    const changeSet = raw && typeof raw === 'object' ? raw : {};
    for (const op of Array.isArray(changeSet.operations) ? changeSet.operations : []) {
      assertWorkspacePathAllowed(op.path, { directWrite:true });
      if (String(op.type || '').toUpperCase() === 'RENAME') assertWorkspacePathAllowed(op.to, { directWrite:true });
    }
    return changeSet;
  }
  async function prepare(changeSet, task = '') {
    return transactions.prepare(safeChangeSet(changeSet), { task:String(task || '').slice(0, 1000), runner:'chat-control-bridge' });
  }
  async function apply(id) { return transactions.apply(String(id || '')); }
  async function undo(id) {
    const txId = String(id || transactions.status().lastTransaction?.id || '');
    if (deployedTransaction?.transactionId === txId) {
      await deployment.rollbackDeployment(deployedTransaction.deployReceipt);
      deployedTransaction = null;
    }
    return transactions.undo(txId || undefined);
  }
  function requireAppliedTransaction(id) {
    const last = transactions.status().lastTransaction;
    if (!last || last.status !== 'APPLIED') throw new Error('build/deploy requires an applied transaction');
    if (!id || last.id !== String(id)) throw new Error('build/deploy transaction id does not match the active applied transaction');
    return last;
  }
  async function build(transactionId) {
    requireAppliedTransaction(transactionId);
    return deployment.build();
  }
  async function buildDeploy(transactionId, confirm) {
    const tx = requireAppliedTransaction(transactionId);
    if (String(confirm || '') !== DEPLOY_CONFIRM) throw new Error(`production deploy requires confirm=${DEPLOY_CONFIRM}`);
    const result = await deployment.buildDeploy();
    deployedTransaction = { transactionId:tx.id, deployReceipt:result.deploy };
    return result;
  }

  async function handle(request) {
    const op = String(request?.op || '').trim().toLowerCase();
    if (op === 'ping') return { profile:PROFILE, hostname:os.hostname(), workspaceRoot:root, readOnly:false, capabilities:['ping','stat','list','read','search','prepare','apply','undo','build','build_deploy'], deployConfirm:DEPLOY_CONFIRM };
    if (op === 'stat') return stat(request.path || '.');
    if (op === 'list') return list(request.path || '.');
    if (op === 'read') return read(request.path, request.max_bytes);
    if (op === 'search') return search(request.query, request.path || '.', request.max_results);
    if (op === 'prepare') return prepare(request.change_set, request.task);
    if (op === 'apply') return apply(request.transaction_id);
    if (op === 'undo') return undo(request.transaction_id);
    if (op === 'build') return build(request.transaction_id);
    if (op === 'build_deploy') return buildDeploy(request.transaction_id, request.confirm);
    throw new Error('unsupported operation');
  }

  return { handle, stat, list, read, search, prepare, apply, undo, build, buildDeploy, adapter, transactions };
}

async function git(args, options = {}) { return runProcess('/usr/bin/git', args, { timeoutMs:options.timeoutMs || 120000, cwd:options.cwd }); }
async function verifyTransportRepo() {
  if (!(await existingDirectory(TRANSPORT_REPO))) throw new Error(`transport repo is missing: ${TRANSPORT_REPO}`);
  const remote = (await git(['-C', TRANSPORT_REPO, 'remote', 'get-url', 'origin'])).stdout.trim().replace(/\.git$/, '');
  if (remote.replace(/\.git$/, '') !== TRANSPORT_REMOTE.replace(/\.git$/, '')) throw new Error('transport repo origin is not the approved private bridge repository');
  await git(['-C', TRANSPORT_REPO, 'checkout', TRANSPORT_BRANCH]);
  await git(['-C', TRANSPORT_REPO, 'pull', '--ff-only', 'origin', TRANSPORT_BRANCH], { timeoutMs:180000 });
}
async function syncTransport() {
  await git(['-C', TRANSPORT_REPO, 'pull', '--ff-only', 'origin', TRANSPORT_BRANCH], { timeoutMs:180000 });
}
async function commitAndPush(paths, message) {
  await git(['-C', TRANSPORT_REPO, 'add', '--', ...paths]);
  const status = (await git(['-C', TRANSPORT_REPO, 'status', '--porcelain', '--', ...paths])).stdout.trim();
  if (!status) return;
  await git(['-C', TRANSPORT_REPO, 'commit', '-m', message]);
  try {
    await git(['-C', TRANSPORT_REPO, 'push', 'origin', TRANSPORT_BRANCH], { timeoutMs:180000 });
  } catch {
    await git(['-C', TRANSPORT_REPO, 'pull', '--rebase', 'origin', TRANSPORT_BRANCH], { timeoutMs:180000 });
    await git(['-C', TRANSPORT_REPO, 'push', 'origin', TRANSPORT_BRANCH], { timeoutMs:180000 });
  }
}
async function writeJsonAtomic(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  const temp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding:'utf8', mode:0o600, flag:'wx' });
  await fsp.rename(temp, filePath);
}
async function loadConfig() {
  const raw = JSON.parse(await fsp.readFile(CONFIG_PATH, 'utf8'));
  if (raw.profile !== PROFILE) throw new Error(`config profile must be ${PROFILE}`);
  if (path.resolve(String(raw.workspace_root || '')) !== EXPECTED_WORKSPACE_ROOT) throw new Error('config workspace_root is not the exact CopyToLive root');
  return raw;
}
async function requestFiles() {
  const dir = path.join(TRANSPORT_REPO, 'requests');
  await fsp.mkdir(dir, { recursive:true });
  return (await fsp.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
}
async function processQueue(service) {
  await syncTransport();
  const files = await requestFiles();
  let processed = 0;
  for (const name of files) {
    const id = validateRequestId(name.slice(0, -5));
    const responseRel = `responses/${id}.json`;
    const responsePath = path.join(TRANSPORT_REPO, responseRel);
    if (await existingRegularFile(responsePath)) continue;
    const requestPath = path.join(TRANSPORT_REPO, 'requests', name);
    let request;
    let payload;
    const startedAt = new Date().toISOString();
    try {
      request = JSON.parse(await fsp.readFile(requestPath, 'utf8'));
      if (request.id != null && validateRequestId(request.id) !== id) throw new Error('request body id does not match filename');
      payload = { ok:true, id, profile:PROFILE, startedAt, completedAt:new Date().toISOString(), result:await service.handle(request) };
    } catch (error) {
      payload = { ok:false, id, profile:PROFILE, startedAt, completedAt:new Date().toISOString(), error:publicError(error) };
    }
    await writeJsonAtomic(responsePath, payload);
    const statusRel = 'status/mac.json';
    await writeJsonAtomic(path.join(TRANSPORT_REPO, statusRel), { profile:PROFILE, online:true, hostname:os.hostname(), workspaceRoot:EXPECTED_WORKSPACE_ROOT, lastRequest:id, lastOk:payload.ok, updatedAt:new Date().toISOString() });
    await commitAndPush([responseRel, statusRel], `bridge: respond ${id}`);
    processed++;
  }
  return processed;
}

async function main() {
  const config = await loadConfig();
  await verifyTransportRepo();
  const service = createControlService({ workspaceRoot:EXPECTED_WORKSPACE_ROOT, config });
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  while (!stopping) {
    try { await processQueue(service); }
    catch (error) { process.stderr.write(`[copytolive-control] ${publicError(error).message}\n`); }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

if (require.main === module) {
  main().catch((error) => { process.stderr.write(`${publicError(error).message}\n`); process.exitCode = 1; });
}

module.exports = {
  PROFILE, EXPECTED_WORKSPACE_ROOT, CONTROL_RUNTIME_ROOT, CONFIG_PATH, TRANSPORT_REPO, TRANSPORT_BRANCH, TRANSPORT_REMOTE,
  DEPLOY_CONFIRM, MAX_READ_BYTES, MAX_SEARCH_FILES, MAX_SEARCH_RESULTS,
  normalizeRelative, pathIsSensitive, assertWorkspacePathAllowed, validateRequestId, publicError,
  runProcess, resolveNpm, validateDeployConfig, createCopyToLiveDeployer, createControlService,
  verifyTransportRepo, syncTransport, processQueue, loadConfig,
};
