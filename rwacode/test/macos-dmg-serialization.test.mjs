import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'package.json'), 'utf8'));

test('unsigned macOS DMG builds are serialized by architecture', () => {
  assert.equal(pkg.scripts['build:mac:x64'], 'electron-builder --mac dmg zip --x64 --publish never');
  assert.equal(pkg.scripts['build:mac:arm64'], 'electron-builder --mac dmg zip --arm64 --publish never');
  assert.equal(pkg.scripts['build:mac'], 'npm run build:mac:x64 && npm run build:mac:arm64');
  assert.doesNotMatch(pkg.scripts['build:mac'], /--x64\s+--arm64|--arm64\s+--x64/);
});

test('signed distribution DMG builds are serialized by architecture too', () => {
  assert.match(pkg.scripts['build:mac:distribution:x64'], /--x64 --publish never$/);
  assert.match(pkg.scripts['build:mac:distribution:arm64'], /--arm64 --publish never$/);
  assert.equal(pkg.scripts['build:mac:distribution'], 'npm run build:mac:distribution:x64 && npm run build:mac:distribution:arm64');
  assert.doesNotMatch(pkg.scripts['build:mac:distribution'], /--x64\s+--arm64|--arm64\s+--x64/);
});
