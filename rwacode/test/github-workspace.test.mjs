import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGitHubWorkspaceManager, parseGitHubLocator } = require('../electron/github-workspace.cjs');
const { createWorkspaceAgent } = require('../electron/workspace-agent.cjs');

const hasGit = spawnSync('git', ['--version'], { encoding:'utf8' }).status === 0;

function temp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding:'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function makeBareRemote() {
  const root = temp('rwacode-github-origin-');
  const source = path.join(root, 'source');
  const remote = path.join(root, 'origin.git');
  fs.mkdirSync(source);
  git(source, 'init', '-b', 'main');
  git(source, 'config', 'user.email', 'rwacode-test@example.invalid');
  git(source, 'config', 'user.name', 'RWACode Test');
  fs.writeFileSync(path.join(source, 'RWACODE_GITHUB_E2E.txt'), 'RWACODE_GITHUB_E2E\nGITHUBVALUE=100\n');
  git(source, 'add', 'RWACODE_GITHUB_E2E.txt');
  git(source, 'commit', '-m', 'seed');
  git(root, 'clone', '--bare', source, remote);
  return { root, source, remote };
}

test('GitHub locator accepts owner/repo and explicit branch but rejects unsafe refs', () => {
  assert.deepEqual(parseGitHubLocator('copytolive/opentrue-code'), { owner:'copytolive', repo:'opentrue-code', slug:'copytolive/opentrue-code', ref:'main' });
  assert.equal(parseGitHubLocator('copytolive/opentrue-code#release/v1').ref, 'release/v1');
  assert.throws(() => parseGitHubLocator('../repo'));
  assert.throws(() => parseGitHubLocator('owner/repo#../../main'));
});

test('managed @GitHub worktree uses the same transaction engine, shows git diff, and Undo restores exact bytes', { skip:!hasGit }, async () => {
  const fixture = makeBareRemote();
  const stateRoot = path.join(fixture.root, 'managed');
  const manager = createGitHubWorkspaceManager({ stateRoot, remoteUrlFor:() => fixture.remote });
  const mounted = await manager.mount({ locator:'copytolive/demo#main' });
  assert.equal(mounted.adapter.type, 'github');
  assert.match(mounted.branch, /^rwacode\//);
  assert.equal((await mounted.adapter.sourceState()).dirty, false);

  const target = path.join(mounted.workspaceRoot, 'RWACODE_GITHUB_E2E.txt');
  const before = fs.readFileSync(target);
  const agent = createWorkspaceAgent({ adapter:mounted.adapter });
  const planned = await agent.plan('ubah GITHUBVALUE menjadi 200');
  assert.equal(planned.status, 'PREPARED');
  assert.equal(planned.workspace.type, 'github');
  assert.deepEqual(planned.touched, ['RWACODE_GITHUB_E2E.txt']);
  assert.match(planned.diff, /-GITHUBVALUE=100/);
  assert.match(planned.diff, /\+GITHUBVALUE=200/);
  assert.deepEqual(fs.readFileSync(target), before, 'review mode must not write before Apply');

  const applied = await agent.apply(planned.id);
  assert.match(fs.readFileSync(target, 'utf8'), /GITHUBVALUE=200/);
  assert.equal(applied.sourceState.dirty, true);
  assert.match(applied.sourceState.gitDiff, /GITHUBVALUE=200/);
  assert.match(git(fixture.remote, 'show', 'main:RWACODE_GITHUB_E2E.txt'), /GITHUBVALUE=100/, 'remote must not change on Apply');

  const undone = await agent.undo(applied.id);
  assert.equal(undone.status, 'UNDONE');
  assert.deepEqual(fs.readFileSync(target), before);
  assert.equal(undone.sourceState.dirty, false);
  assert.equal(undone.sourceState.gitDiff, '');
});

test('commit and push happen only through explicit GitHub adapter actions', { skip:!hasGit }, async () => {
  const fixture = makeBareRemote();
  const manager = createGitHubWorkspaceManager({ stateRoot:path.join(fixture.root, 'managed'), remoteUrlFor:() => fixture.remote });
  const mounted = await manager.mount({ locator:'copytolive/demo#main' });
  git(mounted.workspaceRoot, 'config', 'user.email', 'rwacode-test@example.invalid');
  git(mounted.workspaceRoot, 'config', 'user.name', 'RWACode Test');

  const agent = createWorkspaceAgent({ adapter:mounted.adapter });
  const tx = await agent.plan('ubah GITHUBVALUE menjadi 300');
  const applied = await agent.apply(tx.id);
  assert.match(git(fixture.remote, 'show', 'main:RWACODE_GITHUB_E2E.txt'), /GITHUBVALUE=100/);
  assert.equal(git(fixture.remote, 'branch', '--list', mounted.branch), '');

  const committed = await agent.explicitGitAction('commit', { message:'RWACode explicit test commit' }, applied.id);
  assert.equal(committed.dirty, false);
  assert.equal(committed.ahead, 1);
  assert.equal(git(fixture.remote, 'branch', '--list', mounted.branch), '', 'commit remains local until explicit push');

  const pushed = await agent.explicitGitAction('push', {}, applied.id);
  assert.equal(pushed.dirty, false);
  assert.match(git(fixture.remote, 'show', `${mounted.branch}:RWACODE_GITHUB_E2E.txt`), /GITHUBVALUE=300/);
  assert.match(git(fixture.remote, 'show', 'main:RWACODE_GITHUB_E2E.txt'), /GITHUBVALUE=100/, 'base branch is never rewritten');
});

test('GitHub workspace implementation has no history-rewrite shortcut', () => {
  const source = fs.readFileSync(new URL('../electron/github-workspace.cjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /reset\s+--hard|rebase|push[^\n]*--force|push[^\n]*-f\b/);
  assert.match(source, /merge','--ff-only/);
  assert.match(source, /managed GitHub workspace has uncommitted changes/);
});
