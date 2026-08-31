'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rwacode', {
  app: {
    getState: () => ipcRenderer.invoke('app:getState'),
    onResize: (handler) => ipcRenderer.on('window:resized', () => handler()),
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    activate: (id) => ipcRenderer.invoke('profiles:activate', id),
    add: (name) => ipcRenderer.invoke('profiles:add', name),
    rename: (id, name) => ipcRenderer.invoke('profiles:rename', id, name),
    clear: (id) => ipcRenderer.invoke('profiles:clear', id),
    delete: (id) => ipcRenderer.invoke('profiles:delete', id),
  },
  browser: {
    newTab: (url) => ipcRenderer.invoke('browser:newTab', url),
    switchTab: (id) => ipcRenderer.invoke('browser:switchTab', id),
    closeTab: (id) => ipcRenderer.invoke('browser:closeTab', id),
    navigate: (value) => ipcRenderer.invoke('browser:navigate', value),
    back: () => ipcRenderer.invoke('browser:back'),
    forward: () => ipcRenderer.invoke('browser:forward'),
    reload: () => ipcRenderer.invoke('browser:reload'),
    home: () => ipcRenderer.invoke('browser:home'),
    setBounds: (bounds) => ipcRenderer.invoke('browser:setBounds', bounds),
    onTabs: (handler) => ipcRenderer.on('browser:tabs', (_event, state) => handler(state)),
    onCrash: (handler) => ipcRenderer.on('browser:crash', (_event, state) => handler(state)),
  },
  files: {
    list: (relativePath) => ipcRenderer.invoke('fs:list', relativePath),
    read: (relativePath) => ipcRenderer.invoke('fs:read', relativePath),
    write: (relativePath, content) => ipcRenderer.invoke('fs:write', relativePath, content),
    create: (parent, name, type) => ipcRenderer.invoke('fs:create', parent, name, type),
    rename: (relativePath, newName) => ipcRenderer.invoke('fs:rename', relativePath, newName),
    delete: (relativePath) => ipcRenderer.invoke('fs:delete', relativePath),
    reveal: (relativePath) => ipcRenderer.invoke('fs:reveal', relativePath),
    confirmDelete: (relativePath) => ipcRenderer.invoke('dialog:confirmDelete', relativePath),
  },
  preview: {
    setBounds: (bounds) => ipcRenderer.invoke('preview:setBounds', bounds),
    load: (value) => ipcRenderer.invoke('preview:load', value),
    reload: () => ipcRenderer.invoke('preview:reload'),
    openExternal: () => ipcRenderer.invoke('preview:openExternal'),
    onState: (handler) => ipcRenderer.on('preview:state', (_event, state) => handler(state)),
  },
});
