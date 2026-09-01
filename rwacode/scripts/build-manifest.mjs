import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const repoRoot = path.resolve(root, '..');
const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const expectedSha = String(process.env.RWACODE_CANDIDATE_SHA || '').trim();
if (expectedSha && expectedSha !== gitSha) throw new Error(`candidate SHA mismatch: expected ${expectedSha}, got ${gitSha}`);

const executableByArch = {
  x86_64: path.join(dist, 'mac', 'RWACode.app', 'Contents', 'MacOS', 'RWACode'),
  arm64: path.join(dist, 'mac-arm64', 'RWACode.app', 'Contents', 'MacOS', 'RWACode')
};
for (const [arch, executable] of Object.entries(executableByArch)) {
  if (!fs.existsSync(executable)) throw new Error(`missing ${arch} packaged executable: ${executable}`);
  const report = execFileSync('file', [executable], { encoding: 'utf8' }).trim();
  if (arch === 'x86_64' && !/(x86_64|x86-64)/i.test(report)) throw new Error(`x86_64 executable verification failed: ${report}`);
  if (arch === 'arm64' && !/arm64/i.test(report)) throw new Error(`arm64 executable verification failed: ${report}`);
}

const expected = [
  { arch: 'x86_64', kind: 'dmg', file: `RWACode-${pkg.version}.dmg` },
  { arch: 'x86_64', kind: 'zip', file: `RWACode-${pkg.version}-mac.zip` },
  { arch: 'arm64', kind: 'dmg', file: `RWACode-${pkg.version}-arm64.dmg` },
  { arch: 'arm64', kind: 'zip', file: `RWACode-${pkg.version}-arm64-mac.zip` }
];

const sha256 = (file) => {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
};

const artifacts = expected.map((item) => {
  const absolute = path.join(dist, item.file);
  if (!fs.existsSync(absolute)) throw new Error(`missing expected artifact: ${item.file}`);
  const stat = fs.statSync(absolute);
  return { ...item, size: stat.size, sha256: sha256(absolute) };
});

const manifest = {
  schemaVersion: 1,
  product: 'RWACode',
  version: pkg.version,
  commit: gitSha,
  artifacts
};
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`RWACODE_BUILD_MANIFEST=PASS version=${pkg.version} sha=${gitSha} artifacts=${artifacts.length}`);
