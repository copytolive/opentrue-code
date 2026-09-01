import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGoogleDriveWorkspaceManager, resolveDriveLocator } = require('../electron/google-drive-workspace.cjs');
const { createWorkspaceAgent } = require('../electron/workspace-agent.cjs');

function temp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function fixtureBytes(value = 12345) { return Buffer.from(`RWACODE_GOOGLE_DRIVE_AGENT_E2E\nVERSION=1\nSTATUS=BEFORE\nRWACODEDRIVEVALUE=${value}\n`); }

test('Google Drive mirror stays local until explicit sync, then Undo restores mirror and Drive exact BEFORE bytes', async () => {
  const driveRoot = temp('rwacode-drive-root-');
  const sourceFolder = path.join(driveRoot, '07_RWACODE', 'E2E');
  fs.mkdirSync(sourceFolder, { recursive:true });
  const sourceFile = path.join(sourceFolder, 'RWACODE_GOOGLE_DRIVE_AGENT_E2E.txt');
  const before = fixtureBytes(12345);
  fs.writeFileSync(sourceFile, before);

  const manager = createGoogleDriveWorkspaceManager({ stateRoot:temp('rwacode-drive-state-'), driveRoots:[driveRoot] });
  const mounted = await manager.mount({ locator:sourceFolder });
  assert.equal(mounted.adapter.type, 'googledrive');
  assert.equal(mounted.adapter.capabilities.syncBack, true);
  assert.equal(mounted.adapter.capabilities.nativeGoogleWorkspaceFiles, false);

  const agent = createWorkspaceAgent({ adapter:mounted.adapter });
  const planned = await agent.plan('RWACODEDRIVEVALUE menjadi 22222');
  assert.equal(planned.status, 'PREPARED');
  assert.deepEqual(planned.touched, ['RWACODE_GOOGLE_DRIVE_AGENT_E2E.txt']);
  assert.match(planned.diff, /-RWACODEDRIVEVALUE=12345/);
  assert.match(planned.diff, /\+RWACODEDRIVEVALUE=22222/);
  assert.deepEqual(fs.readFileSync(sourceFile), before, 'Drive source must not change before Apply or explicit Sync');

  const applied = await agent.apply(planned.id);
  assert.match(fs.readFileSync(path.join(mounted.mirrorRoot, 'RWACODE_GOOGLE_DRIVE_AGENT_E2E.txt'), 'utf8'), /22222/);
  assert.deepEqual(fs.readFileSync(sourceFile), before, 'Apply edits only managed mirror');

  const synced = await agent.explicitDriveAction('sync', {}, applied.id);
  assert.equal(synced.synced, true);
  assert.match(fs.readFileSync(sourceFile, 'utf8'), /RWACODEDRIVEVALUE=22222/);

  const undone = await agent.undo(applied.id);
  assert.equal(undone.status, 'UNDONE');
  assert.deepEqual(fs.readFileSync(sourceFile), before, 'Undo must restore exact Drive BEFORE bytes after explicit sync');
  assert.deepEqual(fs.readFileSync(path.join(mounted.mirrorRoot, 'RWACODE_GOOGLE_DRIVE_AGENT_E2E.txt')), before, 'Undo must restore exact mirror BEFORE bytes');
});

test('Google Drive sync refuses external version conflicts', async () => {
  const driveRoot = temp('rwacode-drive-conflict-root-');
  const sourceFolder = path.join(driveRoot, 'project');
  fs.mkdirSync(sourceFolder, { recursive:true });
  const sourceFile = path.join(sourceFolder, 'config.txt');
  fs.writeFileSync(sourceFile, 'VALUE=1\n');
  const manager = createGoogleDriveWorkspaceManager({ stateRoot:temp('rwacode-drive-conflict-state-'), driveRoots:[driveRoot] });
  const mounted = await manager.mount({ locator:sourceFolder });
  const agent = createWorkspaceAgent({ adapter:mounted.adapter });
  const planned = await agent.plan('VALUE menjadi 2');
  const applied = await agent.apply(planned.id);
  fs.writeFileSync(sourceFile, 'VALUE=EXTERNAL\n');
  await assert.rejects(agent.explicitDriveAction('sync', {}, applied.id), /sync conflict/);
  assert.equal(fs.readFileSync(sourceFile, 'utf8'), 'VALUE=EXTERNAL\n');
});

test('Google Drive manager refuses a dirty managed mirror on remount', async () => {
  const driveRoot = temp('rwacode-drive-dirty-root-');
  const sourceFolder = path.join(driveRoot, 'project');
  fs.mkdirSync(sourceFolder, { recursive:true });
  fs.writeFileSync(path.join(sourceFolder, 'config.txt'), 'VALUE=1\n');
  const stateRoot = temp('rwacode-drive-dirty-state-');
  const manager = createGoogleDriveWorkspaceManager({ stateRoot, driveRoots:[driveRoot] });
  const mounted = await manager.mount({ locator:sourceFolder });
  fs.writeFileSync(path.join(mounted.mirrorRoot, 'config.txt'), 'VALUE=2\n');
  await assert.rejects(manager.mount({ locator:sourceFolder }), /unsynced changes/);
});

test('Google Drive native Workspace stubs are not misrepresented as editable local text', async () => {
  const driveRoot = temp('rwacode-drive-native-root-');
  const nativeStub = path.join(driveRoot, 'Design.gdoc');
  fs.writeFileSync(nativeStub, '{}');
  const manager = createGoogleDriveWorkspaceManager({ stateRoot:temp('rwacode-drive-native-state-'), driveRoots:[driveRoot] });
  await assert.rejects(manager.mount({ locator:nativeStub }), /Native Google Docs\/Sheets\/Slides/);
});

test('Google Drive locator is root scoped and rejects paths outside mounted Drive roots', async () => {
  const driveRoot = temp('rwacode-drive-scope-root-');
  const outside = temp('rwacode-drive-outside-');
  await assert.rejects(resolveDriveLocator(outside, [driveRoot]), /not found inside/);
  const inside = path.join(driveRoot, 'project');
  fs.mkdirSync(inside);
  assert.equal(await resolveDriveLocator(inside, [driveRoot]), fs.realpathSync(inside));
});
