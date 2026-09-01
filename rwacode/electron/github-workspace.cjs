'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createLocalWorkspaceAdapter, normalizeRelative } = require('./workspace-adapter.cjs');

const MAX_PROCESS_OUTPUT = 2 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 120000;
const ALLOWED_TOOLS = new Set(['git','gh']);

function findToolExecutable(name, env = process.env) {
  const tool = String(name || '').trim();
  if (!ALLOWED_TOOLS.has(tool)) return null;
  const searchPath = String(env?.PATH || '');
  for (const directory of searchPath.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, tool);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function parseGitHubLocator(input, fallbackRef = 'main') {
  const raw = String(input || '').trim();
  const match = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:#([A-Za-z0-9._\/-]+))?$/);
  if (!match) throw new Error('GitHub workspace must be owner/repository or owner/repository#branch');
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');
  const ref = validateGitRef(match[3] || fallbackRef);
  if (!owner || !repo || owner === '.' || owner === '..' || repo === '.' || repo === '..') throw new Error('GitHub workspace owner/repository is invalid');
  return { owner, repo, slug:`${owner}/${repo}`, ref };
}

function validateGitRef(input) {
  const value = String(input || 'main').trim();
  if (!value || value.length > 160 || !/^[A-Za-z0-9._\/-]+$/.test(value) || value.startsWith('/') || value.endsWith('/') || value.includes('..') || value.includes('//') || value.includes('@{')) throw new Error('invalid Git branch/ref');
  return value;
}

function safeSegment(value) {
  return String(value || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'workspace';
}

function runProcess(executable, args, { cwd = undefined, env = process.env, timeoutMs = PROCESS_TIMEOUT_MS, allowCodes = [0] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'], env:{ ...env } });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    const append = (current, chunk) => {
      const next = Buffer.concat([current, Buffer.from(chunk)]);
      if (next.length > MAX_PROCESS_OUTPUT) throw new Error('GitHub workspace command output exceeded limit');
      return next;
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      reject(error);
    };
    const timer = setTimeout(() => finishReject(new Error('GitHub workspace command timed out')), timeoutMs);
    child.stdout.on('data', (chunk) => { try { stdout = append(stdout, chunk); } catch (error) { finishReject(error); } });
    child.stderr.on('data', (chunk) => { try { stderr = append(stderr, chunk); } catch (error) { finishReject(error); } });
    child.on('error', finishReject);
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = stdout.toString('utf8');
      const err = stderr.toString('utf8');
      if (!allowCodes.includes(code)) return reject(new Error(`GitHub workspace command failed (${code}): ${err.trim().slice(0, 500) || 'no diagnostic output'}`));
      resolve({ code, stdout:out, stderr:err });
    });
  });
}

