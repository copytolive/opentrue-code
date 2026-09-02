# OpenTrue Code Desktop Engine

OpenTrue Code Desktop turns the existing Agent Runtime + Local Bridge + Control Plane into an installable desktop application for macOS and Windows.

## What is real in v0.3

The desktop app starts a private loopback OpenTrue Engine with a random bearer token. The renderer cannot access Node.js directly. The engine accepts only approved Git repository roots, blocks path escape, limits editor file size, requires explicit approval before direct file writes and remote Git mutations, and exposes no arbitrary shell endpoint.

AI routing is provider-agnostic. Built-in adapters support Ollama, OpenAI, Anthropic, Gemini, OpenAI-compatible endpoints, and LM Studio. API keys are kept in Electron `safeStorage` (macOS Keychain / Windows DPAPI) and are sent only from the trusted main process to the local engine in memory. Remote model endpoints must use HTTPS; plain HTTP is accepted only for loopback local models.

The same application can connect its Local Bridge to an OpenTrue Control Plane over HTTPS. Remote jobs remain constrained by the Local Bridge allowlist and approved workspace roots. The bridge uses the operating system path delimiter, so Windows drive letters are not split incorrectly.

## Install

### macOS

Download the DMG from the latest GitHub Release and copy **OpenTrue Code.app**, or run:

```bash
curl -fsSL https://raw.githubusercontent.com/copytolive/opentrue-code/main/scripts/install-desktop-macos.sh | bash
```

The public CI build is unsigned unless Apple signing/notarization credentials are configured. The installer does not bypass Gatekeeper.

### Windows

Download the NSIS `.exe` from the latest GitHub Release, or in PowerShell:

```powershell
irm https://raw.githubusercontent.com/copytolive/opentrue-code/main/scripts/install-desktop-windows.ps1 | iex
```

The public CI build is unsigned unless Windows code-signing credentials are configured. The installer does not disable SmartScreen.

## First run

1. Choose a **Git repository root**. Nested folders and non-Git folders are refused.
2. Choose an AI provider. Ollama is the default and needs no cloud API key. Cloud provider API keys are stored using OS secure storage.
3. Use **Ask** and **Plan** for read-only work. Enable the explicit approval checkbox before allowing Agent/Debug to write.
4. Use the Tasks panel for test/build/lint/typecheck/Git operations. Commit, push and PR actions require explicit approval at the engine API.
5. To execute jobs coming from a server, configure the HTTPS Control Plane URL and a target-scoped worker token, then connect the Remote Bridge.

## Runtime architecture

```text
Desktop Renderer (sandboxed)
        |
Electron Main (Keychain / DPAPI)
        |
127.0.0.1 + random bearer token
        |
OpenTrue Engine
   |       |       |
Agent   AI router  approved Git workspace
Runtime     |
       Ollama / OpenAI / Claude / Gemini / compatible
        |
Local Bridge  <---- HTTPS ---->  Control Plane / VPS
        |
allowlisted commands + receipts
```

## Security boundaries

- No arbitrary shell API is exposed by the desktop engine.
- Every workspace is resolved to its real Git repository root before approval.
- File access cannot escape an approved root.
- Direct writes and write-capable agent modes use explicit approvals.
- The remote bridge uses only the existing allowlisted task policy.
- Cloud AI and remote control-plane endpoints require HTTPS; only loopback may use HTTP.
- Secrets are never committed to the repository and are not intentionally logged.

## What CI proves

`desktop-engine.yml` runs engine/provider tests, the existing Agent Runtime and Local Bridge tests, builds macOS arm64, macOS x64, and Windows x64 installers, mounts the macOS DMG to verify the app bundle, installs the Windows NSIS package silently on the ephemeral runner and verifies the executable, then publishes release artifacts after a successful `main` build.

CI installer smoke is not the same as a signed/notarized consumer release. Apple Developer ID/notarization and Windows Authenticode require external signing credentials and cannot be truthfully marked PASS until those credentials are configured and the signed artifacts are independently verified.
