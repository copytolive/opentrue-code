# RWACode Phase 4 — Real Coding Agent

Status target: free-form coding tasks from the RWACode-owned Command Bar without provider web-page automation.

## Provider boundary

- Browser ChatGPT / Claude / Gemini / DeepSeek remain native MANUAL_ONLY surfaces.
- RWACode never scrapes provider DOM, cookies, sessions, or internal endpoints.
- Free-form agent planning uses only official allowlisted CLIs.
- Codex CLI is invoked in `read-only` sandbox mode and receives the bounded local Project Context in the prompt.
- The Codex planning process runs from an isolated temporary planning directory, not the project root.
- Claude Code remains an optional official fallback constrained to Plan Mode with Read/Glob/Grep.
- Gemini headless automation remains disabled until RWACode can enforce an equivalent hard planning boundary.

## Write ownership

Provider runners are planning-only. They return a structured ChangeSet. All CREATE / MODIFY / RENAME / DELETE operations still pass through the existing root-locked Transaction Engine. Normal mode remains Review -> Apply. Undo restores exact BEFORE bytes.

## Expected user flow

1. Select `@Local`, `@GitHub`, or `@GoogleDrive`.
2. Type a natural-language task such as `tambahkan tombol Full Screen yang berfungsi tanpa merusak chart` in the RWACode Command Bar.
3. RWACode builds bounded project context locally.
4. An available official planner returns a structured ChangeSet.
5. RWACode shows REVIEW and diff before disk writes.
6. User explicitly Applies. GitHub Commit/Push/PR and Google Drive Sync remain explicit separate actions.
7. Undo remains exact and root-locked.

## Acceptance

The automated regression suite must prove that a free-form task can be planned through a mocked official Codex CLI invocation using `--sandbox read-only`, that planning runs outside the project root, that the workspace is unchanged before Apply, and that Transaction Engine Undo restores exact BEFORE bytes.
