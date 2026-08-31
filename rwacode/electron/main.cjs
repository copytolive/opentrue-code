'use strict';

const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, dialog } = require('electron');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { createPathGuard } = require('../lib/path-guard.cjs');

const CANONICAL_ROOT = '/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online';
const HOME_URL = 'rwacode://newtab';
const START_URL = 'https://www.google.com/';
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

let mainWindow;
let guard;
let profileStore;
let profiles = [];
let activeProfileId;
let activeTabId;
let browserBounds = { x: 292, y: 142, width: 900, height: 700 };
let previewBounds = { x: 1200, y: 142, width: 420, height: 450 };
const tabs = new Map();
let previewView = null;

function safeId(input, fallback = 'profile') {
  const normalized = String(input || fallback).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function partitionFor(profileId) {
  return `persist:rwacode-profile-${safeId(profileId)}`;
}

function profileById(id) {
  return profiles.find((profile) => profile.id === id) || null;
}

async function saveProfiles() {
  await fsp.mkdir(path.dirname(profileStore), { recursive: true });
  await fsp.writeFile(profileStore, JSON.stringify({ activeProfileId, profiles }, null, 2), { mode: 0o600 });
}

async function loadProfiles() {
  try {
    const parsed = JSON.parse(await fsp.readFile(profileStore, 'utf8'));
    profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    activeProfileId = parsed.activeProfileId;
  } catch {
    profiles = [];
  }
  if (!profiles.length) {
    const now = new Date().toISOString();
    profiles = [
      { id: 'personal', name: 'Personal', color: 'cyan', createdAt: now },
      { id: 'work', name: 'Work', color: 'violet', createdAt: now },
      { id: 'trading', name: 'Trading', color: 'gold', createdAt: now },
    ];
    activeProfileId = 'personal';
    await saveProfiles();
  }
  if (!profileById(activeProfileId)) activeProfileId = profiles[0].id;
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function configureExternalSession(ses) {
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = new Set(['clipboard-sanitized-write', 'notifications', 'fullscreen']);
    callback(allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => {
    const allowed = new Set(['clipboard-sanitized-write', 'notifications', 'fullscreen']);
    return allowed.has(permission);
  });
}

function tabSnapshot(tab) {
  const wc = tab.view.webContents;
  return {
    id: tab.id,
    profileId: tab.profileId,
    url: wc.getURL() || tab.requestedUrl || HOME_URL,
    title: wc.getTitle() || 'New Tab',
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
  };
}

function emitTabs() {
  send('browser:tabs', {
    activeTabId,
    activeProfileId,
    tabs: [...tabs.values()].filter((tab) => tab.profileId === activeProfileId).map(tabSnapshot),
  });
}

function hideAllTabs() {
  for (const tab of tabs.values()) tab.view.setVisible(false);
}

function showActiveTab() {
  hideAllTabs();
  const tab = tabs.get(activeTabId);
  if (tab && tab.profileId === activeProfileId) {
    tab.view.setBounds(browserBounds);
    tab.view.setVisible(true);
    tab.view.webContents.focus();
  }
}

function secureWebContents(wc, ses) {
  wc.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 980,
      height: 760,
      parent: mainWindow,
      autoHideMenuBar: true,
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    },
  }));
  wc.on('will-navigate', (_event, url) => {
    if (!/^https?:|^file:|^about:|^data:/i.test(url)) shell.openExternal(url).catch(() => {});
  });
}

