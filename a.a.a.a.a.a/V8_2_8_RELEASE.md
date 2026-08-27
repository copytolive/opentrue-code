# TapeOut Hybrid v8.2.8 — Official currentRate emission semantics

Canonical tested source is the Library/installer ZIP. This release record intentionally does not claim byte-for-byte GitHub source parity.

## Root cause closed

The v8.2.7 live receipt showed the chain probe was healthy but `chain_snapshots` reverted before per-task slot isolation completed. The audited TapeOut v8.1 frontend uses `currentRate()` as the live mining emission rate and derives a daily horizon by multiplying the per-second rate by 86,400. The adapter had still been reading `dailyEmission()` in the shared economic context.

v8.2.8 changes the live economic source to:

`daily_emission_bem = currentRate_raw * 86400 / 1e8`

`currentRate()` selector: `0xf9f8bdb7`.

The v8.2.7 bestSlot/bonusOf per-task/per-processor revert isolation remains in place. Deterministic view reverts remain fail-closed and cannot authorize a manual package.

## Final build gate

- clean source regression: 140/140 PASS
- clean extracted ZIP regression: 140/140 PASS
- Python compileall: PASS
- package shell/command syntax: 14/14 PASS
- verifier syntax: PASS
- all-in-one syntax: PASS
- embedded ZIP is byte-for-byte identical to the canonical ZIP
- wallet boundary: MANUAL_ONLY; no signing/broadcast

## Canonical checksums

- ZIP `tapeout_hybrid_v8_2_8_CURRENT_RATE_FINAL.zip`
  - SHA256 `2e0d2635f5b18512d864d025e02b2b9c2888e0bb5472703cab9dec9d17d72aff`
- verifier `INSTALL_V828_FINAL_VERIFY.command`
  - SHA256 `a6e3035531a580e4344d9678b7ab10941b21d7fc3d1354c068366ca870f7bf43`
- all-in-one `TapeOut_V828_FINAL_ALL_IN_ONE.command`
  - SHA256 `d2be58b8f462eb43968d5ecc76e6ed7d163fc95df51d13951e4f1850af8a3e55`

## Live closeout criterion

Do not call the deployment 100% complete until the Mac verifier returns `FINAL STATUS: LIVE_READY_CURRENT_RATE`. `LIVE_READY_SAFE_WAIT_GLOBAL_ECONOMICS` or `LIVE_READY_SAFE_WAIT_SLOT_VIEW` remains a safe, non-executable WAIT state requiring further diagnosis.
