const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('opentrue',{
  request:(route,method='GET',body)=>ipcRenderer.invoke('opentrue:engine-request',{route,method,body}),
  pickWorkspace:()=>ipcRenderer.invoke('opentrue:pick-workspace'),
  loadSettings:()=>ipcRenderer.invoke('opentrue:settings-load'),
  saveSettings:(settings)=>ipcRenderer.invoke('opentrue:settings-save',settings),
  remoteConnect:()=>ipcRenderer.invoke('opentrue:remote-connect'),
  remoteDisconnect:()=>ipcRenderer.invoke('opentrue:remote-disconnect'),
  openExternal:(url)=>ipcRenderer.invoke('opentrue:open-external',url),
  onEngineExit:(handler)=>ipcRenderer.on('opentrue:engine-exit',(_event,payload)=>handler(payload))
});