function createGitHubWorkspaceManager({ stateRoot, env = process.env, remoteUrlFor = ({ slug }) => `https://github.com/${slug}.git`, processRunner = runProcess } = {}) {
  if (!stateRoot) throw new Error('GitHub workspace manager requires stateRoot');
  const git = findToolExecutable('git', env);

  async function command(args, cwd, options = {}) {
    if (!git) throw new Error('Git is not installed or not available in PATH');
    return processRunner(git, args, { cwd, env, ...options });
  }

  async function mount({ locator, ref = 'main' } = {}) {
    if (!git) throw new Error('Git is required for @GitHub workspaces');
    const source = parseGitHubLocator(locator, ref);
    const workspaceRoot = path.join(path.resolve(stateRoot), safeSegment(source.owner), safeSegment(source.repo));
    const expectedOrigin = String(remoteUrlFor(source));
    await fsp.mkdir(path.dirname(workspaceRoot), { recursive:true, mode:0o700 });

    if (!fs.existsSync(path.join(workspaceRoot, '.git'))) {
      if (fs.existsSync(workspaceRoot)) {
        const entries = await fsp.readdir(workspaceRoot).catch(() => []);
        if (entries.length) throw new Error('managed GitHub workspace path exists but is not a Git clone');
        await fsp.rm(workspaceRoot, { recursive:true, force:true });
      }
      await command(['clone','--no-tags','--origin','origin','--branch',source.ref,expectedOrigin,workspaceRoot], path.dirname(workspaceRoot));
    }

    const actualOrigin = (await command(['remote','get-url','origin'], workspaceRoot)).stdout.trim();
    if (actualOrigin !== expectedOrigin) throw new Error('managed GitHub workspace origin does not match the requested repository');

    const porcelain = (await command(['status','--porcelain'], workspaceRoot)).stdout.trim();
    if (porcelain) throw new Error('managed GitHub workspace has uncommitted changes; resolve them before switching or refreshing source');

    await command(['fetch','--no-tags','origin',source.ref], workspaceRoot);
    const branch = `rwacode/${safeSegment(source.owner)}-${safeSegment(source.repo)}-${safeSegment(source.ref)}`.slice(0, 150);
    const current = (await command(['branch','--show-current'], workspaceRoot)).stdout.trim();
    const branchExists = (await command(['show-ref','--verify','--quiet',`refs/heads/${branch}`], workspaceRoot, { allowCodes:[0,1] })).code === 0;

    if (current !== branch) {
      if (branchExists) await command(['switch',branch], workspaceRoot);
      else await command(['switch','-c',branch,`origin/${source.ref}`], workspaceRoot);
    }

    const ahead = Number((await command(['rev-list','--count',`origin/${source.ref}..HEAD`], workspaceRoot)).stdout.trim() || 0);
    if (ahead === 0) await command(['merge','--ff-only',`origin/${source.ref}`], workspaceRoot);

    const local = createLocalWorkspaceAdapter({ root:workspaceRoot });

    async function sourceState() {
      const status = (await command(['status','--porcelain'], workspaceRoot)).stdout;
      const diff = (await command(['diff','--no-ext-diff','--'], workspaceRoot)).stdout;
      const head = (await command(['rev-parse','HEAD'], workspaceRoot)).stdout.trim();
      const currentBranch = (await command(['branch','--show-current'], workspaceRoot)).stdout.trim();
      const counts = (await command(['rev-list','--left-right','--count',`origin/${source.ref}...HEAD`], workspaceRoot)).stdout.trim().split(/\s+/).map(Number);
      return {
        type:'github',
        repository:source.slug,
        baseRef:source.ref,
        branch:currentBranch,
        head,
        dirty:Boolean(status.trim()),
        status,
        gitDiff:diff,
        behind:Number.isFinite(counts[0]) ? counts[0] : 0,
        ahead:Number.isFinite(counts[1]) ? counts[1] : 0,
      };
    }

    async function commit({ message, paths = [] } = {}) {
      const cleanMessage = String(message || '').trim();
      if (!cleanMessage || cleanMessage.length > 240) throw new Error('commit message must contain 1-240 characters');
      const normalizedPaths = [...new Set((Array.isArray(paths) ? paths : []).map(normalizeRelative))];
      if (!normalizedPaths.length) throw new Error('explicit GitHub commit requires transaction paths');
      await command(['add','--',...normalizedPaths], workspaceRoot);
      const staged = (await command(['diff','--cached','--name-only'], workspaceRoot)).stdout.trim();
      if (!staged) throw new Error('no staged changes to commit');
      await command(['commit','-m',cleanMessage,'--',...normalizedPaths], workspaceRoot);
      return sourceState();
    }

    async function push() {
      const state = await sourceState();
      if (state.dirty) throw new Error('commit workspace changes before push');
      if (!state.branch.startsWith('rwacode/')) throw new Error('RWACode only pushes its managed rwacode/* branch');
      await command(['push','-u','origin',`HEAD:refs/heads/${state.branch}`], workspaceRoot);
      return sourceState();
    }

    async function createPullRequest({ title, body = '' } = {}) {
      const cleanTitle = String(title || '').trim();
      if (!cleanTitle || cleanTitle.length > 240) throw new Error('pull request title must contain 1-240 characters');
      const state = await sourceState();
      if (state.dirty) throw new Error('commit and push workspace changes before opening a pull request');
      if (!state.branch.startsWith('rwacode/')) throw new Error('pull request head must be an RWACode-managed branch');
      const gh = findToolExecutable('gh', env);
      if (!gh) throw new Error('GitHub CLI (gh) is not available; install/sign in to gh before opening a PR from RWACode');
      const result = await processRunner(gh, ['pr','create','--repo',source.slug,'--head',state.branch,'--base',source.ref,'--title',cleanTitle,'--body',String(body || '').slice(0, 4000)], { cwd:workspaceRoot, env });
      const url = result.stdout.trim().split(/\s+/).find((value) => /^https:\/\/github\.com\//i.test(value)) || null;
      return { ...(await sourceState()), pullRequestUrl:url };
    }

    const adapter = {
      ...local,
      id:`github:${source.slug}#${source.ref}`,
      type:'github',
      root:workspaceRoot,
      capabilities:{ ...local.capabilities, watch:false, versioning:true, syncBack:true, commit:true, push:true, pullRequest:true },
      source:{ type:'github', repository:source.slug, baseRef:source.ref, branch },
      sourceState,
      commit,
      push,
      createPullRequest,
    };

    return { adapter, source, workspaceRoot, branch };
  }

  function availability() {
    return { git:{ available:Boolean(git), executable:git || null }, gh:{ available:Boolean(findToolExecutable('gh', env)) } };
  }

  return { mount, availability };
}

module.exports = { createGitHubWorkspaceManager, parseGitHubLocator, validateGitRef, runProcess, safeSegment, findToolExecutable };