function createTab(profileId, requestedUrl = HOME_URL, activate = true) {
  const profile = profileById(profileId);
  if (!profile) throw new Error('profile not found');
  const ses = session.fromPartition(partitionFor(profileId), { cache: true });
  configureExternalSession(ses);
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false,
    },
  });
  mainWindow.contentView.addChildView(view);
  view.setBounds(browserBounds);
  view.setVisible(false);
  const id = crypto.randomUUID();
  const tab = { id, profileId, view, requestedUrl };
  tabs.set(id, tab);
  secureWebContents(view.webContents, ses);

  const emit = () => emitTabs();
  view.webContents.on('page-title-updated', emit);
  view.webContents.on('did-start-loading', emit);
  view.webContents.on('did-stop-loading', emit);
  view.webContents.on('did-navigate', emit);
  view.webContents.on('did-navigate-in-page', emit);
  view.webContents.on('render-process-gone', (_event, details) => send('browser:crash', { tabId: id, reason: details.reason }));

  if (requestedUrl === HOME_URL) {
    view.webContents.loadURL('about:blank');
  } else {
    view.webContents.loadURL(normalizeUrl(requestedUrl));
  }
  if (activate) {
    activeTabId = id;
    showActiveTab();
  }
  emitTabs();
  return id;
}

function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  mainWindow.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  tabs.delete(tabId);
  if (activeTabId === tabId) {
    const remaining = [...tabs.values()].filter((candidate) => candidate.profileId === activeProfileId);
    activeTabId = remaining.at(-1)?.id || null;
    if (!activeTabId) createTab(activeProfileId, HOME_URL, true);
    else showActiveTab();
  }
  emitTabs();
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === HOME_URL) return HOME_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw)) return `https://${raw}`;
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
}

async function listDirectory(relativePath = '.') {
  const target = guard.resolveExisting(relativePath);
  const stat = await fsp.stat(target);
  if (!stat.isDirectory()) throw new Error('not a directory');
  const entries = await fsp.readdir(target, { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git') continue;
    const absolute = path.join(target, entry.name);
    try {
      const real = fs.realpathSync.native(absolute);
      if (real !== guard.root && !real.startsWith(guard.root + path.sep)) continue;
      results.push({
        name: entry.name,
        path: path.relative(guard.root, absolute) || '.',
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      });
    } catch {
      // Ignore broken links or inaccessible entries.
    }
  }
  return { root: guard.root, path: path.relative(guard.root, target) || '.', entries: results };
}

async function readTextFile(relativePath) {
  const target = guard.resolveExisting(relativePath);
  const stat = await fsp.stat(target);
  if (!stat.isFile()) throw new Error('not a file');
  if (stat.size > MAX_TEXT_BYTES) throw new Error('file too large');
  const content = await fsp.readFile(target, 'utf8');
  return { path: relativePath, content, size: stat.size };
}

async function writeTextFile(relativePath, content) {
  const bytes = Buffer.byteLength(String(content), 'utf8');
  if (bytes > MAX_TEXT_BYTES) throw new Error('file too large');
  const target = guard.resolveWritable(relativePath);
  await fsp.writeFile(target, String(content), { encoding: 'utf8', flag: 'w' });
  return { path: path.relative(guard.root, target), size: bytes };
}

async function createEntry(relativeParent, name, type) {
  if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') throw new Error('invalid name');
  const parent = guard.resolveExisting(relativeParent || '.');
  const target = guard.resolveWritable(path.join(path.relative(guard.root, parent), name));
  if (type === 'directory') await fsp.mkdir(target);
  else await fsp.writeFile(target, '', { flag: 'wx' });
  return { path: path.relative(guard.root, target) };
}

async function renameEntry(relativePath, newName) {
  if (!newName || newName.includes('/') || newName.includes('\\')) throw new Error('invalid name');
  const source = guard.resolveExisting(relativePath);
  if (source === guard.root) throw new Error('cannot rename root');
  const target = guard.resolveWritable(path.join(path.dirname(relativePath), newName));
  await fsp.rename(source, target);
  return { path: path.relative(guard.root, target) };
}

async function deleteEntry(relativePath) {
  const target = guard.resolveExisting(relativePath);
  if (target === guard.root) throw new Error('cannot delete root');
  await fsp.rm(target, { recursive: true, force: false });
  return { deleted: relativePath };
}

function ensurePreviewView() {
  if (previewView) return previewView;
  const ses = session.fromPartition('persist:rwacode-preview', { cache: true });
  configureExternalSession(ses);
  previewView = new WebContentsView({
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: false },
  });
  mainWindow.contentView.addChildView(previewView);
  previewView.setBounds(previewBounds);
  secureWebContents(previewView.webContents, ses);
  previewView.webContents.on('did-stop-loading', () => send('preview:state', { url: previewView.webContents.getURL(), loading: false }));
  previewView.webContents.on('did-start-loading', () => send('preview:state', { url: previewView.webContents.getURL(), loading: true }));
  previewView.webContents.loadURL('about:blank');
  return previewView;
}

