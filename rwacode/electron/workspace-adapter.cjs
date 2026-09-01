'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { createPathGuard } = require('../lib/path-guard.cjs');

const MAX_AGENT_FILE_BYTES = 2 * 1024 * 1024;

function normalizeRelative(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw || raw === '.' || raw.startsWith('/') || raw.split('/').includes('..')) throw new Error('invalid workspace-relative path');
  return raw.replace(/^\.\//, '');
}
function normalizeDirectoryRelative(value) {
  const raw = String(value == null ? '.' : value).trim().replace(/\\/g, '/');
  if (!raw || raw === '.') return '.';
  if (raw.startsWith('/') || raw.split('/').includes('..')) throw new Error('invalid workspace-relative directory');
  return raw.replace(/^\.\//, '').replace(/\/$/, '') || '.';
}
function digest(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function createLocalWorkspaceAdapter({ root }) {
  const guard = createPathGuard(root);

  function lexicalPath(relativePath) {
    const rel = normalizeRelative(relativePath);
    const parentRel = path.dirname(rel);
    const parent = guard.resolveExisting(parentRel === '.' ? '.' : parentRel);
    const candidate = path.join(parent, path.basename(rel));
    if (candidate !== guard.root && !candidate.startsWith(guard.root + path.sep)) throw new Error('path escapes canonical root');
    return { rel, candidate };
  }

  async function listDirectory(relativePath = '.') {
    const rel = normalizeDirectoryRelative(relativePath);
    const target = guard.resolveExisting(rel);
    const stat = await fsp.stat(target);
    if (!stat.isDirectory()) throw new Error('workspace browse path is not a directory');
    const entries = await fsp.readdir(target, { withFileTypes:true });
    const results = [];
    for (const entry of entries.sort((a,b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })) {
      if (entry.name === '.git' || entry.name === '.DS_Store') continue;
      const absolute = path.join(target, entry.name);
      try {
        const lst = await fsp.lstat(absolute);
        if (lst.isSymbolicLink()) continue;
        const resolved = guard.resolveExisting(path.relative(guard.root, absolute) || '.');
        if (resolved !== guard.root && !resolved.startsWith(guard.root + path.sep)) continue;
        results.push({
          name:entry.name,
          path:path.relative(guard.root, absolute).replace(/\\/g,'/') || '.',
          type:entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        });
      } catch {}
    }
    return { root:guard.root, path:rel, entries:results };
  }

  async function inspect(relativePath) {
    const { rel, candidate } = lexicalPath(relativePath);
    try {
      const lst = await fsp.lstat(candidate);
      if (lst.isSymbolicLink()) throw new Error('symlink targets are not editable by agent transactions');
      const resolved = guard.resolveExisting(rel);
      const stat = await fsp.stat(resolved);
      if (!stat.isFile()) throw new Error('agent transaction path must be a file');
      if (stat.size > MAX_AGENT_FILE_BYTES) throw new Error('agent transaction file is too large');
      const bytes = await fsp.readFile(resolved);
      return { path: rel, exists: true, size: bytes.length, mode: stat.mode, digest: digest(bytes), bytes };
    } catch (error) {
      if (error?.code === 'ENOENT') return { path: rel, exists: false, size: 0, mode: null, digest: null, bytes: null };
      throw error;
    }
  }

  async function readText(relativePath) {
    const snap = await inspect(relativePath);
    if (!snap.exists) throw new Error(`file not found: ${snap.path}`);
    return { path: snap.path, content: snap.bytes.toString('utf8'), size: snap.size, digest: snap.digest };
  }

  async function writeBytes(relativePath, bytes, { mustExist = null, mode = null } = {}) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (buffer.length > MAX_AGENT_FILE_BYTES) throw new Error('agent transaction file is too large');
    const before = await inspect(relativePath);
    if (mustExist === true && !before.exists) throw new Error(`expected existing file: ${before.path}`);
    if (mustExist === false && before.exists) throw new Error(`destination already exists: ${before.path}`);
    const target = guard.resolveWritable(before.path);
    const parent = path.dirname(target);
    const temp = path.join(parent, `.rwacode-tx-${process.pid}-${crypto.randomUUID()}.tmp`);
    await fsp.writeFile(temp, buffer, { mode: mode || before.mode || 0o600, flag: 'wx' });
    try {
      await fsp.rename(temp, target);
      if (mode || before.mode) await fsp.chmod(target, (mode || before.mode) & 0o777).catch(() => {});
    } catch (error) {
      await fsp.rm(temp, { force: true }).catch(() => {});
      throw error;
    }
    return inspect(before.path);
  }

  async function removeFile(relativePath) {
    const before = await inspect(relativePath);
    if (!before.exists) throw new Error(`file not found: ${before.path}`);
    const target = guard.resolveExisting(before.path);
    await fsp.unlink(target);
  }

  async function renameFile(fromPath, toPath) {
    const from = await inspect(fromPath);
    if (!from.exists) throw new Error(`file not found: ${from.path}`);
    const to = await inspect(toPath);
    if (to.exists) throw new Error(`destination already exists: ${to.path}`);
    const source = guard.resolveExisting(from.path);
    const destination = guard.resolveWritable(to.path);
    await fsp.rename(source, destination);
  }

  return { id:'local', type:'local', root:guard.root, capabilities:{ list:true, read:true, search:true, write:true, create:true, rename:true, delete:true, watch:true, versioning:false, syncBack:false, commit:false }, listDirectory, inspect, readText, writeBytes, removeFile, renameFile };
}

module.exports = { createLocalWorkspaceAdapter, normalizeRelative, normalizeDirectoryRelative, MAX_AGENT_FILE_BYTES };
