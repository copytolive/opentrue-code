# TapeOut Hybrid Production v7

Primary mode: **HYBRID_MANUAL_EXECUTION**.

Machine side:

`SCAN -> SEARCH -> VERIFY -> PROOF -> CHAIN -> MARKET -> ECONOMICS -> STRESS -> P(PROFIT) -> TOP 10 -> TOP 1 -> MANUAL PACKAGE -> RECHECK -> MONITOR -> LEARN`

Human boundary:

`STILL_APPROVED -> official wallet transaction -> paste tx hash -> later record realized BEM/USD`

The Hybrid controller does **not** sign or broadcast wallet transactions and does not require a private key.

## Requested production flow

Statuses:

`SEARCHING -> CANDIDATE_FOUND -> DESIGN_VERIFIED -> OPPORTUNITY_APPROVED -> READY_FOR_MANUAL_TAPEOUT -> SUBMITTED_MANUALLY -> MONITORING -> REALIZED`

Live deterioration produces `DO_NOT_TAPEOUT`.

Implemented targets:

1. Hybrid decision state machine.
2. Immutable Manual TapeOut Package with circuit/netlist/proof/economics/expiry.
3. Live expiry/revalidation with immutable replacement package.
4. Manual transaction recorder from BNB tx hash + receipt + protocol-specific match.
5. Separate expected / paper / realized accounting.
6. Frozen forward predictions for L6 bootstrap calibration.
7. Local dashboard at `http://127.0.0.1:8787`.
8. TOP-10 opportunity watchlist.
9. Incumbent/competition monitoring.
10. Reward-aware search allocation.
11. Champion feedback into persistent search.
12. One-screen manual safety checklist.
13. Post-tapeout reward + slot monitoring.
14. Predicted-vs-realized learning, Brier/ECE/calibration curve/payback error.
15. Primary KPI: **Realized Net USD / Capital / Day**.

## Verification

Hybrid v7.0.0 final snapshot:

- `pytest`: **71 passed**
- import smoke: **71 modules / 0 failures**
- `compileall`: PASS
- hybrid config validation: PASS
- macOS shell syntax: PASS
- wheel build/install/CLI smoke: PASS
- wheel SHA-256: `9d5d6cf3f9f099c52fc91654796abb82c71eea8f7ea92f1fec043573fb340f12`
- full source ZIP SHA-256: `6455e3b211162bd2a5269856cbca928a48a6eb15e9b433ab1a9c65b49517a1eb`

## MacBook target

The intended local source directory is exactly:

`/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a`

Private runtime/operator data belongs under:

`.../a.a.a.a.a.a/.runtime/`

`.runtime`, `.hybrid.env`, SQLite state, logs, virtualenv and wallet/private-key material must never be committed.

## Live truth boundary

The bundled/public adapter templates are fail-closed. Do not mark them verified until the exact TapeOut/BNB deployment task schema, addresses, ABI, preview semantics and market route are independently checked.

L6 is also not pre-certified: it stays `PREDICTION_UNCERTIFIED` / `CALIBRATING` until real frozen recommendations and realized outcomes satisfy the configured global and recent-window statistical gates.
