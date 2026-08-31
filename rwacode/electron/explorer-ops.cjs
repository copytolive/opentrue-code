'use strict';

const { ipcMain, shell, clipboard } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createPathGuard } = require('../lib/path-guard.cjs');

const CANONICAL_ROOT = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tif', '.tiff', '.pdf']);
let explorerClipboard = null;
let guard = null;

function pathGuard() {
  if (!guard) guard = createPathGuard(CANONICAL_ROOT);
  return guard;
}

function relativeFromAbsolute(absolute) {
  const g = pathGuard();
  return path.relative(g.root, absolute) || '.';
}

async function selectedInfo(relativePath = '.') {
  const g = pathGuard();
  const absolute = g.resolveExisting(relativePath || '.');
  const stat = await fsp.stat(absolute);
  return {
    absolute,
    relative: relativeFromAbsolute(absolute),
    type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
  };
}

function uniqueDestination(parentAbsolute, sourceName) {
  const extension = path.extname(sourceName);
  const stem = extension ? sourceName.slice(0, -extension.length) : sourceName;
  let candidate = path.join(parentAbsolute, sourceName);
  let index = 1;
  while (fs.existsSync(candidate)) {
    const suffix = index === 1 ? ' copy' : ` copy ${index}`;
    candidate = path.join(parentAbsolute, `${stem}${suffix}${extension}`);
    index += 1;
  }
  return candidate;
}

async function assertTreeHasNoSymlinks(absolute) {
  const stat = await fsp.lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error('copying symbolic links is not allowed');
  if (!stat.isDirectory()) return;
  for (const entry of await fsp.readdir(absolute, { withFileTypes: true })) {
    await assertTreeHasNoSymlinks(path.join(absolute, entry.name));
  }
}

function openFixedMacApp(appName, absolute) {
  if (process.platform !== 'darwin') return false;
  const child = spawn('/usr/bin/open', ['-a', appName, absolute], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return true;
}

ipcMain.handle('fs:copyPath', async (_event, relativePath, kind = 'absolute') => {
  const info = await selectedInfo(relativePath);
  const value = kind === 'relative' ? info.relative : info.absolute;
  clipboard.writeText(value);
  return { value, kind };
});

ipcMain.handle('fs:openImagePreview', async (_event, relativePath) => {
  const info = await selectedInfo(relativePath);
  if (info.type !== 'file') throw new Error('select an image file first');
  const extension = path.extname(info.absolute).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error('selected file is not an image/preview document');
  if (!openFixedMacApp('Preview', info.absolute)) {
    const error = await shell.openPath(info.absolute);
    if (error) throw new Error(error);
  }
  return { path: info.relative };
});

ipcMain.handle('fs:openTerminal', async (_event, relativePath = '.') => {
  const info = await selectedInfo(relativePath || '.');
  const directory = info.type === 'directory' ? info.absolute : path.dirname(info.absolute);
  if (process.platform === 'darwin') {
    openFixedMacApp('Terminal', directory);
  } else {
    await shell.openPath(directory);
  }
  return { path: relativeFromAbsolute(directory) };
});

ipcMain.handle('fs:clipboardSet', async (_event, relativePath, mode = 'copy') => {
  if (!['copy', 'cut'].includes(mode)) throw new Error('invalid clipboard mode');
  const info = await selectedInfo(relativePath);
  if (info.relative === '.') throw new Error('cannot copy or cut workspace root');
  explorerClipboard = { path: info.relative, type: info.type, mode };
  return { ...explorerClipboard };
});

ipcMain.handle('fs:clipboardState', async () => explorerClipboard ? { ...explorerClipboard } : null);

ipcMain.handle('fs:clipboardPaste', async (_event, destinationRelative = '.') => {
  if (!explorerClipboard) throw new Error('Explorer clipboard is empty');
  const g = pathGuard();
  const source = g.resolveExisting(explorerClipboard.path);
  const sourceStat = await fsp.stat(source);
  const destinationInfo = await selectedInfo(destinationRelative || '.');
  if (destinationInfo.type !== 'directory') throw new Error('paste destination must be a folder');
  await assertTreeHasNoSymlinks(source);

  const targetLexical = uniqueDestination(destinationInfo.absolute, path.basename(source));
  const targetRelative = path.relative(g.root, targetLexical);
  const target = g.resolveWritable(targetRelative);

  if (explorerClipboard.mode === 'cut') {
    await fsp.rename(source, target);
    explorerClipboard = null;
  } else if (sourceStat.isDirectory()) {
    await fsp.cp(source, target, { recursive: true, errorOnExist: true, force: false, dereference: false });
  } else {
    await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL);
  }

  return { path: relativeFromAbsolute(target), mode: explorerClipboard ? 'copy' : 'cut-complete' };
});
