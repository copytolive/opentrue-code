import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const installer = fs.readFileSync(path.join(root, 'scripts', 'configure-apple-distribution.sh'), 'utf8');
const workflow = fs.readFileSync(path.resolve(root, '..', '.github', 'workflows', 'rwacode-distribution.yml'), 'utf8');

const secretNames = [
  'MAC_CSC_LINK',
  'MAC_CSC_KEY_PASSWORD',
  'APPLE_API_KEY_P8_BASE64',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
  'APPLE_TEAM_ID'
];

test('Apple distribution installer sends all secret values through stdin', () => {
  for (const name of secretNames) {
    assert.match(installer, new RegExp(`gh secret set ${name} --repo \\"\\$REPO\\"`));
  }
  assert.doesNotMatch(installer, /gh secret set[^\n]*--body\s+-/);
  assert.match(installer, /SECRET_VALUES_PRINTED=NO/);
});

test('distribution release remains explicit and exact-main dispatched', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /source_sha:/);
  assert.match(workflow, /RWACODE_CANDIDATE_SHA:\s*\$\{\{ inputs\.source_sha \}\}/);
  assert.match(workflow, /test "\$ACTUAL" = "\$MAIN"/);
});
