# RWACode Real-Mac UI Acceptance

Source of truth: the latest user-provided real-Mac screenshots, the approved browser-first screenshot reference, and the current Workspace Agent architecture.

## Product rule

RWACode is a thin local shell around real provider websites. Do not redesign ChatGPT, Claude, Gemini, or DeepSeek into a fake chat UI.

Provider pages are **MANUAL_ONLY**. RWACode must not inspect, rewrite, restyle, inject into, scrape, click, submit, or otherwise automate provider DOM. Provider-native Enter, Send, buttons, menus, and conversations must remain untouched.

## Visible shell

- One macOS title/header line only. Use the native macOS traffic lights; never draw a second red/yellow/green set.
- Left: Explorer / local files.
- Center: real browser tab + native provider website.
- Right: Preview / Inspector.
- Shell-owned Workspace Agent Command Bar remains outside the provider page.
- No Personal/Work profile selector in normal UI.
- No verbose bridge/debug badges in normal UI.
- No duplicated marketing/status panels.

## Explorer

Keep the context menu short but useful, following VS Code conventions:

- New File / New Folder
- Reveal in Finder
- Open supported image/document in Preview
- Open the containing folder in Terminal
- Find in Folder
- Cut / Copy / Paste
- Copy Path / Copy Relative Path
- Rename / Delete

Do not expose legacy `Add File/Folder to Chat`, `Import AI Reply`, or any other action that routes content through provider DOM.

All local actions must remain canonical-root locked. Copy/paste must reject symbolic-link trees rather than creating an escape path.

## Workspace Agent flow

The shell-owned Command Bar is the project-editing surface. The user should be able to issue a natural task without first selecting a file or path.

Required lifecycle:

`WorkspaceAdapter -> Project Index/Context Retriever -> AgentRunner -> ChangeSet -> Transaction Engine -> Apply -> Preview -> Undo`

- Project retrieval is bounded and root locked.
- Normal mode prepares a ChangeSet and diff before Apply.
- Auto mode snapshots BEFORE state before automatic Apply.
- Transaction Engine is the only filesystem write path for Workspace Agent changes.
- Undo must restore exact BEFORE bytes.
- No generic shell endpoint, localhost REST control API, browser cookie/session reuse as an API, or provider DOM bridge is allowed.

## Preview / Inspector

- Preview and Inspector are real switching tabs.
- Inspector must hide/collapse the native Preview WebContents; resize events must not bring Preview back over Inspector.
- Desktop fills the available preview canvas.
- Tablet is centered, max 768 px.
- Mobile is centered, max 390 px.
- Idle/error state stays dark; never leave a white WebContents rectangle.
- Reload from idle uses the configured Preview URL.
- Full Screen Preview is a real shell action and Esc exits it.
- Device buttons use recognisable desktop/tablet/mobile icons.

## Responsive rule

Explorer and Preview may resize, but they must never push Inspector, Command Bar controls, or header text beyond the window. Saved rail widths must survive shell CSS defaults. At narrow widths, side rails shrink/wrap before the native browser becomes unusable, and Undo must remain reachable.

## Final gate

CI proves source/build/security only. Do not claim `REAL_MAC_FINAL=PASS` from CI alone.

A final real-Mac PASS requires a fresh launch of the merged `main` build and evidence that:

1. Native provider controls still work normally and are not frozen/intercepted.
2. Explorer/Search/Refresh/context actions are clickable and correctly targeted.
3. Preview/Inspector switching, Reload, Desktop/Tablet/Mobile, Full Screen, Esc, collapse, and rail resize work without overlap.
4. Without selecting a file, an `@Local` Command Bar task such as `ubah VALUE menjadi 22222` produces a reviewable ChangeSet/diff.
5. Apply changes the real physical workspace file.
6. Undo restores the exact BEFORE bytes (`VALUE=12345` for the acceptance fixture).
