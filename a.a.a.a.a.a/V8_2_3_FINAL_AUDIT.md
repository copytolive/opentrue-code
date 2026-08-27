# TapeOut Hybrid v8.2.3 — Stable Live Scan / Operator UX Hotfix

## Why v8.2.3 exists

v8.2.2 fixed the empty-watchlist startup path, but review of the operator screenshots exposed a second independent issue: dashboard `LIVE_READY` depended on a 180-second doctor cache. A long search-farm shard could prevent the daemon from refreshing doctor in time, so a healthy live system could visually fall back to `SETUP_REQUIRED`. The doctor button also exposed a large raw JSON alert.

## Fixes

- Heavy persistent search-farm work runs in one guarded background daemon thread; foreground live scan and 60-second daemon cadence no longer wait for large optimizer shards.
- `ResilientHybridFacade` accepts a recent shared-store scan heartbeat as live readiness evidence when the doctor cache is stale. The heartbeat requires a recent scan, positive processed count, and at least one evaluated candidate; an empty/stale snapshot cannot fake `LIVE_READY`.
- Existing fast foreground path remains: official verified reference designs immediately seed all 125 audited combinational tasks and progress snapshots are persisted after each task.
- Doctor popup is concise (`READY` or blockers) instead of dumping raw JSON.
- Empty Manual Packages and L6 sections explain that no package/calibration is normal before qualified/realized outcomes exist.

## Safety

- Wallet remains `MANUAL_ONLY`.
- No private key, seed phrase, signing, or broadcast was added.
- Scan heartbeat can only extend readiness after real candidate evaluation; it does not manufacture opportunities or bypass economics/risk gates.
- `WAIT` remains valid.

## Final regression gates

- pytest: **120/120 PASS**
- `python -m compileall src adapters`: **PASS**
- shell/command syntax: **14/14 PASS**
- inherited audited reference baseline: **125/125 verified full-domain combinational tasks**
- operator UI: incremental scan progress + concise doctor + no false empty-state wording
