# OpenTrue Code — Cursor Parity Contract

This document separates **repository capability** from **real target evidence**. Code existing in Git is not treated as proof that a Mac, browser, GitHub account, VPS, GPU, production domain, payment provider, or 1,000-user staging environment actually executed it.

## Repository-side parity

| Area | Implemented evidence |
|---|---|
| Agent / Ask / Plan / Debug | `agent-runtime/src/runtime.mjs`, `opentrue ask|plan|agent|debug` |
| Repo intelligence | offline deterministic index, symbols/references, dependency graph, multi-repo context, Ollama `/api/embed` semantic index with fallback |
| Edit engine | per-hunk acceptance, atomic multi-file patchset, checkpoint/restore, NDJSON streaming diff |
| Terminal agent | allowlisted test/build/lint/typecheck plus `opentrue verify --yes` auto-debug/retest loop |
| Browser agent | Chrome DevTools Protocol navigate/click/type/evaluate/screenshot + Runtime/Network event capture |
| Git agent | branch/diff/commit/push/PR/checks/merge/worktree; remote mutation approval-gated |
| Rules / memory / skills | `AGENTS.md`, `.opentrue/rules`, `.opentrue/skills`, local ignored memory |
| MCP | stdio JSON-RPC client plus built-in repository MCP server and end-to-end test |
| Subagents | isolated Git worktrees with configurable parallel execution |
| Background agents | Local Bridge worker model plus hardened Linux systemd installer |
| CLI | `agent-runtime/bin/opentrue.mjs` |
| Bugbot | diff risk scanner plus pull-request workflow gate |
| Automations | scheduled maintenance evidence plus Dependabot |
| Web/mobile | `/agent` submits jobs, approval, polling, output and worker receipts through control-plane |
| Multi-repo | coordinator plans across repositories, checkpoints each repo, then executes scoped agents in parallel |
| Deploy agent | exact-revision staging/production worker, health check, rollback and receipt |
| Model router | ordered local/open model failover and benchmark metadata |
| GPU fleet | Vast worker + fail-closed Vast autoscaler with min/max, price/reliability/VRAM filters and opt-in destruction |
| Team platform | HMAC auth, RBAC, tenant RLS, Redis queues, audit, fair-use and billing entitlement primitives |
| Capacity / DR / security | 100/500/1000 staging workflow, backup/restore drill, secret/vulnerability/container scans and SBOM |

## CLI examples

```bash
# Read-only
node agent-runtime/bin/opentrue.mjs ask "Where is authentication enforced?"
node agent-runtime/bin/opentrue.mjs plan "Add a user settings page"
node agent-runtime/bin/opentrue.mjs semantic-search "tenant isolation"

# Write-capable; explicit approval
node agent-runtime/bin/opentrue.mjs agent "Fix the failing tests" --yes
node agent-runtime/bin/opentrue.mjs verify --yes
node agent-runtime/bin/opentrue.mjs patch-preview patchset.json
node agent-runtime/bin/opentrue.mjs patch-apply patchset.json --yes

# Browser
node agent-runtime/bin/opentrue.mjs browser http://localhost:3000 browser-actions.json

# MCP
node agent-runtime/bin/opentrue.mjs mcp-tools repo
node agent-runtime/bin/opentrue.mjs mcp-call repo repo_search '{"query":"deploy rollback"}'

# Parallel isolated worktrees
node agent-runtime/bin/opentrue.mjs subagents tasks.json --yes

# Coordinated multi-repo
node agent-runtime/bin/opentrue.mjs multi-agent multi-repo.json --yes
```

## Multi-repo manifest

```json
{
  "objective": "Change the API contract and update every client",
  "projects": [
    {"name":"backend","root":"/absolute/backend","role":"API"},
    {"name":"frontend","root":"/absolute/frontend","role":"Web UI"},
    {"name":"infra","root":"/absolute/infra","role":"Deployment"}
  ]
}
```

## Real-target acceptance receipts

Run:

```bash
node scripts/cursor-parity-evidence.mjs --require-repo
```

This must pass before merge. It writes `receipts/cursor-parity.json`.

Full operational acceptance additionally requires these target receipts under ignored `receipts/target/`:

- terminal auto-fix against a real approved workspace;
- Chrome/Chromium browser task with screenshot + console/network evidence;
- real GitHub branch → commit → push → PR → checks → merge;
- parallel subagent worktrees;
- persistent Linux/VPS background agent;
- web/mobile control to a real Local Bridge;
- multi-repo execution against real repositories;
- staging deployment and production rollback drill;
- local/Vast model benchmark and actual GPU fleet scale event;
- live billing-provider webhook and monitoring alert;
- 100, 500 and 1,000 VU staging results;
- disaster-recovery restore drill;
- red-team/isolation result;
- production domain/HTTPS evidence.

Only when `node scripts/cursor-parity-evidence.mjs --require-target` passes may the complete operational parity/GA evidence gate be called passed.

## Security boundaries

- Workspace filesystem access remains constrained to approved roots.
- Browser navigation defaults to localhost/loopback; additional hosts require an explicit allowlist.
- Agent writes and destructive restore require approval.
- Push, PR creation and merge require explicit approval.
- Production deploy remains a separate approval-gated worker target.
- Vast scale-down permanently destroys instances, so it is disabled unless `VAST_ALLOW_DESTROY=true`.
- Local Ollama is preferred; the deterministic offline index remains available when embeddings are not loaded.
