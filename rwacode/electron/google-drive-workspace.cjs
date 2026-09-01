'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createLocalWorkspaceAdapter, normalizeRelative } = require('./workspace-adapter.cjs');

const MAX_DRIVE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DRIVE_FILES = 2600;
const NATIVE_STUB_EXTENSIONS = new Set(['.gdoc','.gsheet','.gslides','.gdraw','.gform','.gmap','.gsite']);
const TEXT_EXTENSIONS = new Set([
  '.txt','.md','.markdown','.js','.mjs','.cjs','.jsx','.ts','.tsx','.json','.jsonc','.css','.scss','.sass','.less','.html','.htm','.xml','.svg',
  '.yml','.yaml','.toml','.ini','.cfg','.conf','.env','.properties','.sh','.bash','.zsh','.fish','.py','.rb','.php','.java','.kt','.kts','.go','.rs',
  '.c','.h','.cc','.cpp','.hpp','.cs','.sql','.graphql','.gql','.vue','.svelte','.astro','.csv','.tsv','.log','.command'
]);
const SKIP_DIRS = new Set(['.git','node_modules','dist','build','.next','.cache','.parcel-cache','.turbo','coverage']);

function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function safeSegment(value) { return String(value || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'drive'; }
function isInside(root, candidate) { const rel = path.relative(root, candidate); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); }
function isNativeWorkspaceStub(filePath) { return NATIVE_STUB_EXTENSIONS.has(path.extname(filePath).toLowerCase()); }
function isSupportedText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || (!ext && path.basename(filePath).startsWith('.'));
}

async function canonicalExistingDirectory(input) {
  try {
    const stat = await fsp.stat(input);
    if (!stat.isDirectory()) return null;
    return await fsp.realpath(input);
  } catch { return null; }
}

async function findGoogleDriveRoots({ home = os.homedir(), extraRoots = [] } = {}) {
  const candidates = [...extraRoots];
  const cloudStorage = path.join(home, 'Library', 'CloudStorage');
  try {
    for (const entry of await fsp.readdir(cloudStorage, { withFileTypes:true })) {
      if (entry.isDirectory() && /^GoogleDrive-/i.test(entry.name)) candidates.push(path.join(cloudStorage, entry.name));
    }
  } catch {}
  candidates.push(path.join(home, 'Google Drive'));
  try {
    for (const entry of await fsp.readdir('/Volumes', { withFileTypes:true })) {
      if (entry.isDirectory() && /^GoogleDrive/i.test(entry.name)) candidates.push(path.join('/Volumes', entry.name));
    }
  } catch {}
  const roots = [];
  for (const candidate of candidates) {
    const resolved = await canonicalExistingDirectory(path.resolve(String(candidate || '')));
    if (resolved && !roots.includes(resolved)) roots.push(resolved);
  }
  return roots;
}

async function resolveDriveLocator(locator, roots) {
  const raw = String(locator || '').trim();
  if (!raw) throw new Error('@GoogleDrive requires a file/folder path inside Google Drive for desktop');
  const expanded = raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw;
  const candidates = [];
  if (path.isAbsolute(expanded)) candidates.push(path.resolve(expanded));
  else for (const root of roots) candidates.push(path.resolve(root, expanded));
  const matches = [];
  for (const candidate of candidates) {
    let resolved;
    try { resolved = await fsp.realpath(candidate); } catch { continue; }
    if (!roots.some((root) => isInside(root, resolved))) continue;
    if (!matches.includes(resolved)) matches.push(resolved);
  }
  if (!matches.length) throw new Error('Google Drive path was not found inside an official Drive for desktop mount');
  if (matches.length > 1) throw new Error('Google Drive path is ambiguous across multiple mounted accounts; use an absolute path');
  return matches[0];
}

