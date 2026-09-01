'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SHELL_ENTRY = pathToFileURL(path.join(__dirname, '..', 'src', 'index.html')).href;
let trustedSenderId = null;
let guardInstalled = false;

function normalizeFrameUrl(value) {
  try { const parsed = new URL(String(value || '')); parsed.hash = ''; parsed.search = ''; return parsed.href; } catch { return ''; }
}
function hasTrustedShellPreload(webContents) {
  const prefs = webContents?.getLastWebPreferences?.() || {};
  return String(prefs.preload || '').endsWith(`${path.sep}preload.cjs`);
}
function isBrowserWindowSender(webContents) {
  try {
    const owner = webContents ? BrowserWindow.fromWebContents(webContents) : null;
    return Boolean(owner && !owner.isDestroyed());
  } catch {
    return false;
  }
}
function assertTrustedIpc(event) {
  const webContents = event?.sender;
  if (!webContents || !isBrowserWindowSender(webContents)) throw new Error('RWACode IPC rejected: untrusted sender');
  const frameUrl = normalizeFrameUrl(event?.senderFrame?.url || webContents.getURL?.());
  if (frameUrl !== normalizeFrameUrl(SHELL_ENTRY)) throw new Error('RWACode IPC rejected: untrusted frame');
  // The exact local shell frame inside a BrowserWindow is the privileged boundary.
  // Packaged Electron does not reliably expose preload metadata from event.sender,
  // so preload identity is used for proactive hardening, not as the runtime IPC key.
  // Provider and Preview surfaces are WebContentsView instances and fail this check.
  if (!trustedSenderId) trustedSenderId = webContents.id;
  if (webContents.id !== trustedSenderId) throw new Error('RWACode IPC rejected: untrusted sender');
}
function installIpcGuard() {
  if (guardInstalled) return;
  guardInstalled = true;
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => originalHandle(channel, async (event, ...args) => {
    assertTrustedIpc(event);
    return listener(event, ...args);
  });
}
function hardenShellWindow(win) {
  const wc = win?.webContents;
  if (!wc || wc.isDestroyed() || !hasTrustedShellPreload(wc)) return;
  // A newly-created genuine shell supersedes a destroyed/previous shell sender.
  // External/provider windows do not have RWACode's preload and cannot register.
  trustedSenderId = wc.id;
  const allowShellEntry = (event, url) => {
    if (normalizeFrameUrl(url) !== normalizeFrameUrl(SHELL_ENTRY)) {
      event.preventDefault();
      if (/^https?:/i.test(String(url || ''))) shell.openExternal(url).catch(() => {});
    }
  };
  wc.on('will-navigate', allowShellEntry);
  wc.on('will-redirect', allowShellEntry);
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(String(url || ''))) shell.openExternal(url).catch(() => {});
    return { action:'deny' };
  });
}
function installShellWindowGuard() {
  app.on('browser-window-created', (_event, win) => hardenShellWindow(win));
}

module.exports = { installIpcGuard, installShellWindowGuard, hardenShellWindow, assertTrustedIpc, SHELL_ENTRY };
