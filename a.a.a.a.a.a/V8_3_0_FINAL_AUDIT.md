# TapeOut Hybrid v8.3.0 — Scan-Epoch Freshness Parity

Live v8.2.9 evidence proved the external protocol path is healthy:
- task collector: 125 verified tasks;
- chain/protocol/market probes: PASS;
- `chain_snapshots` smoke: PASS;
- `bestSlot`: 6/6 successful on PodMining;
- doctor: READY;
- dashboard: LIVE_READY.

The remaining v8.2.9 failure was internal wall-clock expiry during the same 125-task foreground scan: rows evaluated after ~45 seconds were reclassified as `CHAIN` stale even though the batch had been acquired inside that exact `run_once()` and pinned to its verified BNB block.

v8.3.0 correction:
- current-run `snapshot_many()` results form one in-memory verified scan epoch;
- per-row screening does not re-apply the ordinary wall-clock max-age cutoff to that same current-run batch;
- the exception is valid only for objects acquired by the current `run_once()` and still requires `verified_source=true` plus exact freshness/block-number agreement;
- stale single-task snapshots and non-current-run data still fail closed;
- final actionable preflight still reacquires fresh task + chain + market quote before any package is frozen;
- package TTL and manual execution safety are unchanged;
- wallet remains `MANUAL_ONLY`; no signing or broadcasting was added.

Final clean-package gates:
- 145/145 tests PASS from the canonical ZIP extracted to a clean directory;
- `python3 -m compileall -q src adapters` PASS;
- 14/14 internal `.sh` / `.command` syntax PASS;
- standalone verifier syntax PASS;
- all-in-one syntax PASS;
- embedded ZIP is byte-for-byte identical to canonical ZIP.

Canonical ZIP SHA256: `6fa81449523a17d109f3a3333289212a170aefa18308e2bd9a1831c854711343`
Verifier SHA256: `f73cbe4177625dba238f084fc90b9eb670bfdd2e5aa29c9c2b9fa79c103f2a77`
All-in-one SHA256: `bfc0ccb537798697d4f98b616e89e040791f805d0d814d1d0dbb060eea5be89f`
Recovery patch SHA256: `529b99f217950dc1caaf87b13a586e2ebb0253b50bcd4bada0705506ada1be55`