async function snapshotAbsolute(filePath, { allowMissing = true } = {}) {
  let stat;
  try { stat = await fsp.lstat(filePath); } catch (error) {
    if (allowMissing && error && error.code === 'ENOENT') return { exists:false, bytes:null, size:0, mode:null, mtimeMs:null, digest:null };
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error(`Google Drive symlink is not editable: ${filePath}`);
  if (!stat.isFile()) throw new Error(`Google Drive source is not a regular file: ${filePath}`);
  if (isNativeWorkspaceStub(filePath)) throw new Error('Native Google Docs/Sheets/Slides files are not exposed as local text edits; use a dedicated native document adapter');
  if (!isSupportedText(filePath)) throw new Error(`Unsupported Google Drive source type: ${path.extname(filePath) || '(no extension)'}`);
  if (stat.size > MAX_DRIVE_FILE_BYTES) throw new Error(`Google Drive text file exceeds ${MAX_DRIVE_FILE_BYTES} bytes: ${filePath}`);
  const bytes = await fsp.readFile(filePath);
  return { exists:true, bytes, size:bytes.length, mode:stat.mode, mtimeMs:stat.mtimeMs, digest:digest(bytes) };
}

async function listSourceFiles(sourcePath) {
  const stat = await fsp.lstat(sourcePath);
  if (stat.isSymbolicLink()) throw new Error('Google Drive source symlinks are not supported');
  if (stat.isFile()) {
    await snapshotAbsolute(sourcePath, { allowMissing:false });
    return [{ relative:path.basename(sourcePath), absolute:sourcePath }];
  }
  if (!stat.isDirectory()) throw new Error('Google Drive source must be a regular file or folder');
  const files = [];
  const queue = [{ absolute:sourcePath, relative:'' }];
  while (queue.length && files.length < MAX_DRIVE_FILES) {
    const current = queue.shift();
    const entries = await fsp.readdir(current.absolute, { withFileTypes:true });
    entries.sort((a,b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_DRIVE_FILES) break;
      const absolute = path.join(current.absolute, entry.name);
      const relative = current.relative ? path.join(current.relative, entry.name) : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push({ absolute, relative });
        continue;
      }
      if (!entry.isFile() || isNativeWorkspaceStub(entry.name) || !isSupportedText(entry.name)) continue;
      await snapshotAbsolute(absolute, { allowMissing:false });
      files.push({ relative:normalizeRelative(relative), absolute });
    }
  }
  if (!files.length) throw new Error('Google Drive source contains no supported text files');
  return files;
}

async function atomicWrite(filePath, bytes, mode = null) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true, mode:0o700 });
  const temp = path.join(path.dirname(filePath), `.rwacode-drive-${process.pid}-${crypto.randomUUID()}.tmp`);
  await fsp.writeFile(temp, bytes, { mode:mode || 0o600 });
  await fsp.rename(temp, filePath);
  if (mode) await fsp.chmod(filePath, mode).catch(() => {});
}

function sameSnapshot(a, b) { return Boolean(a?.exists) === Boolean(b?.exists) && (!a?.exists || a.digest === b.digest); }

