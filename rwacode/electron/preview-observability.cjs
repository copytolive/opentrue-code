'use strict';

const { app, BrowserWindow, session } = require('electron');

const MAX_TEXT = 1200;
function text(value, max = MAX_TEXT) {
  return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').slice(0, max);
}
function shellWindows() {
  return BrowserWindow.getAllWindows().filter((win) => {
    try {
      const url = win.webContents.getURL();
      return !win.isDestroyed() && url.startsWith('file:') && url.includes('index.html');
    } catch { return false; }
  });
}
function send(channel, payload) {
  for (const win of shellWindows()) {
    try { win.webContents.send(channel, payload); } catch {}
  }
}
function safeUrl(value) {
  const raw = text(value, 2400);
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch { return raw; }
}
function isInternalElectronWarning(message, sourceId) {
  return /Electron Security Warning/i.test(String(message || '')) && /(?:node:electron|sandbox_bundle|electron\/js2c)/i.test(String(sourceId || ''));
}

function installPreviewObservability() {
  const previewSession = session.fromPartition('persist:rwacode-preview', { cache:true });
  const attached = new WeakSet();

  const attachConsole = (wc) => {
    if (!wc || attached.has(wc) || wc.session !== previewSession) return;
    attached.add(wc);
    wc.on('console-message', (...args) => {
      const maybe = args[1];
      const details = maybe && typeof maybe === 'object'
        ? maybe
        : { level:args[1], message:args[2], line:args[3], sourceId:args[4] };
      const message = text(details?.message || '', 4000);
      const sourceId = safeUrl(details?.sourceId || '') || text(details?.sourceId || '', 600);
      if (isInternalElectronWarning(message, sourceId)) return;
      send('preview:console', {
        at: Date.now(),
        level: text(details?.level || 'info', 32),
        message,
        line: Number(details?.line || 0),
        sourceId,
      });
    });
    wc.on('render-process-gone', (_event, details = {}) => {
      send('preview:console', { at:Date.now(), level:'error', message:`Preview renderer stopped: ${text(details.reason || 'unknown', 120)}`, line:0, sourceId:'' });
    });
  };

  app.on('web-contents-created', (_event, wc) => attachConsole(wc));

  previewSession.webRequest.onBeforeRequest((details, callback) => {
    send('preview:network', {
      phase:'request', at:Date.now(), id:String(details.id),
      method:text(details.method || 'GET', 16), url:safeUrl(details.url),
      resourceType:text(details.resourceType || 'other', 40),
    });
    callback({ cancel:false });
  });
  previewSession.webRequest.onCompleted((details) => {
    send('preview:network', {
      phase:'complete', at:Date.now(), id:String(details.id),
      method:text(details.method || 'GET', 16), url:safeUrl(details.url),
      resourceType:text(details.resourceType || 'other', 40),
      statusCode:Number(details.statusCode || 0), fromCache:Boolean(details.fromCache),
    });
  });
  previewSession.webRequest.onErrorOccurred((details) => {
    send('preview:network', {
      phase:'error', at:Date.now(), id:String(details.id),
      method:text(details.method || 'GET', 16), url:safeUrl(details.url),
      resourceType:text(details.resourceType || 'other', 40),
      error:text(details.error || 'request failed', 300),
    });
  });
}

app.whenReady().then(installPreviewObservability).catch(() => {});

module.exports = { installPreviewObservability, isInternalElectronWarning };
