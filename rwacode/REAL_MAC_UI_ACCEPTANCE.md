# RWACode Real-Mac UI Acceptance

Source of truth: the latest user-provided real-Mac screenshots and the approved browser-first screenshot reference.

## Product rule

RWACode is a thin local shell around real provider websites. Do not redesign ChatGPT, Claude, Gemini, or DeepSeek into a fake chat UI.

## Visible shell

- One macOS title/header line only. Use the native macOS traffic lights; never draw a second red/yellow/green set.
- Left: Explorer / local files.
- Center: real browser tab + native provider website.
- Right: Preview / Inspector.
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
- Add File or Folder to Chat
- Cut / Copy / Paste
- Copy Path / Copy Relative Path
- Rename / Delete

All local actions must remain canonical-root locked. Copy/paste must reject symbolic-link trees rather than creating an escape path.

## Preview

- Desktop fills the available preview canvas.
- Tablet is centered, max 768 px.
- Mobile is centered, max 390 px.
- Idle/error state stays dark; never leave a white WebContents rectangle.
- Device buttons use recognisable desktop/tablet/mobile icons.

## AI flow

`Add File/Folder to Chat` inserts bounded local context directly into the active ChatGPT/Claude/Gemini composer without an intermediate instruction modal and without auto-submitting the message.

## Responsive rule

Explorer and Preview may resize, but they must never push Inspector or header text beyond the window. At narrow widths, side rails shrink before the browser becomes unusable.

## Final gate

Do not claim real-Mac visual PASS from CI alone. CI proves source/build/security. Final visual PASS requires a fresh real-Mac screenshot after the merged build is launched.
