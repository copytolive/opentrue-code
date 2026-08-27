# TapeOut Hybrid v8.3.0 — Scan-Epoch Freshness Parity

Live v8.2.9 evidence proved the external protocol path is healthy:
- task collector: 125 verified tasks;
- chain/protocol/market probes: PASS;
- `chain_snapshots` smoke: PASS;
- `bestSlot`: 6/6 successful on PodMining;
- doctor: READY;
- dashboard: LIVE_READY.

The remaining v8.2.9 failure was internal wall-clock expiry during the same 125-task foreground scan: rows evaluated after the ordinary chain max-age were reclassified as `CHAIN` stale even though the batch had been acquired inside that exact `run_once()` and pinned to its verified BNB block.

v8.3.0 correction:
- current-run `snapshot_many()` results form one in-memory verified scan epoch;
- per-row screening does not re-apply the ordinary wall-clock max-age cutoff to that same current-run batch;
- the exception is valid only for objects acquired by the current `run_once()` and still requires `verified_source=true` plus exact freshness/block-number agreement;
- stale single-task snapshots and non-current-run data still fail closed;
- final actionable `EXTREME_PREFLIGHT` still reacquires fresh task + chain + market quote before any package is frozen;
- package TTL and manual execution safety are unchanged;
- wallet remains `MANUAL_ONLY`; no signing or broadcasting was added.

Final artifact gates:
- 145/145 tests PASS from the canonical ZIP extracted to a clean directory;
- `python3 -m compileall -q src adapters` PASS;
- 14/14 internal `.sh` / `.command` syntax PASS;
- standalone verifier `bash -n` PASS;
- all-in-one `bash -n` PASS;
- embedded ZIP is byte-for-byte identical to canonical ZIP;
- archive excludes `.hybrid.env`, `.venv`, `.runtime`, pytest caches and Python bytecode caches;
- live verifier rejects any current-scan wall-clock `stale data` regression before declaring success.

Canonical ZIP SHA256: `07a76c22a6f846765289e012ef27e07e4dabdcb36efb9604952365f280c19c73`
Verifier SHA256: `c8db36c3896e8b4ce3b890545078420ac70bf8355826eb835c0dd940656e7f3c`
All-in-one SHA256: `1b8b16c8930ec1693b74873dde61dac98e82f8362147960f7c34b3575aa90ade`
Recovery patch SHA256: `bb97ae411f96344759e24b8482ba6e0004a586c825620f9b19daedeb5628b6f8`
