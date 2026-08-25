# Production acceptance test

OpenTrue Code reaches GA only when every applicable test below has a receipt from the component/target that actually executed it. Repository CI evidence and real-runtime evidence are separate.

## A. Repository / supply-chain gate

- [ ] `main` points to the intended reviewed baseline.
- [ ] `scripts/validate-public-repo.sh` passes.
- [ ] Full-history Gitleaks scan passes.
- [ ] npm high/critical audits pass.
- [ ] Trivy repository scan has no blocking critical finding.
- [ ] Runtime image critical scans pass.
- [ ] CycloneDX SBOM artifacts are generated and checksummed.
- [ ] UI build, control-plane integration, Compose, Caddy and Bubblewrap CI are green.
- [ ] GitHub repository rules require PR + CI/security checks + CODEOWNER review and block force-push/deletion of `main`.

## B. Local Mac / chat-to-code gate

- [ ] Fresh clone installs with `scripts/install-macos.sh` without editing source code.
- [ ] PostgreSQL, Redis, control-plane, UI, editor, Ollama and Open WebUI are healthy after boot.
- [ ] Cline uses Ollama with no paid model API credential.
- [ ] Model benchmark records real timing/tokens-per-second for the selected primary and fallback models.
- [ ] A private repository is opened as an external/ignored workspace and never appears in the public repo.
- [ ] Chat explains repository code, edits multiple files, runs lint/test/build and shows the real diff.
- [ ] A checkpoint/branch can restore the pre-change state.

## C. Local Bridge gate

- [ ] Bridge token is tenant/target scoped.
- [ ] Bridge can access an approved project folder.
- [ ] Bridge rejects a sibling/outside folder and symlink escape.
- [ ] Unknown/non-allowlisted command is rejected.
- [ ] Real `git_status`, `test`, `lint` and `build` jobs return exit code, duration and output hash.
- [ ] Kill/restart the bridge; LaunchAgent brings it back and a new job succeeds.

## D. GitHub end-to-end gate

- [ ] Open a real private test repository/workload.
- [ ] Create a branch.
- [ ] Make a controlled multi-file change.
- [ ] Review status/diff before commit.
- [ ] Push requires the intended approval policy.
- [ ] Open a PR and observe required CI/security checks.
- [ ] Intentionally failing CI can be read, repaired and re-run.
- [ ] Merge is allowed only after required checks pass.

## E. VPS/domain deployment gate

- [ ] Deployment worker uses a dedicated identity and secrets that are not in Git.
- [ ] Deploy an exact commit SHA to staging.
- [ ] Record deployment revision and health response.
- [ ] Force a failed health check and prove automatic rollback to the previous revision.
- [ ] Production deploy refuses to run without explicit approval.
- [ ] HTTPS is valid from desktop and mobile.
- [ ] PostgreSQL, Redis, Ollama and internal worker ports are not Internet-reachable.
- [ ] Metrics endpoint requires its separate bearer token.

## F. Sandbox gate

- [ ] Payload runs non-root with capabilities dropped.
- [ ] Payload sees only the approved workspace/runtime mounts.
- [ ] `/root`, host `/etc` and `/var/run/docker.sock` are inaccessible.
- [ ] No default network route exists unless an explicit egress profile is selected.
- [ ] CPU/RAM/process/runtime limits terminate abuse without taking down control-plane.

## G. GPU/Vast.ai gate

- [ ] Real GPU worker registers with a tenant-scoped `vast` token.
- [ ] Primary local/open-weight coding model answers an inference job.
- [ ] Benchmark records GPU, VRAM, load time, output tokens/s, task success and GPU-hours/cost.
- [ ] Primary model failure triggers configured fallback.
- [ ] Kill worker A after claim; lease expiry returns the job and worker B completes it.
- [ ] Ollama is not directly exposed to the public Internet.

## H. Multi-tenant/billing/observability gate

- [ ] Cross-tenant DB read is blocked by forced RLS.
- [ ] Cross-tenant queue claim is blocked by tenant+target keys.
- [ ] Cross-tenant WebSocket event leakage test passes.
- [ ] Billing signature tamper test returns 401.
- [ ] Billing event replay does not double-credit entitlement.
- [ ] Upgrade/downgrade/cancel/expiry transition changes effective entitlement correctly.
- [ ] Request rate limit and persistent fair-use behave per tenant/user.
- [ ] Dashboards/alerts cover requests, errors, jobs, worker health, queue depth, DB/Redis, deployment health and GPU capacity/cost.

## I. Capacity gate

Run against staging, not a local mock:

- [ ] 100 concurrent users meet latency/error thresholds.
- [ ] 500 concurrent users meet thresholds.
- [ ] 1,000 concurrent users meet thresholds.
- [ ] Record p50/p95/p99, error rate, DB pool/connection pressure, Redis latency, CPU/RAM and queue delay.
- [ ] Run GPU inference capacity separately; control-plane VU count is not proof of model throughput.

Default gate unless a stricter SLO is documented: HTTP failure rate <1%, p95 control-plane latency <750 ms for non-inference API operations, no cross-tenant errors, no exhausted DB pool, and no unrecovered queue lease.

## J. Disaster recovery gate

- [ ] Create PostgreSQL backup from staging.
- [ ] Restore into a clean database instance and verify critical table/data counts.
- [ ] Restore required application configuration from a documented secure source.
- [ ] Recreate control-plane/Redis/edge on a replacement host.
- [ ] Verify deployment rollback from a known-good revision.
- [ ] Record measured RPO and RTO; do not publish estimates as measured values.

## K. Dogfood/public-beta/GA gate

- [ ] A real private project is used daily without copying private source into the public platform repo.
- [ ] A small beta cohort completes real coding tasks and support incidents are measured.
- [ ] No open P0/P1 security issue remains.
- [ ] Capacity/economics support the advertised subscription/fair-use limits.
- [ ] Backup/restore and on-call/alert path are proven.

Only after all applicable boxes above are evidenced may the release status be changed to `GA READY`.
