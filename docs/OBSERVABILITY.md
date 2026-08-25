# Observability and SLO runbook

OpenTrue Code exposes a bearer-protected Prometheus-format control-plane endpoint at `/metrics`. Production monitoring must scrape it over the private/service network or through a protected route; the metrics token is distinct from user and worker tokens.

## Minimum signals

### Control-plane

- request rate and p50/p95/p99 latency at the reverse proxy/APM layer;
- `opentrue_requests_total`;
- `opentrue_errors_total`;
- `opentrue_rate_limited_total`;
- `opentrue_jobs_created_total` / `opentrue_jobs_terminal_total`;
- WebSocket connection count;
- process RSS and uptime;
- `/health` status including PostgreSQL and Redis.

### PostgreSQL

Track active/max connections, transaction latency, locks, slow queries, disk usage, backup age and replication lag when replicas are used. `DB_POOL_SIZE` must stay below the database connection budget across all control-plane replicas.

### Redis

Track command latency, memory, evictions, persistence status, queue sorted-set depth, processing depth and lease recovery rate. Queue depth must be split by target/tenant during incident analysis; never export tenant identifiers into a public dashboard.

### Workers

For Local Bridge/sandbox/GPU workers retain claim time, heartbeat age, attempt, terminal status, duration and output hash. GPU workers additionally record model used, attempted fallback models, load time, output tokens/s, GPU utilization/VRAM and instance cost for the measurement window.

### Deployment

Every deployment receipt must record target/environment, exact commit SHA, previous revision, start/end time, health result and rollback revision if used.

## Initial SLOs

These are launch defaults, not permanent guarantees:

- control-plane availability: >=99.9% during beta measurement windows;
- non-inference API failure rate: <1%;
- non-inference API p95: <750 ms at the 1,000-VU acceptance stage;
- lost accepted jobs: 0;
- cross-tenant events/data: 0;
- unrecovered expired leases: 0;
- production deployment without approval: 0.

GPU latency gets a separate SLO by model/hardware class; do not merge model-generation latency with control-plane HTTP latency.

## Alerts

At minimum page/notify on: control-plane health failure, PostgreSQL unavailable or pool saturation, Redis unavailable, persistent queue growth, worker heartbeat/claim outage for a required target, backup age over policy, repeated deployment rollback, high error rate, disk exhaustion and GPU fleet capacity below demand.

## Incident evidence

Do not paste secrets into dashboards. Correlate incidents by generated job ID, worker ID, deployment revision and hashed output. Audit logs remain tenant-scoped.
