# RWACode

RWACode is a browser-first macOS developer workspace with a VS Code-like shell around **native provider browser pages**.

Visible product surface:

- normal multi-tab native browser for ChatGPT / Claude / Gemini / DeepSeek;
- isolated persistent browser profiles for multiple logins;
- Explorer for the selected editable target (`@Local`, `@GitHub`, `@GoogleDrive`);
- shell-owned Workspace Agent Command Bar with deterministic local transforms plus manual ChangeSet Review -> Apply -> durable Undo;
- independent live project Preview / Inspector.

## Provider and security boundary

RWACode production is **NO_AI_API**. ChatGPT, Claude, Gemini, and DeepSeek run only as their normal native/manual browser applications using the user's normal web login/session. RWACode does not call AI-provider APIs, read AI API keys/model environment settings, use provider SDKs, inspect/scrape provider DOM, inject JavaScript, automate Send/click/keydown, reuse browser cookies/sessions as an API, or fall back to an AI CLI.

The browser-to-IDE handoff is explicit and user-owned: when an AI-generated edit is desired, the user manually copies a JSON ChangeSet from the provider page and pastes it into **Paste ChangeSet -> Review ChangeSet** inside RWACode. RWACode validates the user-supplied ChangeSet under the selected workspace root lock, renders a diff, and keeps **Apply** disabled until a valid prepared transaction exists. Provider pages are never read automatically.

The privileged shell is pinned to its exact local `index.html`. All Electron IPC calls require the trusted shell sender/main frame. Provider and Preview WebContents use `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and no RWACode preload. There is no localhost REST/HTTP control API and no generic shell execution endpoint.

Project context is bounded and root locked. Sensitive credential paths such as `.env*`, private keys, credential stores, token/secrets files and credential directories are excluded from workspace retrieval. README/package/source text is untrusted data; only dedicated instruction files are treated as project instructions.

## Workspace Agent

Lifecycle:

`WorkspaceAdapter -> deterministic local transform OR explicit user ChangeSet -> Transaction Engine -> Review -> Apply -> Preview -> Undo`

Every write-capable flow prepares a Review/diff before disk writes. There is no Auto-Apply mode in the production UI. Transaction snapshots survive restart; interrupted applies are rolled back during recovery; applied transactions remain exactly Undo-able while the target has not changed externally. Nested CREATE and rename+edit are supported within transaction byte limits. Empty deterministic operations are a normal `NO_CHANGE` result.

Free-form AI reasoning is intentionally outside RWACode's privileged runtime. The provider browser remains manual. The only AI-to-IDE edit handoff is explicit user-supplied ChangeSet JSON into the RWACode-owned review surface.

`@GitHub` Apply changes only a managed worktree; Commit, Push and Open PR remain explicit. `@GoogleDrive` Apply changes only a managed mirror; Sync to Drive remains explicit. Remote Explorer is read-only so local manual Explorer actions cannot modify the wrong target.

## Functional controls

Browser: new tab, close/switch tabs, Back, Forward, Reload, Home, address/search bar, open externally, provider quick links and OAuth popup windows.

Profiles: create, switch, rename, clear site data, delete. Each profile uses its own persistent Chromium partition.

Explorer: browse/filter/refresh. Local target also supports manual UTF-8 edit, create, rename, delete, reveal and safe utility actions. Remote targets are browse/read-only in Explorer; edits use Workspace Agent transactions.

Workspace Agent: Run Local for deterministic safe replacements; Paste ChangeSet / Review ChangeSet for explicit manual AI-browser handoff; Apply only after Review; durable Undo; explicit GitHub Commit/Push/Open PR; explicit Drive Sync.

Preview: load/reload/open externally, Desktop/Tablet/Mobile geometry, Preview/Inspector switching, Full Screen and Esc exit via the workbench parity layer.

## Canonical delivery commands

```sh
npm ci
npm run verify:no-ai-api
npm run verify:fast
npm run verify:package
npm run verify:release
```

`verify:no-ai-api` fails if shipped runtime files contain known AI-provider API hostnames, AI API credential/model environment names, provider SDK imports, or the removed provider API runner. `verify:fast` is the deterministic preflight. `verify:package` builds Intel + Apple Silicon packages, verifies manifest/hashes, and smoke-launches the packaged shell to READY. `verify:release` runs the complete local/release gate.

The detailed single-candidate protocol is documented in [`DELIVERY.md`](./DELIVERY.md). GitHub Actions must orchestrate these commands rather than duplicate version/architecture acceptance logic in YAML.

## macOS packages and public builds

`npm run build:mac` produces Intel and Apple Silicon DMG/ZIP packages. `npm run manifest:build` records the exact checked-out commit, package version, architecture, byte size and SHA-256 for all four files in `dist/build-manifest.json` and `dist/SHA256SUMS`.

Every RWACode-affecting merge to `main` rebuilds the exact main commit and publishes a **public GitHub prerelease** after `npm run verify:release` succeeds. Public engineering previews are intentionally unsigned until Apple Developer ID signing/notarization credentials are configured; do not bypass Gatekeeper or describe an unsigned preview as a notarized production distribution.

## Acceptance boundary

CI launch proof requires the packaged app to complete a real privileged renderer -> preload/contextBridge -> `ipcMain` round-trip, not merely remain as a live PID. The NO_AI_API static/runtime regression tests additionally prove that free-form workspace planning fails closed without provider API egress and that native provider pages remain unprivileged/manual.

Provider OAuth/session behavior, physical click/keyboard behavior, filesystem Apply, exact byte-for-byte Undo after restart, Preview geometry and the public/main artifact still require one final Real-Mac physical acceptance before claiming `REAL_MAC_FINAL=PASS`.

`DISTRIBUTION_READY` additionally requires Developer ID signing/notarization, Gatekeeper acceptance on a clean macOS profile, upgrade/rollback proof, and the canonical Real-Mac PASS.