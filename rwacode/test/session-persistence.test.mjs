import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap = fs.readFileSync(new URL('../electron/bootstrap.cjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('RWACode uses one stable Chromium userData directory in development and packaged builds', () => {
  assert.equal(packageJson.main, 'electron/bootstrap.cjs');
  assert.match(bootstrap, /path\.join\(appData,\s*['"]RWACode['"]\)/);
  assert.match(bootstrap, /app\.setPath\(['"]userData['"],\s*stableUserData\)/);
});

test('legacy RWACode persistent partitions are migrated through a provider-profile allowlist only', () => {
  assert.match(bootstrap, /entry\.name\.startsWith\(['"]rwacode-profile-['"]\)/);
  assert.match(bootstrap, /if\(!entry\.name\.startsWith\(['"]rwacode-profile-['"]\)\)continue/);
  assert.match(bootstrap, /copyIfMissing\(path\.join\(legacyRoot,\s*['"]profiles\.json['"]\)/);
  const migrationBlock = bootstrap.slice(bootstrap.indexOf('function migrateLegacyRwacodeState'), bootstrap.indexOf('migrateLegacyRwacodeState();'));
  assert.doesNotMatch(migrationBlock, /rwacode-preview/);
  assert.doesNotMatch(bootstrap, /clearStorageData\(/);
});

test('persistent browser state is flushed before normal quit and Ctrl+C restart', () => {
  assert.match(bootstrap, /flushStorageData\(\)/);
  assert.match(bootstrap, /app\.on\(['"]before-quit['"]/);
  assert.match(bootstrap, /['"]SIGINT['"]/);
  assert.match(bootstrap, /['"]SIGTERM['"]/);
  assert.match(bootstrap, /app\.quit\(\)/);
});
