import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const installer = fs.readFileSync(path.join(root, 'scripts', 'configure-apple-distribution.sh'), 'utf8');
const finalGate = fs.readFileSync(path.join(root, 'scripts', 'distribution-final.sh'), 'utf8');
const workflow = fs.readFileSync(path.resolve(root, '..', '.github', 'workflows', 'rwacode-distribution.yml'), 'utf8');

const signingSecrets = [
  'MAC_CSC_LINK',
  'MAC_CSC_KEY_PASSWORD',
  'APPLE_TEAM_ID'
];

const apiSecrets = [
  'APPLE_API_KEY_P8_BASE64',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
];

const appleIdSecrets = [
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD'
];

test('Apple distribution installer sends all secret values through stdin', () => {
  for (const name of [...signingSecrets, ...apiSecrets, ...appleIdSecrets]) {
    assert.ok(installer.includes(`gh secret set ${name} --repo "$REPO"`), `missing stdin secret write for ${name}`);
  }
  assert.doesNotMatch(installer, /gh secret set[^\n]*--body\s+-/);
  assert.match(installer, /SECRET_VALUES_PRINTED=NO/);
});

test('installer supports Apple ID and App Store Connect API key notarization', () => {
  assert.match(installer, /1=Apple ID, 2=API key/);
  assert.match(installer, /APPLE_APP_SPECIFIC_PASSWORD/);
  assert.match(installer, /APPLE_API_KEY_P8_BASE64/);
  assert.match(finalGate, /APPLE_NOTARIZATION_SECRET_SET=APPLE_ID/);
  assert.match(finalGate, /APPLE_NOTARIZATION_SECRET_SET=API_KEY/);
});

test('distribution workflow accepts either notarization credential set', () => {
  assert.match(workflow, /APPLE_ID: \$\{\{ secrets\.APPLE_ID \}\}/);
  assert.match(workflow, /APPLE_APP_SPECIFIC_PASSWORD: \$\{\{ secrets\.APPLE_APP_SPECIFIC_PASSWORD \}\}/);
  assert.match(workflow, /APPLE_NOTARIZATION_AUTH=APPLE_ID/);
  assert.match(workflow, /APPLE_NOTARIZATION_AUTH=API_KEY/);
});

test('distribution release remains explicit and exact-main dispatched', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /source_sha:/);
  assert.match(workflow, /RWACODE_CANDIDATE_SHA:\s*\$\{\{ inputs\.source_sha \}\}/);
  assert.match(workflow, /test "\$ACTUAL" = "\$MAIN"/);
});
