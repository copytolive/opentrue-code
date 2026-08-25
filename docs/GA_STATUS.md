# General Availability status

Status vocabulary:

- `REPO PASS` — implemented and verified by repository CI.
- `RUNTIME PASS` — verified by a receipt from the real target.
- `NEEDS TARGET EVIDENCE` — implementation/runbook exists, but the real target has not produced evidence yet.
- `ADMIN ACTION` — GitHub/provider account setting cannot be proven by repository code.

| # | Gate | Status before real target evidence | Required final evidence |
|---|---|---|---|
| 1 | Stable `main` / clean public repo | REPO PASS after security CI | reviewed baseline + secret/SBOM/security checks |
| 2 | Mac installation | NEEDS TARGET EVIDENCE | fresh Mac install + reboot health receipt |
| 3 | Local/open-weight AI | NEEDS TARGET EVIDENCE | Ollama benchmark + coding task success |
| 4 | Cursor-like chat workflow | NEEDS TARGET EVIDENCE | real repo multi-file edit/test/diff/checkpoint |
| 5 | Local Bridge | NEEDS TARGET EVIDENCE | folder-scope denial + real task receipts + restart recovery |
| 6 | GitHub end-to-end | NEEDS TARGET EVIDENCE | branch -> diff -> commit -> PR -> CI repair -> merge |
| 7 | Protect `main` | ADMIN ACTION | GitHub ruleset screenshot/API state requiring PR/CODEOWNER/checks, no force push |
| 8 | VPS deploy/rollback | NEEDS TARGET EVIDENCE | exact-SHA staging deploy + failed-health rollback receipt |
| 9 | Domain/HTTPS | NEEDS TARGET EVIDENCE | live TLS/routing/private-port verification |
| 10 | Sandbox separation | REPO PASS; runtime host still verify | Bubblewrap CI + target Linux resource/escape drill |
| 11 | GPU worker | NEEDS TARGET EVIDENCE | real GPU registration/inference/benchmark/fallback receipt |
| 12 | HA/failover | NEEDS TARGET EVIDENCE | kill-worker and replacement-host drills |
| 13 | Auth/multi-user isolation | REPO PASS; beta validation required | RLS/queue/WebSocket tests + beta tenant canaries |
| 14 | Billing/subscription | REPO PASS generic contract; provider connection pending | live provider signed webhook lifecycle receipts |
| 15 | Observability | REPO PASS metrics; monitoring connection pending | real dashboards/alerts and incident test |
| 16 | 100/500/1,000 load | NEEDS TARGET EVIDENCE | staging k6 results with p50/p95/p99/error/DB/Redis/queue metrics |
| 17 | Security/red-team | REPO PASS automated subset | target red-team matrix, zero open P0/P1 |
| 18 | Disaster recovery | REPO PASS CI drill | replacement-host restore with measured RPO/RTO |
| 19 | Full acceptance | NEEDS TARGET EVIDENCE | one complete non-mock scenario |
| 20 | Private-project dogfood | NEEDS TARGET EVIDENCE | real private project work without source leakage |
| 21 | Public beta | NEEDS USERS | measured beta reliability/security/economics |
| 22 | General Availability | BLOCKED until all applicable above pass | signed release decision referencing evidence |

No row may be promoted only because a script, button, Docker service or documentation exists.
