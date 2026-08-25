# macOS production-local runbook

This runbook turns a Mac into an approved OpenTrue Code workspace without granting the bridge access to the entire machine.

## 1. Install the local stack

Requirements: Docker Desktop running, Node.js 22+, Git, and enough RAM/disk for the selected Ollama model.

```bash
git clone https://github.com/narzulalistiqlal/opentrue-code.git
cd opentrue-code
./scripts/install-macos.sh
```

The installer creates `.env` locally, generates random secrets, starts PostgreSQL, Redis, control-plane, browser UI, code-server+Cline, Ollama and Open WebUI, then runs health checks. `.env` is ignored by Git.

## 2. Add private projects without publishing them

Private repositories belong under an approved external workspace or under the ignored `workspace/` directory. Never copy a private project into the public Git tree.

```bash
git clone <private-repository-url> workspace/project
```

## 3. Configure Cline to local Ollama

Inside code-server:

- provider: Ollama
- base URL: `http://ollama:11434`
- model: the selected local model
- API key: none

Run `node scripts/model-benchmark.mjs` before selecting a default on a new machine. The benchmark uses Ollama's own timing counters and reports output tokens/second.

## 4. Install the Local Bridge

Mint a tenant-scoped worker token with `workerTarget=local-bridge`. Then provide only the folders the bridge may access:

```bash
export CONTROL_PLANE_URL='https://<your-domain>/api'
export CONTROL_PLANE_TOKEN='<tenant-scoped-worker-token>'
export APPROVED_WORKSPACE_ROOTS='/absolute/project-a:/absolute/project-b'
./scripts/install-local-bridge-macos.sh
```

The installer stores the token in a mode-600 local file, installs a LaunchAgent, and enables restart recovery. It does not print the token.

## 5. Acceptance receipt

From chat/control-plane create an approved `local-bridge` job for `git_status`, `test`, `lint` or `build`. A valid receipt must include the real job ID, worker ID, exit code, duration and output hash. Restart the Mac, confirm the LaunchAgent returns, and run another job.

## Safety boundary

Do not set `APPROVED_WORKSPACE_ROOTS=/`. Do not include `$HOME` merely for convenience. Production credentials remain in local/server secret stores, never in the public repository or prompts.
