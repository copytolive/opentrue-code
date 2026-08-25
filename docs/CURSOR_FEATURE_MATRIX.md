# Cursor feature parity acceptance matrix

`REPO PASS` proves deterministic implementation and tests. `TARGET PASS` requires a valid receipt from the real component that executed the workflow. A receipt must use `schemaVersion: 1`, `status: PASS`, a real `target`, an ISO `observedAt`, and non-empty `evidence`; secret-like fields are rejected.

| Capability | Repository proof | Required target proof |
|---|---|---|
| Ask / Plan / Agent / Debug | `agent-runtime/src/runtime.mjs`, runtime tests | real approved workspace conversation/task |
| Tab autocomplete / inline edit | `completion.mjs`, completion tests, Monaco inline provider | latency and accepted-completion browser receipt |
| Multi-file Composer | edit engine, patchset tests, checkpoints | reviewed multi-file change receipt |
| Repository intelligence | lexical/semantic index and symbol/dependency tests | real large repository search receipt |
| Terminal repair loop | allowlisted profiles and quality loop | lint/test/build failure → repair receipt |
| Browser agent | CDP policy, navigation/action implementation | screenshot plus console/network receipt |
| Git workflow | `GitAgent` approval gates | branch → edit → test → commit → push → PR → CI → merge |
| Checkpoint / rollback | checkpoint tests | real workspace restore receipt |
| Rules, memory, skills, MCP | context loader and MCP tests | real project rule/MCP invocation receipt |
| Subagents / background agents | worktree orchestration and installers | isolated parallel worktree and restart receipts |
| Multi-repository | coordinator and tests | approved real multi-repo task receipt |
| Bugbot | diff scanner and PR workflow | real PR finding/clean review evidence |
| Web / desktop / mobile control | Monaco PWA and `/agent` control | responsive device and Local Bridge receipts |
| Remote / VPS agent | deploy worker, exact-SHA health/rollback | staging deploy and forced rollback receipts |
| Unlimited Chat | paid plans have no daily job/token quota; concurrency/runtime/priority remain enforced | billing entitlement and sustained-load economics receipt |
| Ollama / GPU routing | model router, benchmark, Vast scheduler/autoscaler | real GPU benchmark, failover, scale-up/down receipts |

The product is not declared fully parity-complete or GA until every applicable target proof is valid and `node scripts/cursor-parity-evidence.mjs --require-target` succeeds.
