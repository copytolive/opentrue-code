# WhatsApp AI Public Bootstrap

This branch exists only to bootstrap the isolated local control plane for:

`/Users/Shared/WorkspaceBersama/WHATSAPP_AI_STACK`

It intentionally does **not** contain:
- WhatsApp credentials
- SSH keys
- .env files
- private queue responses
- local customer data

The control plane itself remains private in:
- repo: `copytolive/archive-bridge-private`
- branch: `whatsapp-ai-local-control`

## Why public bootstrap?

macOS Gatekeeper can block unsigned downloaded .app/.command bundles.
This public bootstrap is plain shell source. The user runs it directly through the already authenticated GitHub CLI, so there is no downloaded unsigned app bundle to open.

## Isolation

The bridge is hard-locked to the WhatsApp AI workspace and uses its own LaunchAgent/profile/state. It does not modify the CopyToLive live-control branch or OpenTrue Root Reader branch.
