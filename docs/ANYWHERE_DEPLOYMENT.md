# Anywhere deployment

OpenTrue Code is browser-based, but production is not a single public Docker host. Keep the Internet edge, control-plane, deployment workers, untrusted sandbox and GPU inference as separate trust boundaries whenever scale/security require it.

## Public edge

Caddy is the only component intended to accept public traffic. Production DNS points the selected app domain to the edge/VPS and TCP 80/443 are open for HTTPS. PostgreSQL, Redis, Ollama, Docker and worker control ports stay private.

The repository Caddy configuration routes the browser UI/editor/chat/control-plane paths while preserving same-origin access where required. Validate the final domain from desktop and mobile and verify that internal ports are not reachable from the Internet.

## Core service start

On a trusted host:

```bash
cp .env.example .env
# replace every placeholder with secrets from the host/provider secret store
docker compose --profile production up -d
./scripts/health-check.sh
```

Do not use placeholder secrets in production. Keep `.env` outside Git.

## Dedicated deployment workers

Deployment is not performed by the browser or control-plane process. Install a resident worker on each target environment. A staging worker receives only a `deploy-staging` token; production receives only `deploy-production`.

Mint the worker token from a secure operator context:

```bash
ROLE=worker WORKER_TARGET=deploy-staging \
TENANT_ID='<tenant-uuid>' USER_ID='<worker-uuid>' \
AUTH_SIGNING_SECRET='<control-plane-signing-secret>' \
node scripts/mint-token.mjs
```

On the target host, pre-provision a dedicated non-root deployment account and a Git working tree owned by that account. Then install the systemd worker:

```bash
sudo env \
  CONTROL_PLANE_URL='https://code.example.com/api' \
  CONTROL_PLANE_TOKEN='<target-scoped-worker-token>' \
  DEPLOY_TARGET='deploy-staging' \
  DEPLOY_ROOT='/srv/my-app' \
  HEALTH_URL='https://staging.example.com/health' \
  ./scripts/install-deploy-worker-linux.sh
```

The production worker uses a different token, working tree and `HEALTH_URL`. Worker secrets are written to a root-only environment file and never committed.

## Deployment job contract

Create a job with:

- target: `deploy-staging` or `deploy-production`;
- task: `deploy`;
- args: exactly one full 40-character Git commit SHA.

The control-plane forces both deployment targets into `WAITING_APPROVAL` even if a client requests `requiresApproval=false`. An owner/admin approval is required before the environment-scoped worker can claim it.

The worker fetches origin, verifies the exact commit, deploys with Docker Compose, probes the fixed environment `HEALTH_URL`, and rolls back to the previous revision when health fails. Its receipt includes environment, revision, previous revision, health target, rollback state, exit code, duration and output hash.

## GPU inference

Run Ollama on a GPU worker/Vast.ai host and keep port 11434 private. The worker makes an outbound HTTPS connection to the control-plane. Use `OLLAMA_MODELS` for an ordered primary/fallback list and benchmark the actual host with `scripts/model-benchmark.mjs`. See `docs/GPU_WORKER.md`.

## Subscription/fair-use policy

The product can present conversations/tasks as subscription usage instead of token billing, but internal controls still enforce concurrency, daily jobs, runtime, rate limits and managed compute. This prevents one tenant from consuming the entire shared GPU fleet and keeps pricing measurable.

## Production acceptance

A configuration file is not proof. Retain real receipts for TLS/routing, staging deployment, forced rollback, production approval denial, GPU inference/failover and the 100/500/1,000-user staging load test before GA.
