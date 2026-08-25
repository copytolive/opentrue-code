# Security policy

OpenTrue Code can read source code, execute approved commands and prepare deployments. Treat every execution worker as a privileged boundary and every imported repository as untrusted input.

## Non-negotiable production controls

- Keep production credentials in host/provider secret stores; never commit or paste them into public issues, receipts or prompts.
- Keep `.env`, private workspaces, backups, SSH keys and model weights outside the public Git tree. `scripts/validate-public-repo.sh` and Gitleaks enforce this in CI.
- Require HTTPS for remote control-plane/worker traffic. Ollama, PostgreSQL and Redis must not be publicly exposed.
- Use short-lived/minimum-scope GitHub and worker credentials. A worker token must be tenant-scoped and target-scoped.
- Keep the control-plane separate from untrusted execution. The sandbox has no host Docker socket and no default network route.
- Run Local Bridge only with explicit approved workspace roots; never approve `/` or a broad home directory for convenience.
- Preserve approval gates for production deployment, push/merge and other irreversible/high-impact actions.
- Back up and test restore before production migrations. Deployment scripts must health-check and roll back on failure.
- Protect `main` with repository rules requiring pull requests, CODEOWNER review and successful CI/security checks. Block force-push and branch deletion.

## Automated security gates

The `Security and supply chain` workflow performs:

1. fail-closed public-repository artifact checks;
2. full-history Gitleaks secret scanning;
3. npm high/critical dependency audits;
4. Trivy repository vulnerability/misconfiguration scanning;
5. critical vulnerability scans of UI, control-plane, editor and sandbox images;
6. CycloneDX SBOM generation with SHA-256 checksums.

Scanner images are version/digest pinned. Existing build/integration CI additionally verifies PostgreSQL/Redis behavior, tenant RLS, billing replay/idempotency, rate limiting, backup/restore and Bubblewrap isolation.

## Threats that must be red-teamed before GA

- cross-tenant database/queue/WebSocket access;
- forged/expired auth and worker tokens;
- path traversal and symlink escape from approved workspaces;
- shell/argument injection through task inputs;
- prompt injection from malicious repositories attempting to exfiltrate secrets;
- sandbox escape, Docker socket access and unexpected network egress;
- billing webhook replay/double-credit;
- worker lease loss causing duplicate execution;
- malicious Git hooks/submodules or dependency install scripts;
- deployment to the wrong target/revision;
- secret leakage through logs, model output, audit events or receipts.

Detailed procedures live in `docs/THREAT_MODEL.md` and `docs/ACCEPTANCE_TEST.md`.

## Incident handling

If a credential may have been exposed, revoke/rotate it before investigating convenience issues. Preserve audit/job/deployment receipts, identify affected tenant/worker/revision, isolate the worker, and restore from a known-good state when integrity is uncertain.

Report exploitable vulnerabilities privately to the repository owner. Never open a public issue containing a live secret or working exploit against production.
