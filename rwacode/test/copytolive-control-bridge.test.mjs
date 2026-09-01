import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const bridge = require('../control/copytolive-control-bridge.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'control', 'copytolive-control-bridge.cjs'), 'utf8');

test('CopyToLive control bridge is locked to the exact local and private transport roots', () => {
  assert.equal(bridge.PROFILE, 'COPYTOLIVE_LIVE_CONTROL_V1');
  assert.equal(bridge.EXPECTED_WORKSPACE_ROOT, '/Users/Shared/WorkspaceBersama/copytolive.com');
  assert.equal(bridge.TRANSPORT_BRANCH, 'copytolive-live-control');
  assert.equal(bridge.TRANSPORT_REMOTE, 'https://github.com/copytolive/archive-bridge-private.git');
  assert.equal(bridge.DEPLOY_CONFIRM, 'DEPLOY_COPYTOLIVE_PRODUCTION');
});

test('sensitive and generated paths are rejected before workspace operations', () => {
  for (const value of ['.env', '.env.production', '.ssh/id_ed25519', 'frontend/.npmrc', 'certs/live.pem', 'credentials.json']) {
    assert.equal(bridge.pathIsSensitive(value), true, value);
    assert.throws(() => bridge.assertWorkspacePathAllowed(value), /sensitive credential path/);
  }
  assert.throws(() => bridge.assertWorkspacePathAllowed('../outside.txt'), /invalid workspace-relative path/);
  assert.throws(() => bridge.assertWorkspacePathAllowed('/etc/passwd'), /invalid workspace-relative path/);
  assert.throws(() => bridge.assertWorkspacePathAllowed('.git/config'), /\.git is not available/);
  assert.throws(() => bridge.assertWorkspacePathAllowed('frontend/dist/index.html', { directWrite:true }), /cannot be modified directly/);
  assert.throws(() => bridge.assertWorkspacePathAllowed('frontend/node_modules/x.js', { directWrite:true }), /cannot be modified directly/);
  assert.equal(bridge.assertWorkspacePathAllowed('frontend/public/compounding_live.html', { directWrite:true }), 'frontend/public/compounding_live.html');
});

test('request IDs are deliberately boring and bounded', () => {
  assert.equal(bridge.validateRequestId('20260901-copytolive-ping-001'), '20260901-copytolive-ping-001');
  for (const value of ['', '../x', 'a/b', 'x y', 'a'.repeat(101)]) assert.throws(() => bridge.validateRequestId(value), /invalid request id/);
});

test('deploy configuration requires explicit opt-in, exact web root and local identity path', () => {
  assert.throws(() => bridge.validateDeployConfig({ deploy:{ enabled:false } }), /disabled/);
  assert.throws(() => bridge.validateDeployConfig({ deploy:{ enabled:true, server:'root@109.123.239.76', remote_root:'/var/www/other', identity_file:'/tmp/key' } }), /remote_root/);
  assert.throws(() => bridge.validateDeployConfig({ deploy:{ enabled:true, server:'root@109.123.239.76', remote_root:'/var/www/copytolive', identity_file:'relative-key' } }), /absolute local path/);
  const value = bridge.validateDeployConfig({ deploy:{ enabled:true, server:'root@109.123.239.76', remote_root:'/var/www/copytolive', identity_file:'/Users/antigravity1/.ssh/id_ed25519', public_urls:['https://copytolive.com/'] } });
  assert.equal(value.server, 'root@109.123.239.76');
  assert.equal(value.remoteRoot, '/var/www/copytolive');
});

test('bridge source exposes no arbitrary execute operation', () => {
  assert.doesNotMatch(source, /op\s*===\s*['\"](?:exec|shell|command|run)['\"]/i);
  assert.match(source, /createTransactionEngine\(\{ adapter \}\)/);
  assert.match(source, /spawn\(executable, args, \{[^}]*shell:false/s);
  assert.match(source, /remoteRoot !== '\/var\/www\/copytolive'/);
  assert.match(source, /build_deploy/);
  assert.match(source, /DEPLOY_COPYTOLIVE_PRODUCTION/);
});
