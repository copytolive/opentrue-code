# RWACode

RWACode is a browser-first macOS developer workspace with a VS Code-like shell around **native provider browser pages**.

Visible product surface:

- normal multi-tab native browser for ChatGPT / Claude / Gemini / DeepSeek;
- isolated persistent browser profiles for multiple logins;
- Explorer for the selected editable target (`@Local`, `@GitHub`, `@GoogleDrive`);
- shell-owned Workspace Agent Command Bar with Review -> Apply -> durable Undo;
- independent live project Preview / Inspector.

## Provider and security boundary

Provider browser pages are **MANUAL_ONLY**. RWACode does not inspect, inject, scrape, click, submit, or restyle provider DOM and does not reuse browser cookies/sessions as an API. Free-form planning uses only configured approved official provider APIs; explicit provider selections never silently fall back to another provider or CLI. There is no provider API-key UI.

The privileged shell is pinned to its exact local `index.html`. All Electron IPC calls require the trusted shell sender/main frame. Provider and Preview WebContents use `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and no RWACode preload. There is no localhost REST/HTTP control API and no generic shell execution endpoint.

Project context is bounded and root locked. Sensitive credential paths such as `.env*`, private keys, credential stores, token/secrets files and credential directories are excluded, and likely secret values in ordinary text are redacted before any provider context is built. README/package/source text is untrusted data; only dedicated instruction files are treated as project instructions.

## Workspace Agent

Lifecycle:

`WorkspaceAdapter -> Project Index/Context Retriever -> AgentRunner -> ChangeSet -> Transaction Engine -> Apply -> Preview -> Undo`

Normal mode always prepares a Review/diff before disk writes. Auto mode persists a durable BEFORE snapshot before the first physical write. Transaction snapshots survive restart; interrupted applies are rolled back during recovery; applied transactions remain exactly Undo-able while the target has not changed externally. Nested CREATE and rename+edit are supported within transaction byte limits. Empty operations are a normal `NO_CHANGE` result.

`@GitHub` Apply changes only a managed worktree; Commit, Push and Open PR remain explicit. `@GoogleDrive` Apply changes only a managed mirror; Sync to Drive remains explicit. Remote Explorer is read-only so local manual Explorer actions cannot modify the wrong target.

## Functional controls

Browser: new tab, close/switch tabs, Back, Forward, Reload, Home, address/search bar, open externally, provider quick links and OAuth popup windows.

Profiles: create, switch, rename, clear site data, delete. Each profile uses its own persistent Chromium partition.

Explorer: browse/filter/refresh. Local target also supports manual UTF-8 edit, create, rename, delete, reveal and safe utility actions. Remote targets are browse/read-only in Explorer; edits use Workspace Agent transactions.

Preview: load/reload/open externally, Desktop/Tablet/Mobile geometry, Preview/Inspector switching, Full Screen and Esc exit via the workbench parity layer.

## Canonical delivery commands

```sh
npm ci
npm run verify:fast
npm run verify:package
npm run verify:release
```

`verify:fast` is the cheap deterministic preflight. `verify:package` builds Intel + Apple Silicon packages, verifies manifest/hashes, and smoke-launches the packaged shell to READY. `verify:release` runs the complete local/release gate.

The detailed single-candidate protocol is documented in [`DELIVERY.md`](./DELIVERY.md). GitHub Actions must orchestrate these commands rather than duplicate version/architecture acceptance logic in YAML.

## macOS packages and public builds

`npm run build:mac` produces Intel and Apple Silicon DMG/ZIP packages. `npm run manifest:build` records the exact checked-out commit, package version, architecture, byte size and SHA-256 for all four files in `dist/build-manifest.json` and `dist/SHA256SUMS`.

Every RWACode-affecting merge to `main` rebuilds the exact main commit and publishes a **public GitHub prerelease** after `npm run verify:release` succeeds. Public engineering previews are intentionally unsigned until Apple Developer ID signing/notarization credentials are configured; do not bypass Gatekeeper or describe an unsigned preview as a notarized production distribution.

## Acceptance boundary

CI launch proof requires the packaged app to reach an explicit shell READY marker after the local renderer finishes loading, not merely remain as a live PID. A green repository build therefore proves source/build/security/package launch gates.

Provider OAuth/session behavior, physical click/keyboard behavior, filesystem Apply, exact byte-for-byte Undo after restart, Preview geometry and the public/main artifact still require one final Real-Mac physical acceptance before claiming `REAL_MAC_FINAL=PASS`.
