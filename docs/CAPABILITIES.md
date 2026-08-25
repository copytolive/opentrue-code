# Product capabilities

## Core

| Capability | How it works | Safety gate |
|---|---|---|
| Conversational coding | OpenHands chat reads and edits the mounted workspace | Diff shown before commit |
| Cursor-style editor | code-server provides Code-OSS editing, terminal, extensions, Git and debugging | Workspace isolation |
| Local inference | Ollama runs open-weight coding models on owned hardware | Ollama is not exposed publicly |
| Multi-model chat | Open WebUI selects installed local models | No command execution by default |
| Repository operations | Native Git commands and configured GitHub credentials | Approval before push/merge |
| Server deployment | Repository-owned CI or an allowlisted deployment script | Approval and health check |
| Testing and repair | Agent runs lint, typecheck, unit/integration tests and build | Must report actual commands/results |
| Auditability | Git commits, diffs, agent logs and deployment receipts | Immutable production log recommended |

## Features intended to exceed a basic Cursor workflow

1. Browser IDE and coding agent can run on the same private server.
2. Fully self-hosted model option with no paid model service.
3. Separate general chat and privileged coding-agent surfaces.
4. Reproducible Docker workspace rather than device-specific setup.
5. Approval gates for GitHub, production, migrations, infrastructure and deletion.
6. Project-specific `AGENTS.md` rules inherited by every task.
7. Verifiable completion: diff, tests, commit SHA, deployment revision and health check.
8. Multiple repositories can be mounted without publishing their source.

## Model reality

DeepSeek V4 Pro is extremely large. Running the full model locally requires datacenter-class multi-GPU infrastructure; it is not a realistic single-RTX-4090 default. For a 24 GB GPU, use a capable quantized agentic coding model that fits the hardware. The default may be changed as stronger open-weight models become available.

## Not yet a production guarantee

Smoothness depends on GPU memory, model quantization, context length, repository size, storage speed and sandbox configuration. Production readiness requires an end-to-end acceptance test on the actual Mac/VPS/GPU target.
