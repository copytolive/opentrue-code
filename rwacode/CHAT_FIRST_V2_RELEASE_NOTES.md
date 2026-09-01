# RWACode Chat-First V2

Behavior fixes in this release:

- Provider-pure routing for ChatGPT / Claude / Gemini / DeepSeek.
- No Codex or other CLI fallback from the chat-first surface.
- Truthful provider readiness instead of optimistic READY.
- Editable Target separated from read-only Local/GitHub/Google Drive reference context.
- Default preview URL is preserved; internal `about:blank` no longer overwrites it.
- Desktop/tablet/mobile controls change real preview bounds.
- Preview Full Screen is restored with explicit exit.
- Loaded Preview reloads after Apply and Undo.
- Provider, target/context, recent tasks, conversation summaries, preview URL, and viewport preference persist locally.
- Decorative top-bar controls were removed; Help is functional.
- Explicit Review/Apply/Undo, Git actions, and Drive Sync remain unchanged safety boundaries.