function createGoogleDriveWorkspaceManager({ stateRoot, driveRoots = null, home = os.homedir() } = {}) {
  if (!stateRoot) throw new Error('Google Drive workspace manager requires stateRoot');
  const syncRecords = new Map();

  async function roots() { return driveRoots ? findGoogleDriveRoots({ home, extraRoots:driveRoots }) : findGoogleDriveRoots({ home }); }

  async function mount({ locator } = {}) {
    const availableRoots = await roots();
    if (!availableRoots.length) throw new Error('Google Drive for desktop is not mounted; sign in with the official Google Drive desktop app first');
    const sourcePath = await resolveDriveLocator(locator, availableRoots);
    const sourceStat = await fsp.lstat(sourcePath);
    if (sourceStat.isSymbolicLink()) throw new Error('Google Drive source symlinks are not supported');
    if (sourceStat.isFile() && isNativeWorkspaceStub(sourcePath)) throw new Error('Native Google Docs/Sheets/Slides are not supported as local text files');

    const key = digest(Buffer.from(sourcePath)).slice(0, 16);
    const workspaceBase = path.join(path.resolve(stateRoot), 'google-drive', `${safeSegment(path.basename(sourcePath))}-${key}`);
    const mirrorRoot = path.join(workspaceBase, 'mirror');
    const statePath = path.join(workspaceBase, 'state.json');
    await fsp.mkdir(workspaceBase, { recursive:true, mode:0o700 });

    let previous = null;
    try { previous = JSON.parse(await fsp.readFile(statePath, 'utf8')); } catch {}
    if (previous?.sourcePath === sourcePath && fs.existsSync(mirrorRoot)) {
      const dirty = [];
      for (const [relative, meta] of Object.entries(previous.files || {})) {
        const current = await snapshotAbsolute(path.join(mirrorRoot, relative)).catch(() => ({ exists:false }));
        if (!sameSnapshot(current, meta.mirror)) dirty.push(relative);
      }
      const mirrorEntries = await listMirrorFiles(mirrorRoot);
      for (const relative of mirrorEntries) if (!previous.files?.[relative]) dirty.push(relative);
      if (dirty.length) throw new Error(`managed Google Drive mirror has unsynced changes: ${[...new Set(dirty)].slice(0,6).join(', ')}`);
    }

    const sourceFiles = await listSourceFiles(sourcePath);
    await fsp.rm(mirrorRoot, { recursive:true, force:true });
    await fsp.mkdir(mirrorRoot, { recursive:true, mode:0o700 });
    const manifest = { version:1, sourcePath, sourceKind:sourceStat.isFile() ? 'file' : 'folder', mountedAt:new Date().toISOString(), files:{} };
    for (const item of sourceFiles) {
      const sourceSnapshot = await snapshotAbsolute(item.absolute, { allowMissing:false });
      const target = path.join(mirrorRoot, item.relative);
      await atomicWrite(target, sourceSnapshot.bytes, sourceSnapshot.mode);
      const mirrorSnapshot = await snapshotAbsolute(target, { allowMissing:false });
      manifest.files[item.relative] = {
        relative:item.relative,
        sourcePath:item.absolute,
        source:{ exists:true, size:sourceSnapshot.size, mode:sourceSnapshot.mode, mtimeMs:sourceSnapshot.mtimeMs, digest:sourceSnapshot.digest },
        mirror:{ exists:true, size:mirrorSnapshot.size, mode:mirrorSnapshot.mode, mtimeMs:mirrorSnapshot.mtimeMs, digest:mirrorSnapshot.digest },
      };
    }
    await fsp.writeFile(statePath, JSON.stringify(manifest, null, 2) + '\n', { mode:0o600 });

    const local = createLocalWorkspaceAdapter({ root:mirrorRoot });
    const resolveSourcePath = (relative) => {
      const clean = normalizeRelative(relative);
      if (manifest.sourceKind === 'file') {
        if (clean !== path.basename(sourcePath)) throw new Error('single-file Google Drive workspace cannot address another path');
        return sourcePath;
      }
      const candidate = path.resolve(sourcePath, clean);
      if (!isInside(sourcePath, candidate)) throw new Error('Google Drive source path escapes the mounted folder');
      return candidate;
    };

    async function sourceState() {
      const changedPaths = [];
      const externalChanged = [];
      for (const relative of new Set([...Object.keys(manifest.files), ...(await listMirrorFiles(mirrorRoot))])) {
        const base = manifest.files[relative];
        const mirror = await snapshotAbsolute(path.join(mirrorRoot, relative)).catch(() => ({ exists:false }));
        if (!base || !sameSnapshot(mirror, base.mirror)) changedPaths.push(relative);
        const source = await snapshotAbsolute(resolveSourcePath(relative)).catch(() => ({ exists:false }));
        if (!base || !sameSnapshot(source, base.source)) externalChanged.push(relative);
      }
      return {
        type:'googledrive',
        sourcePath,
        mirrorRoot,
        dirty:changedPaths.length > 0,
        changedPaths,
        externalChanged,
        syncedTransactions:[...syncRecords.keys()],
        mode:'drive-for-desktop-managed-mirror',
      };
    }

    async function syncBack({ transactionId, paths = [] } = {}) {
      const id = String(transactionId || '').trim();
      if (!id) throw new Error('Google Drive sync requires a transaction id');
      const touched = [...new Set((Array.isArray(paths) ? paths : []).map(normalizeRelative))];
      if (!touched.length) throw new Error('Google Drive sync requires transaction paths');
      if (syncRecords.has(id)) throw new Error('this transaction is already synced to Google Drive');
      const before = new Map();
      const after = new Map();
      for (const relative of touched) {
        const sourceTarget = resolveSourcePath(relative);
        const expected = manifest.files[relative]?.source || { exists:false };
        const current = await snapshotAbsolute(sourceTarget);
        if (!sameSnapshot(current, expected)) throw new Error(`Google Drive sync conflict: ${relative} changed outside RWACode`);
        before.set(relative, { ...current, bytes:current.bytes ? Buffer.from(current.bytes) : null, sourcePath:sourceTarget });
      }
      for (const relative of touched) {
        const sourceTarget = resolveSourcePath(relative);
        const mirror = await snapshotAbsolute(path.join(mirrorRoot, relative));
        if (mirror.exists) await atomicWrite(sourceTarget, mirror.bytes, mirror.mode);
        else await fsp.rm(sourceTarget, { force:true });
        const current = await snapshotAbsolute(sourceTarget);
        after.set(relative, { ...current, bytes:current.bytes ? Buffer.from(current.bytes) : null, sourcePath:sourceTarget });
      }
      syncRecords.set(id, { transactionId:id, touched, before, after, syncedAt:new Date().toISOString() });
      return { ...(await sourceState()), transactionId:id, synced:true, touched };
    }

    async function assertRollbackSync({ transactionId } = {}) {
      const record = syncRecords.get(String(transactionId || ''));
      if (!record) return { synced:false };
      for (const relative of record.touched) {
        const current = await snapshotAbsolute(record.after.get(relative).sourcePath);
        if (!sameSnapshot(current, record.after.get(relative))) throw new Error(`Google Drive undo conflict: ${relative} changed after sync`);
      }
      return { synced:true };
    }

    async function rollbackSync({ transactionId } = {}) {
      const id = String(transactionId || '');
      const record = syncRecords.get(id);
      if (!record) return { ...(await sourceState()), synced:false };
      await assertRollbackSync({ transactionId:id });
      for (const relative of [...record.touched].reverse()) {
        const desired = record.before.get(relative);
        if (desired.exists) await atomicWrite(desired.sourcePath, desired.bytes, desired.mode);
        else await fsp.rm(desired.sourcePath, { force:true });
      }
      syncRecords.delete(id);
      return { ...(await sourceState()), synced:false, rolledBackTransactionId:id };
    }

    function hasSyncedTransaction(transactionId) { return syncRecords.has(String(transactionId || '')); }

    const adapter = {
      ...local,
      id:`googledrive:${key}`,
      type:'googledrive',
      root:mirrorRoot,
      capabilities:{ ...local.capabilities, watch:false, versioning:true, syncBack:true, commit:false, nativeGoogleWorkspaceFiles:false },
      source:{ type:'googledrive', sourcePath, sourceKind:manifest.sourceKind, mode:'drive-for-desktop-managed-mirror' },
      sourceState,
      syncBack,
      assertRollbackSync,
      rollbackSync,
      hasSyncedTransaction,
    };
    return { adapter, sourcePath, mirrorRoot };
  }

  async function availability() {
    const availableRoots = await roots();
    return { available:availableRoots.length > 0, mode:'google-drive-for-desktop-mounted-files', roots:availableRoots, nativeGoogleWorkspaceFiles:false };
  }

  return { mount, availability };
}

async function listMirrorFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const queue = [{ absolute:root, relative:'' }];
  while (queue.length && files.length < MAX_DRIVE_FILES) {
    const current = queue.shift();
    const entries = await fsp.readdir(current.absolute, { withFileTypes:true }).catch(() => []);
    entries.sort((a,b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_DRIVE_FILES) break;
      const absolute = path.join(current.absolute, entry.name);
      const relative = current.relative ? path.join(current.relative, entry.name) : entry.name;
      if (entry.isDirectory()) queue.push({ absolute, relative });
      else if (entry.isFile()) files.push(normalizeRelative(relative));
    }
  }
  return files;
}

module.exports = {
  createGoogleDriveWorkspaceManager,
  findGoogleDriveRoots,
  resolveDriveLocator,
  snapshotAbsolute,
  listSourceFiles,
  isNativeWorkspaceStub,
  isSupportedText,
  NATIVE_STUB_EXTENSIONS,
  TEXT_EXTENSIONS,
};
