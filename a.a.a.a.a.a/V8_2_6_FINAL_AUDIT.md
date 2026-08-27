# TapeOut Hybrid v8.2.6 — provider-compatible adaptive RPC

## Trigger
v8.2.5 proved the base BNB provider path was alive (`probe` reached chain 56) but its `chain_snapshots` smoke test failed because the configured public RPC endpoints rejected or throttled the raw JSON-RPC batch/fallback burst.

## Root cause
Batch support is not guaranteed by JSON-RPC providers. The official TapeOut frontend recovered in the v8.1 evidence performs ordinary provider calls for `bestSlot(uint32,address)` and `bonusOf(uint32,uint256)` and does not require raw batch arrays. v8.2.5 treated batch as the preferred transport and its fallback still issued a burst of single calls through the full failover boundary.

## Fix
- One shared chain/material context remains cached for the whole scan.
- Batch capability is probed with exactly two calls at most once per endpoint.
- If no endpoint accepts that minimal batch, the scan immediately switches to paced sticky serial calls.
- If minimal batch support is proven, larger chunks are capped at 8 and split only when that known-capable endpoint rejects a larger chunk.
- Sticky serial uses bounded pacing, endpoint failover, and one recovery round.
- Single endpoint calls retry transient transport failures once.
- JSON-RPC application errors are surfaced distinctly instead of being silently collapsed into generic provider failure.
- No RPC URL is persisted.
- Wallet remains MANUAL_ONLY.

## Local package gate
- 130/130 regression tests PASS.
- compileall PASS.
- 14/14 shell/command syntax PASS.
- clean ZIP re-extraction retested PASS.

Final ZIP SHA256: `c5a2ac2bca0ebefbfd7ab476c12eb846d9b9cf0bf8c18eec676c787cefe1fad7`.
