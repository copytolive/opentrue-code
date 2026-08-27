# TapeOut Hybrid v8.2.1 — Live Multiplier Drift Hotfix

Date: 2026-08-27

## Live failure reproduced from Mac receipt

The v8.2 Mac live verifier reached BNB Chain 56, loaded 125 audited live tasks,
validated all three adapter executables, validated the protocol selector and
market quote, but failed closed because `processorMultiplier(RefBench)` no
longer equaled the value pinned in the earlier official deployment JSON.

## Root cause

The v8.2 collector treated the deployment JSON multiplier as immutable. That
was stricter than the official TapeOut frontend behavior. The audited official
frontend calls `processorMultiplier(address)` live and treats **zero** as
"not participating in mining"; it does not require equality with the stale
configuration multiplier before commit/tapeout. The mining contract's live
value is therefore authoritative for current mining economics.

## Fix

- Processor addresses remain pinned to the audited official deployment.
- `processorMultiplier(address)` is read live from the audited mining contract.
- A positive changed multiplier is accepted, recorded as drift, and used in
  preview/reward economics.
- A zero multiplier marks that processor inactive and excludes it from candidate
  economics without taking unrelated active processors offline.
- Invalid uint32-range values and the case where every audited processor is
  inactive remain fail-closed.
- Wallet boundary remains **MANUAL_ONLY**; no signing or broadcast was added.

## Regression additions

Two regressions cover positive multiplier drift and a zero/inactive processor.
The full suite must pass again from the final extracted distribution before
release.

## Build regression status

- pytest: **114/114 PASS**.
- Python `compileall`: PASS.
- shell/command syntax: **14/14 PASS**.
- package metadata target: **8.2.1**.

The final ZIP is tested again after extraction; its checksum is recorded only
after that replay passes.
