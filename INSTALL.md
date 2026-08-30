# Install OpenTrue Code

OpenTrue Code Desktop is the simplest path for a local AI coding engine on macOS or Windows. See `docs/DESKTOP_ENGINE.md` for architecture, approvals, provider setup and server connection.

- macOS: latest `OpenTrue-Code-*-mac-arm64.dmg` or `OpenTrue-Code-*-mac-x64.dmg` from Releases.
- Windows: latest `OpenTrue-Code-*-windows-x64.exe` from Releases.
- Headless/server deployment remains supported by the existing Docker Compose, Control Plane, workers and Local Bridge components.

Public CI builds are intentionally not allowed to bypass OS security prompts. Production signing/notarization is a separate credential-backed release gate.
