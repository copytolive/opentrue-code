'use strict';

const { ipcMain, shell, clipboard, Menu, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createPathGuard } = require('../lib/path-guard.cjs');

const CANONICAL_ROOT = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tif', '.tiff', '.pdf']);
const TEXT_EXTENSIONS = new Set([
  '.js','.jsx','.ts','.tsx','.cjs','.mjs','.json','.md','.mdx','.txt','.css','.scss','.less','.html','.htm','.xml',
  '.yaml','.yml','.toml','.ini','.env','.py','.go','.rs','.java','.kt','.kts','.swift','.sql','.sh','.bash','.zsh','.fish',
  '.vue','.svelte','.astro','.rb','.php','.cs','.cpp','.cc','.c','.h','.hpp','.proto','.graphql','.gql','.csv','.tsv',
]);
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

function isTextCandidate(absolute) {
  const base = path.basename(absolute);
  if (!base.includes('.')) return /^(Dockerfile|Makefile|Procfile|LICENSE|NOTICE|README)$/i.test(base);
  return TEXT_EXTENSIONS.has(path.extname(base).toLowerCase());
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

ipcMain.handle('explorer:contextMenu', async (event, relativePath) => {
  const info = await selectedInfo(relativePath);
  if (!['file', 'directory'].includes(info.type)) throw new Error('context menu requires a file or folder');

  const isFile = info.type === 'file';
  const isFolder = info.type === 'directory';
  const isImage = isFile && IMAGE_EXTENSIONS.has(path.extname(info.absolute).toLowerCase());
  const canChat = isFolder || (isFile && isTextCandidate(info.absolute));
  const canPaste = Boolean(explorerClipboard);
  let selectedAction = null;

  const choose = (action) => () => { selectedAction = action; };
  const template = [
    { label: 'New File…', click: choose('new-file') },
    { label: 'New Folder…', click: choose('new-folder') },
    { type: 'separator' },
    { label: 'Reveal in Finder', accelerator: 'Alt+Cmd+R', click: choose('reveal') },
    ...(isImage ? [{ label: 'Open in Images Preview', click: choose('open-image') }] : []),
    { label: 'Open in Terminal', click: choose('open-terminal') },
    ...(isFolder ? [{ label: 'Find in Folder…', accelerator: 'Alt+Shift+F', click: choose('find-folder') }] : []),
    { type: 'separator' },
    { label: isFolder ? 'Add Folder to Chat' : 'Add File to Chat', enabled: canChat, click: choose('add-chat') },
    { type: 'separator' },
    { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: choose('cut') },
    { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: choose('copy') },
    { label: 'Paste', accelerator: 'CmdOrCtrl+V', enabled: canPaste, click: choose('paste') },
    { type: 'separator' },
    { label: 'Copy Path', accelerator: 'Alt+Cmd+C', click: choose('copy-path') },
    { label: 'Copy Relative Path', accelerator: 'Alt+Shift+Cmd+C', click: choose('copy-relative') },
    { type: 'separator' },
    { label: 'Rename…', click: choose('rename') },
    { label: 'Delete', click: choose('delete') },
  ];

  const menu = Menu.buildFromTemplate(template);
  const owner = BrowserWindow.fromWebContents(event.sender) || undefined;

  return new Promise((resolve) => {
    menu.popup({
      window: owner,
      callback: () => resolve({ action: selectedAction, path: info.relative, type: info.type }),
    });
  });
});

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
