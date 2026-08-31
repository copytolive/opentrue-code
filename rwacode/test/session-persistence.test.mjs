import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap = fs.readFileSync(new URL('../electron/bootstrap.cjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('RWACode uses one stable Chromium userData directory in development and packaged builds', () => {
  assert.equal(packageJson.main, 'electron/bootstrap.cjs');
  assert.match(bootstrap, /path\.join\(appData, 'RWACode'\)/);
  assert.match(bootstrap, /app\.setPath\('userData', stableUserData\)/);
});

test('legacy RWACode persistent partitions are migrated without copying arbitrary browser state', () => {
  assert.match(bootstrap, /rwacode-profile-/);
  assert.match(bootstrap, /entry\.name !== 'rwacode-preview'/);
  assert.match(bootstrap, /copyIfMissing\(path\.join\(legacyRoot, 'profiles\.json'\)/);
  assert.doesNotMatch(bootstrap, /clearStorageData\(/);
});

test('persistent browser state is flushed before normal quit and Ctrl+C restart', () => {
  assert.match(bootstrap, /flushStorageData\(\)/);
  assert.match(bootstrap, /app\.on\('before-quit'/);
  assert.match(bootstrap, /'SIGINT'/);
  assert.match(bootstrap, /'SIGTERM'/);
  assert.match(bootstrap, /app\.quit\(\)/);
});