function registerIpc() {
  ipcMain.handle('app:getState', async () => ({ root: guard.root, profiles, activeProfileId, version: app.getVersion() }));

  ipcMain.handle('profiles:list', async () => ({ profiles, activeProfileId }));
  ipcMain.handle('profiles:activate', async (_event, id) => {
    if (!profileById(id)) throw new Error('profile not found');
    activeProfileId = id;
    const existing = [...tabs.values()].find((tab) => tab.profileId === id);
    activeTabId = existing?.id || createTab(id, HOME_URL, false);
    await saveProfiles();
    showActiveTab();
    emitTabs();
    return { activeProfileId };
  });
  ipcMain.handle('profiles:add', async (_event, name) => {
    const base = safeId(name, 'profile');
    let id = base;
    let suffix = 2;
    while (profileById(id)) id = `${base}-${suffix++}`;
    profiles.push({ id, name: String(name || 'Profile').trim() || 'Profile', color: 'cyan', createdAt: new Date().toISOString() });
    activeProfileId = id;
    await saveProfiles();
    activeTabId = createTab(id, HOME_URL, false);
    showActiveTab();
    emitTabs();
    return { profiles, activeProfileId };
  });
  ipcMain.handle('profiles:rename', async (_event, id, name) => {
    const profile = profileById(id);
    if (!profile) throw new Error('profile not found');
    profile.name = String(name || '').trim() || profile.name;
    await saveProfiles();
    return { profiles, activeProfileId };
  });
  ipcMain.handle('profiles:clear', async (_event, id) => {
    if (!profileById(id)) throw new Error('profile not found');
    await session.fromPartition(partitionFor(id)).clearStorageData();
    return { cleared: id };
  });
  ipcMain.handle('profiles:delete', async (_event, id) => {
    if (profiles.length <= 1) throw new Error('at least one profile is required');
    if (!profileById(id)) throw new Error('profile not found');
    for (const tab of [...tabs.values()].filter((candidate) => candidate.profileId === id)) closeTab(tab.id);
    await session.fromPartition(partitionFor(id)).clearStorageData();
    profiles = profiles.filter((profile) => profile.id !== id);
    if (activeProfileId === id) activeProfileId = profiles[0].id;
    await saveProfiles();
    const existing = [...tabs.values()].find((tab) => tab.profileId === activeProfileId);
    activeTabId = existing?.id || createTab(activeProfileId, HOME_URL, false);
    showActiveTab();
    emitTabs();
    return { profiles, activeProfileId };
  });

  ipcMain.handle('browser:newTab', async (_event, url = HOME_URL) => ({ tabId: createTab(activeProfileId, url, true) }));
  ipcMain.handle('browser:switchTab', async (_event, tabId) => {
    const tab = tabs.get(tabId);
    if (!tab || tab.profileId !== activeProfileId) throw new Error('tab not found');
    activeTabId = tabId;
    showActiveTab();
    emitTabs();
    return tabSnapshot(tab);
  });
  ipcMain.handle('browser:closeTab', async (_event, tabId) => closeTab(tabId));
  ipcMain.handle('browser:navigate', async (_event, value) => {
    const tab = tabs.get(activeTabId);
    if (!tab) throw new Error('no active tab');
    const url = normalizeUrl(value);
    tab.requestedUrl = url;
    if (url === HOME_URL) await tab.view.webContents.loadURL('about:blank');
    else await tab.view.webContents.loadURL(url);
    emitTabs();
    return { url };
  });
  ipcMain.handle('browser:back', async () => tabs.get(activeTabId)?.view.webContents.navigationHistory.goBack());
  ipcMain.handle('browser:forward', async () => tabs.get(activeTabId)?.view.webContents.navigationHistory.goForward());
  ipcMain.handle('browser:reload', async () => tabs.get(activeTabId)?.view.webContents.reload());
  ipcMain.handle('browser:home', async () => {
    const tab = tabs.get(activeTabId);
    if (tab) await tab.view.webContents.loadURL('about:blank');
  });
  ipcMain.handle('browser:setBounds', async (_event, bounds) => {
    browserBounds = clampBounds(bounds);
    showActiveTab();
    return browserBounds;
  });

  ipcMain.handle('fs:list', async (_event, relativePath = '.') => listDirectory(relativePath));
  ipcMain.handle('fs:read', async (_event, relativePath) => readTextFile(relativePath));
  ipcMain.handle('fs:write', async (_event, relativePath, content) => writeTextFile(relativePath, content));
  ipcMain.handle('fs:create', async (_event, parent, name, type = 'file') => createEntry(parent, name, type));
  ipcMain.handle('fs:rename', async (_event, relativePath, newName) => renameEntry(relativePath, newName));
  ipcMain.handle('fs:delete', async (_event, relativePath) => deleteEntry(relativePath));
  ipcMain.handle('fs:reveal', async (_event, relativePath) => {
    const target = guard.resolveExisting(relativePath);
    shell.showItemInFolder(target);
    return true;
  });

  ipcMain.handle('preview:setBounds', async (_event, bounds) => {
    previewBounds = clampBounds(bounds);
    ensurePreviewView().setBounds(previewBounds);
    return previewBounds;
  });
  ipcMain.handle('preview:load', async (_event, value) => {
    const url = normalizeUrl(value);
    if (url === HOME_URL) throw new Error('preview requires a URL');
    await ensurePreviewView().webContents.loadURL(url);
    return { url };
  });
  ipcMain.handle('preview:reload', async () => ensurePreviewView().webContents.reload());
  ipcMain.handle('preview:openExternal', async () => {
    const url = ensurePreviewView().webContents.getURL();
    if (/^https?:/i.test(url)) await shell.openExternal(url);
    return { url };
  });

  ipcMain.handle('dialog:confirmDelete', async (_event, relativePath) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning', buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0,
      message: `Delete ${relativePath}?`, detail: 'This cannot be undone by RWACode.',
    });
    return result.response === 1;
  });
}

function clampBounds(input = {}) {
  const width = Math.max(1, Math.floor(Number(input.width) || 1));
  const height = Math.max(1, Math.floor(Number(input.height) || 1));
  const x = Math.max(0, Math.floor(Number(input.x) || 0));
  const y = Math.max(0, Math.floor(Number(input.y) || 0));
  return { x, y, width, height };
}

async function createWindow() {
  guard = createPathGuard(CANONICAL_ROOT);
  profileStore = path.join(app.getPath('userData'), 'profiles.json');
  await loadProfiles();
  mainWindow = new BrowserWindow({
    title: 'RWACode', width: 1728, height: 1080, minWidth: 1180, minHeight: 760,
    backgroundColor: '#07090d', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  await mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  createTab(activeProfileId, HOME_URL, true);
  ensurePreviewView();
  mainWindow.on('resize', () => send('window:resized'));
  mainWindow.on('closed', () => {
    for (const tab of tabs.values()) tab.view.webContents.close();
    tabs.clear();
    previewView?.webContents.close();
    previewView = null;
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
  app.on('activate', async () => { if (BrowserWindow.getAllWindows().length === 0) await createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
