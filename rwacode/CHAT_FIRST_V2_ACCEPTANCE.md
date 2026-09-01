# RWACode Chat-First V2 Acceptance

This document locks the behavioral contract for the chat-first workspace surface.

## Provider routing

- ChatGPT, Claude, Gemini, and DeepSeek are provider-pure selections.
- A selected provider may use only its approved official API route.
- No Codex/Claude CLI fallback, no cross-provider fallback for an explicitly selected provider.
- `Auto` may select among configured official provider APIs only.
- Provider web pages remain `MANUAL_ONLY`; RWACode never scrapes provider DOM, reuses browser cookies/session state as an API, or automates provider Send controls.
- Chat-first tasks pass `chatOnly=true`; the legacy deterministic literal path remains available only to legacy callers.

## Workspace safety

- One Editable Target is selected: Local, GitHub managed worktree, or Google Drive managed mirror.
- Additional Local/GitHub/Google Drive sources are read-only reference context.
- ChangeSet paths are always relative to the Editable Target.
- Review occurs before Apply.
- All writes remain inside the root-locked Transaction Engine.
- Exact Undo remains mandatory.
- Git commit/push/PR and Google Drive sync remain explicit user actions.

## Preview behavior

- The initial/default preview URL remains `http://127.0.0.1:3000` and must not be overwritten by an internal `about:blank` state.
- Desktop/tablet/mobile buttons change the real WebContentsView bounds.
- Full Screen uses the real preview WebContentsView and has an explicit Exit control.
- Apply and Undo reload an already loaded preview.
- The last valid HTTP(S) preview URL and preview mode persist across renderer reload/restart.

## UI behavior

- Chat is the primary work surface.
- Target and read-only reference context are visually separate.
- Provider readiness is truthful (`READY` vs `SETUP REQUIRED`) for the selected official API route.
- Conversation/recent-task state persists locally.
- Visible controls must have behavior; decorative top-bar controls from v1 are removed.

## Required gates

- `npm test`
- `npm run check`
- RWACode Desktop CI
- OpenTrue Code Acceptance CI
- OpenTrue Bugbot
- Security and supply-chain CI
- Final real-Mac visual/functional acceptance after merge.
