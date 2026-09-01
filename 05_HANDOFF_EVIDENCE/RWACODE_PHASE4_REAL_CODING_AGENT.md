# RWACode Phase 4 — Real Coding Agent

Status target: free-form coding tasks from the RWACode-owned Workspace Agent without automating provider web pages.

## Canonical provider boundary

- Browser ChatGPT / Claude / Gemini / DeepSeek are native **MANUAL_ONLY** surfaces.
- RWACode does not inspect, rewrite, inject into, scrape, click, submit, or restyle provider DOM.
- Browser cookies, sessions and internal provider endpoints are never reused as an agent API.
- Free-form planning uses only the selected provider's approved official API route: OpenAI Responses API, Anthropic Messages API, Gemini generateContent API, or DeepSeek chat API.
- There is **no CLI fallback** and no silent provider switching when the user selected a provider explicitly.
- API credentials/models come only from the process runtime environment. RWACode exposes no API-key UI.
- A deterministic local-literal route remains available for the narrow safe replacement acceptance task and does not call an external provider.

## Context security

- Project indexing and retrieval are root locked and bounded.
- `.env*`, credential stores, private keys, common secret/token files and sensitive credential directories are excluded from provider context.
- Likely credential values in otherwise ordinary source text are redacted before provider context is built.
- Only dedicated instruction files such as `AGENTS.md`, `AGENTS.override.md`, `RWACODE.md` and `CLAUDE.md` are treated as project instructions.
- README/package/source/reference text is untrusted project data and cannot override the user task.

## Write ownership and durability

Provider APIs are planning-only. They return a structured ChangeSet. The root-locked Transaction Engine owns all agent CREATE / MODIFY / RENAME / DELETE operations.

- Normal mode: Plan -> REVIEW -> explicit Apply.
- Auto mode: durable BEFORE snapshot is persisted before the first physical write.
- Durable transaction snapshots survive app restart.
- An interrupted `APPLYING` transaction is rolled back to BEFORE during recovery.
- Applied transactions remain exactly Undo-able after restart while the target has not changed externally.
- ChangeSets are byte-budgeted; diff output is bounded and contextual.
- Nested CREATE is supported with root-locked parent creation.
- Rename+edit is represented as one `RENAME` operation with optional final `content`.
- An empty operations array is a normal `NO_CHANGE` / `NEEDS_CONTEXT` result, not an error.

## Editable targets

1. `@Local` — physical canonical workspace.
2. `@GitHub` — managed worktree; Apply changes only the managed branch worktree. Commit, Push and Open PR remain separate explicit actions.
3. `@GoogleDrive` — managed mirror; Apply changes the mirror. `Sync to Drive` remains a separate explicit action.

Explorer follows the selected editable target. Remote Explorer is read-only; modifications still flow through Review -> Apply so local-only Explorer actions cannot accidentally modify the wrong source.

## Shell security

The privileged Electron shell is pinned to its exact local `index.html`. All renderer-to-main IPC handlers require the trusted shell sender and main frame. Provider and Preview WebContents are sandboxed, context-isolated, Node-free and have no RWACode preload. The shell uses a restrictive CSP and exposes no localhost REST or generic shell execution endpoint.

## Expected user flow

1. Select `@Local`, `@GitHub`, or `@GoogleDrive`.
2. Optionally select ChatGPT / Claude / Gemini / DeepSeek API; `Auto` may choose only among configured approved APIs.
3. Type a natural task without selecting a file, for example `tambahkan tombol Full Screen yang berfungsi tanpa merusak chart`.
4. RWACode retrieves bounded safe project context and prepares a ChangeSet.
5. Review the contextual diff and explicitly Apply in Normal mode.
6. Verify Preview; Undo remains exact and durable.
7. GitHub Commit/Push/PR and Google Drive Sync remain explicit actions.

## Final acceptance

CI must prove source, unit, security, syntax and macOS build gates. `REAL_MAC_FINAL=PASS` additionally requires a fresh merged-main launch on the real Mac proving native provider controls, Explorer/Preview interactions, physical Apply, exact byte-for-byte Undo, restart-persistent Undo recovery, and final packaged-app launch. CI alone is never sufficient for that final runtime claim.
