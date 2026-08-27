# TapeOut Hybrid v8.2.8 — Official currentRate emission semantics

Canonical tested source is the Library/installer ZIP. This release record intentionally does not claim byte-for-byte GitHub source parity.

## Root cause closed

The v8.2.7 live receipt proved the chain probe, protocol probe, 125 live tasks and market quote were healthy, but `chain_snapshots` still failed with an application-level `eth_call` revert before the per-task slot-view isolation could complete.

The audited TapeOut v8.1 frontend uses `currentRate()` as the live mining emission rate and derives a daily horizon by multiplying that per-second base-unit rate by 86,400. The adapter had still been reading `dailyEmission()` in the shared economic context.

v8.2.8 aligns the live economics with the official frontend:

`daily_emission_bem = currentRate_raw * 86400 / 1e8`

`currentRate()` selector: `0xf9f8bdb7`.

The v8.2.7 `bestSlot(taskId, processor)` / `bonusOf(taskId, C)` per-task/per-processor revert isolation remains in place. Shared economics and material view failures are now classified explicitly and remain fail-closed; they cannot authorize a manual package.

## Final build gate

- source regression: 140/140 PASS
- clean extracted ZIP regression: 140/140 PASS
- Python compileall: PASS
- package shell/command syntax: 14/14 PASS
- verifier syntax: PASS
- all-in-one syntax: PASS
- embedded ZIP is byte-for-byte identical to the canonical ZIP
- wallet boundary: MANUAL_ONLY; no signing/broadcast

## Canonical checksums

- ZIP `tapeout_hybrid_v8_2_8_CURRENT_RATE_PARITY_FINAL.zip`
  - SHA256 `521a35257e82ca05a443fca34c0c56c958be4476b7d5bad33865c675bbd2e76d`
- verifier `INSTALL_V828_FINAL_VERIFY.command`
  - SHA256 `321aece9ce50d285ec865ca942763c1c5215ea3fc2cecc4739bdd09ed3f3096c`
- all-in-one `TapeOut_V828_FINAL_ALL_IN_ONE.command`
  - SHA256 `f6c745ab541f64024ec5bbc0008ca69e76da4b529fa85aaf3c892e91ac1ebd09`
- recovery patch `V8_2_8_PATCH.diff`
  - SHA256 `706dff6645d90f3abf25250739403f949c4c134696babe2678c15342a7bec867`

## Live closeout criterion

Do not call the deployment 100% complete until the Mac verifier returns:

`FINAL STATUS: LIVE_READY_CURRENT_RATE_PARITY`

`LIVE_READY_SAFE_WAIT_GLOBAL_ECONOMICS`, `LIVE_READY_SAFE_WAIT_SLOT_VIEW`, or any `FAIL_CLOSED` result remains a safe non-executable state requiring further diagnosis.
