'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rwacode', {
  app: {
    getState: () => ipcRenderer.invoke('app:getState'),
    onResize: (handler) => ipcRenderer.on('window:resized', () => handler()),
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'), activate: (id) => ipcRenderer.invoke('profiles:activate', id), add: (name) => ipcRenderer.invoke('profiles:add', name), rename: (id, name) => ipcRenderer.invoke('profiles:rename', id, name), clear: (id) => ipcRenderer.invoke('profiles:clear', id), delete: (id) => ipcRenderer.invoke('profiles:delete', id),
  },
  browser: {
    newTab: (url) => ipcRenderer.invoke('browser:newTab', url), switchTab: (id) => ipcRenderer.invoke('browser:switchTab', id), closeTab: (id) => ipcRenderer.invoke('browser:closeTab', id), navigate: (value) => ipcRenderer.invoke('browser:navigate', value), back: () => ipcRenderer.invoke('browser:back'), forward: () => ipcRenderer.invoke('browser:forward'), reload: () => ipcRenderer.invoke('browser:reload'), home: () => ipcRenderer.invoke('browser:home'), openExternal: (value) => ipcRenderer.invoke('browser:openExternal', value), setBounds: (bounds) => ipcRenderer.invoke('browser:setBounds', bounds), setVisible: (visible) => ipcRenderer.invoke('browser:setVisible', visible), onTabs: (handler) => ipcRenderer.on('browser:tabs', (_event, state) => handler(state)), onCrash: (handler) => ipcRenderer.on('browser:crash', (_event, state) => handler(state)),
  },
  explorer: { showContextMenu: (relativePath) => ipcRenderer.invoke('explorer:contextMenu', relativePath) },
  files: {
    list: (relativePath) => ipcRenderer.invoke('fs:list', relativePath), read: (relativePath) => ipcRenderer.invoke('fs:read', relativePath), write: (relativePath, content) => ipcRenderer.invoke('fs:write', relativePath, content), create: (parent, name, type) => ipcRenderer.invoke('fs:create', parent, name, type), rename: (relativePath, newName) => ipcRenderer.invoke('fs:rename', relativePath, newName), delete: (relativePath) => ipcRenderer.invoke('fs:delete', relativePath), reveal: (relativePath) => ipcRenderer.invoke('fs:reveal', relativePath), copyPath: (relativePath, kind) => ipcRenderer.invoke('fs:copyPath', relativePath, kind), openImagePreview: (relativePath) => ipcRenderer.invoke('fs:openImagePreview', relativePath), openTerminal: (relativePath) => ipcRenderer.invoke('fs:openTerminal', relativePath), clipboardSet: (relativePath, mode) => ipcRenderer.invoke('fs:clipboardSet', relativePath, mode), clipboardState: () => ipcRenderer.invoke('fs:clipboardState'), clipboardPaste: (destinationRelative) => ipcRenderer.invoke('fs:clipboardPaste', destinationRelative), confirmDelete: (relativePath) => ipcRenderer.invoke('dialog:confirmDelete', relativePath), onChanged: (handler) => ipcRenderer.on('fs:changed', (_event, state) => handler(state)), onWatchError: (handler) => ipcRenderer.on('fs:watch-error', (_event, state) => handler(state)),
  },
  agent: {
    status: (source) => ipcRenderer.invoke('agent:getStatus', source),
    browse: (source, relativePath) => ipcRenderer.invoke('agent:browse', source, relativePath),
    readTarget: (source, relativePath) => ipcRenderer.invoke('agent:readTarget', source, relativePath),
    plan: (task, options) => ipcRenderer.invoke('agent:plan', task, options),
    apply: (id) => ipcRenderer.invoke('agent:apply', id), undo: (id) => ipcRenderer.invoke('agent:undo', id),
    githubAction: (id, action, payload) => ipcRenderer.invoke('agent:githubAction', id, action, payload), driveAction: (id, action, payload) => ipcRenderer.invoke('agent:driveAction', id, action, payload), invalidate: () => ipcRenderer.invoke('agent:invalidate'), onChanged: (handler) => ipcRenderer.on('agent:changed', (_event, state) => handler(state)),
  },
  preview: {
    setBounds: (bounds) => ipcRenderer.invoke('preview:setBounds', bounds), load: (value) => ipcRenderer.invoke('preview:load', value), reload: () => ipcRenderer.invoke('preview:reload'), openExternal: () => ipcRenderer.invoke('preview:openExternal'), onState: (handler) => ipcRenderer.on('preview:state', (_event, state) => handler(state)),
  },
});

// CI packaged smoke must prove the same privileged IPC path used by the visible
// buttons, not merely that the BrowserWindow painted. This never runs in normal use.
if (process.env.RWACODE_CI_SMOKE === '1') {
  ipcRenderer.invoke('app:getState').then((state) => {
    ipcRenderer.send('rwacode:ci-renderer-ready', { version: state?.version || '' });
  }).catch(() => {});
}
