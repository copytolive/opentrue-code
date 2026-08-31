# RWACode

RWACode is a browser-first local developer workspace for macOS.

Visible product surface:

- normal multi-tab browser
- isolated persistent browser profiles for multiple logins
- local file explorer/editor locked to `/Users/Shared/WorkspaceBersama/rwa.ms/chat-local-online`
- independent live project preview

There is no provider API-key UI and no localhost REST/HTTP filesystem or control API in this shell. Renderer-to-local actions use an explicit Electron `contextBridge`/IPC allowlist; external provider web contents have `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`.

## Functional controls

Browser: new tab, close/switch tabs, Back, Forward, Reload, Home, address/search bar, open externally, Claude/ChatGPT/Gemini quick links, OAuth popup windows.

Profiles: create, switch, rename, clear site data, delete. Each profile uses its own persistent Chromium partition so the same provider can stay logged into different accounts simultaneously.

Files: browse directories, filter, refresh, open/edit UTF-8 text files, create file/folder, rename, delete with native confirmation, reveal in Finder. The main process resolves real paths and rejects canonical-root escapes including symlink escapes.

Preview: load URL, reload, open externally, desktop/tablet/mobile sizing.

## Development

```sh
npm install
npm test
npm run check
npm start
```

## Build macOS x64

```sh
npm run build:mac
```

Unsigned CI artifacts are intended for engineering acceptance. Production distribution still requires Apple Developer ID signing and notarization; do not bypass Gatekeeper.

## Acceptance boundary

A green repository build proves source/build gates only. Login persistence, provider OAuth compatibility, filesystem behavior, restart persistence and final DMG launch must still be exercised on the real Mac before claiming runtime PASS.
