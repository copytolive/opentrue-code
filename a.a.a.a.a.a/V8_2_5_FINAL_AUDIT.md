# TapeOut Hybrid v8.2.5 — RPC-efficient live scan

## Trigger
Mac v8.2.4 reached `LIVE_READY_WATCHLIST_STABLE` and populated 10 observable WAIT rows, but all 10 carried the same live-chain transport failure: all configured BNB RPC endpoints failed for `eth_call`. The prior verifier therefore proved observability, not useful economic live-chain evaluation.

## Root cause
The scan invoked the external chain collector separately for each of 125 tasks. Each invocation re-read chain id/block/gas, core contract code, global mining weights/emission, BNB/USD, processor multipliers, transistor contracts/material prices, and task-specific slot/bonus. That multiplied read-only RPC traffic into thousands of HTTP calls and exhausted/rate-limited otherwise healthy public endpoints.

## v8.2.5 fix
- Adds audited `chain_snapshots` batch action.
- Reads chain-global and processor/material state once per whole 125-task scan.
- Batches task-specific `bestSlot` / `bonusOf` calls in bounded JSON-RPC chunks.
- Preserves endpoint failover and provides single-call fallback for providers without batch support.
- Core `ExternalCommandChainReader.snapshot_many()` parses every returned snapshot with the same chain-id/freshness/source verification used by single snapshots.
- L0-L8 foreground run uses `snapshot_many()` when available and explicitly avoids falling back into a 125-process RPC storm if the batch itself fails.
- RPC failures surface as `LIVE_CHAIN_RPC_UNAVAILABLE`; verifier must reject an all-RPC-error watchlist.
- Wallet remains MANUAL_ONLY. No signing/broadcast.

## Regression
- 127/127 tests PASS from the final extracted ZIP.
- `compileall` PASS.
- 14/14 shell/command scripts PASS `bash -n`.
- Batch collector reuses one common context and preserves per-task preview weights.
- External batch reader preserves snapshot order and verified freshness.
- Agent uses one batch snapshot call and zero serial snapshot calls during a multi-task scan.
