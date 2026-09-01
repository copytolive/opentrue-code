import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const repoRoot = path.resolve(root, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifestPath = path.join(dist, 'build-manifest.json');
const sumsPath = path.join(dist, 'SHA256SUMS');
if (!fs.existsSync(manifestPath)) throw new Error('build-manifest.json missing');
if (!fs.existsSync(sumsPath)) throw new Error('SHA256SUMS missing');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();

if (manifest.schemaVersion !== 1) throw new Error('unsupported build manifest schema');
if (manifest.product !== 'RWACode') throw new Error('manifest product mismatch');
if (manifest.version !== pkg.version) throw new Error(`manifest version ${manifest.version} != package version ${pkg.version}`);
if (manifest.commit !== gitSha) throw new Error(`manifest commit ${manifest.commit} != checked out SHA ${gitSha}`);
if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 4) throw new Error('manifest must contain exactly four macOS artifacts');

const required = new Set(['x86_64:dmg','x86_64:zip','arm64:dmg','arm64:zip']);
const seen = new Set();
const expectedSums = [];
for (const artifact of manifest.artifacts) {
  const key = `${artifact.arch}:${artifact.kind}`;
  if (!required.has(key)) throw new Error(`unexpected artifact contract entry: ${key}`);
  if (seen.has(key)) throw new Error(`duplicate artifact contract entry: ${key}`);
  seen.add(key);
  const absolute = path.join(dist, artifact.file);
  if (!absolute.startsWith(`${dist}${path.sep}`)) throw new Error(`artifact path escapes dist: ${artifact.file}`);
  if (!fs.existsSync(absolute)) throw new Error(`artifact missing: ${artifact.file}`);
  const stat = fs.statSync(absolute);
  if (stat.size !== artifact.size) throw new Error(`artifact size mismatch: ${artifact.file}`);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (digest !== artifact.sha256) throw new Error(`artifact hash mismatch: ${artifact.file}`);
  expectedSums.push(`${digest}  ${artifact.file}`);
}
for (const key of required) if (!seen.has(key)) throw new Error(`required artifact missing from manifest: ${key}`);

const actualSums = fs.readFileSync(sumsPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).sort();
if (JSON.stringify(actualSums) !== JSON.stringify(expectedSums.sort())) throw new Error('SHA256SUMS does not exactly match build manifest');

console.log(`RWACODE_ARTIFACT_CONTRACT=PASS version=${pkg.version} sha=${gitSha}`);
