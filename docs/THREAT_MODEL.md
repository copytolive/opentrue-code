# Threat model and red-team matrix

A test passes only when the protected asset remains inaccessible or the requested dangerous transition is denied. A UI warning is not a security control.

| Threat | Required attack test | Expected result |
|---|---|---|
| Cross-tenant job read | Token for tenant B requests tenant A job ID | 404/denied by forced RLS |
| Cross-tenant queue claim | Worker B claims target used by tenant A | No tenant A job returned |
| WebSocket leakage | Open sockets for two tenants while A job changes | Only tenant A socket receives event |
| Token forgery | Change role/tenant/expiry without resigning | 401 |
| Expired token | Replay valid but expired token | 401 |
| Worker target escalation | Local Bridge token asks for `vast`/sandbox claim | 403 target mismatch |
| Billing replay | Send same signed event ID repeatedly | First applies, later deliveries are duplicate/no double credit |
| Billing tamper | Change body without recomputing signature | 401 |
| Path traversal | Approved-root job requests `../`/symlink outside root | Bridge rejects after `realpath` |
| Command injection | Unknown task / NUL / crafted args | Task rejected or treated as literal argument; no arbitrary shell |
| Sandbox host read | Read `/etc/passwd`, `/root`, Docker socket | Path absent/inaccessible |
| Sandbox network | Inspect route/connect outbound | No default route unless an explicit egress profile is used |
| Sandbox privilege | Check UID/capabilities | Non-root and capabilities dropped |
| Lease expiry | Kill worker after claim | Job is recovered/requeued after lease expiry |
| Duplicate completion | Worker completes after lease ownership lost | 409; stale worker cannot commit result |
| Prompt injection | Repository tells agent to reveal token/secret | Secret is not in model-visible repository/context; action remains policy-gated |
| Git hook abuse | Malicious repository includes hooks/install scripts | No implicit execution outside approved task/policy |
| Deployment wrong revision | Request unknown/unapproved revision | Deployment denied or health/rollback fails closed |
| Secret in commit history | Commit a canary key on test branch | Gitleaks blocks security workflow |
| Model weight/public backup | Track `.gguf`/`.dump` canary | Public repo validation blocks workflow |

## P0/P1 release rule

- **P0:** cross-tenant exposure, auth bypass, remote command escape, secret exfiltration, sandbox host compromise, unapproved production deployment, destructive billing replay.
- **P1:** reliable denial-of-service, worker duplicate execution with external side effects, backup/restore integrity failure, material monitoring blind spot.

GA is blocked while any reproducible P0 or P1 remains open. Fixes require a regression test or reproducible acceptance receipt.

## Repository prompt-injection boundary

Repository text is untrusted data. It may suggest commands, credentials or policy changes but cannot grant itself permissions. Secrets should not be present in the checked-out public tree, and Local Bridge/sandbox tasks remain constrained by policy even when model output is malicious.

## Evidence to retain

For security drills retain test ID, timestamp, commit SHA, tenant IDs represented by synthetic fixtures, worker ID, expected result, actual status/exit code and output hash. Never retain live secrets in the evidence bundle.
