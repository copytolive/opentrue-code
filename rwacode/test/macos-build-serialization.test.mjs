import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'package.json'), 'utf8'));

function assertSerializedArchitectures(script, label) {
  assert.equal(typeof script, 'string', `${label} must exist`);
  assert.doesNotMatch(script, /--x64\s+--arm64|--arm64\s+--x64/, `${label} must not build both DMG architectures in one electron-builder process`);
  const invocations = script.split(/\s*&&\s*/).map((part) => part.trim()).filter(Boolean);
  assert.equal(invocations.length, 2, `${label} must contain exactly two sequential electron-builder invocations`);
  assert.match(invocations[0], /^electron-builder\b/);
  assert.match(invocations[0], /--x64\b/);
  assert.doesNotMatch(invocations[0], /--arm64\b/);
  assert.match(invocations[1], /^electron-builder\b/);
  assert.match(invocations[1], /--arm64\b/);
  assert.doesNotMatch(invocations[1], /--x64\b/);
  for (const invocation of invocations) {
    assert.match(invocation, /--mac\s+dmg\s+zip\b/);
    assert.match(invocation, /--publish\s+never\b/);
  }
}

test('engineering macOS packaging serializes x64 then arm64 to avoid hdiutil DMG mount races', () => {
  assertSerializedArchitectures(pkg.scripts['build:mac'], 'build:mac');
});

test('signed distribution packaging uses the same architecture serialization contract', () => {
  const script = pkg.scripts['build:mac:distribution'];
  assertSerializedArchitectures(script, 'build:mac:distribution');
  for (const invocation of script.split(/\s*&&\s*/)) {
    assert.match(invocation, /--config\s+electron-builder\.distribution\.cjs\b/);
  }
});
