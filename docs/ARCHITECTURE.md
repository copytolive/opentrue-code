# OpenTrue Code architecture

OpenTrue Code is a local-first, multi-tenant coding platform. The public repository contains platform code only; private application repositories, credentials and model weights remain outside the public Git tree.

## Runtime layers

| Layer | Component | Trust boundary / purpose |
|---|---|---|
| Browser product | Next.js + Monaco + browser Git/WebLLM | Unified UI, project state and browser-local fallback |
| IDE agent | code-server + Cline | Repository-aware editor/chat; points to self-hosted Ollama |
| General chat | Open WebUI | Multi-model chat without automatic repository execution rights |
| Inference | Ollama | Local or GPU-hosted open-weight model serving; never public by default |
| Control plane | Node.js | Auth, RBAC, approval, jobs, billing entitlement, audit, metrics, WebSocket |
| Durable state | PostgreSQL | Tenant/user/project/job/audit/workspace/billing data with forced RLS |
| Queue/rate limit | Redis | Tenant+target queues, leases, heartbeat recovery, retry and rate limiting |
| Local execution | Local Bridge | Allowlisted tasks inside explicitly approved Mac/workspace roots |
| Untrusted execution | Bubblewrap worker | Non-root Linux sandbox with no host Docker socket and no default network |
| GPU execution | Vast/Ollama worker | Tenant-scoped inference worker with lease heartbeat and model fallback |
| Edge | Caddy | HTTPS and same-origin routing; internal databases/model ports stay private |

## Request path

1. A signed user token identifies `tenantId`, `userId`, role and plan.
2. The control-plane enforces RBAC, Redis rate limits and persistent fair-use limits.
3. A mutating/high-impact job defaults to `WAITING_APPROVAL` unless policy explicitly allows otherwise.
4. Approval moves the job to a Redis queue keyed by both target and tenant.
5. A worker with a target-scoped worker token claims only its tenant queue and receives a lease.
6. Long-running workers heartbeat the lease. Expired leases are recoverable and can be retried.
7. Completion stores a receipt, updates usage/audit state and broadcasts only to WebSockets from that tenant.

## Data isolation

PostgreSQL application access is performed with a non-superuser role. Tenant-owned tables use forced Row-Level Security and `app.tenant_id` transaction context. Redis queue keys include the tenant and target. Browser workspace sync is additionally scoped by tenant, user and project key with optimistic version checks.

## Execution boundaries

### Local Bridge

The bridge is intentionally not a general remote shell. It resolves the requested working directory through `realpath`, rejects paths outside configured approved roots and maps task names to an allowlist. Tokens are kept in local state, not Git.

### Sandbox

Untrusted code execution is separated from the control-plane. The Bubblewrap policy runs a non-root payload, exposes only the approved workspace plus required read-only runtime files, removes the host root filesystem and Docker socket, and unshares networking by default.

### GPU worker

Ollama remains private to the GPU host. The worker talks outbound to the HTTPS control-plane, claims a tenant-scoped `vast` queue, heartbeats, supports ordered model fallback, and returns hashed output receipts. A real GPU benchmark is required before production readiness.

## High availability model

Control-plane instances are intended to be replaceable/stateless apart from PostgreSQL and Redis. Worker leases make interrupted jobs recoverable. Production HA therefore depends on durable PostgreSQL backup/replication strategy, Redis persistence/recovery, more than one eligible worker for critical targets, and health-checked edge routing.

## Public exposure

Only Caddy/HTTPS should be Internet-facing. PostgreSQL, Redis and Ollama must not be published. Local development ports bind to `127.0.0.1`. Metrics require a separate bearer token.

## Truth boundary

Repository CI can prove code, migration, sandbox, backup drill and build properties. It cannot prove a user's Mac, a VPS, a domain, a payment provider, a GPU host or 1,000-user capacity until those exact targets execute the acceptance procedures and produce receipts.
