# Production roadmap

## Gate 0 — License and security

- Pin every upstream image by version/digest.
- Complete the commercial-use license matrix for every model and dependency.
- Add SBOM, vulnerability scanning and signed images.
- Threat-model Docker socket, Git credentials, SSH, MCP tools and browser automation.

## Gate 1 — Single-node acceptance

- Deploy one RTX 5090/4090 Vast.ai worker.
- Run the complete acceptance test against a disposable repository and staging server.
- Measure tokens/second internally, time-to-first-token, task success and GPU-hours per user.

## Gate 2 — Multi-tenant safety

- One isolated workspace/sandbox per customer.
- Tenant-scoped secrets and Git identities.
- CPU/RAM/GPU quotas, egress controls and audit logs.
- Malware and prompt-injection defenses for untrusted repositories.

## Gate 3 — Scheduler and economics

- Load-aware model router.
- Warm pool plus scale-to-zero workers.
- Priority queues by subscription plan.
- Spot/interruptible retry policy and checkpointing.
- Real-time gross-margin guardrail.

## Gate 4 — Product experience

- Unified chat, editor, diff, terminal and preview.
- One-click approve/reject for file, GitHub and deployment actions.
- Reversible checkpoints and session replay.
- Desktop/PWA experience and low-latency streaming.

## Gate 5 — Commercial launch

- Billing, fair-use terms, privacy policy and acceptable-use policy.
- Status page, support workflow, backups and disaster recovery.
- Staged rollout: internal → design partners → paid beta → general availability.

OpenTrue Code is production-ready only when these gates and `ACCEPTANCE_TEST.md` pass on the actual infrastructure.
