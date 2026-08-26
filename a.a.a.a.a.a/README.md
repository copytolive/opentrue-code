# TapeOut Hybrid Production v7.1

Primary mode: **HYBRID_MANUAL_EXECUTION**.

Machine side:

`SCAN -> SEARCH -> VERIFY -> PROOF -> CHAIN -> MARKET -> ECONOMICS -> STRESS -> P(PROFIT) -> TOP 10 -> TOP 1 -> MANUAL PACKAGE -> RECHECK -> MONITOR -> LEARN`

Human boundary:

`STILL_APPROVED -> official wallet transaction -> paste tx hash -> later record realized BEM/USD`

The Hybrid controller does **not** sign or broadcast wallet transactions and does not require a private key.

## Localhost v7.1 fix

`ERR_CONNECTION_REFUSED` on `127.0.0.1:8787` is fixed at the bootstrap layer:

- disabled wallet execution no longer constructs an external signer;
- dashboard HTTP binds through a resilient facade before the full live engine is built;
- missing env/RPC/adapters produce `SETUP_REQUIRED` instead of killing the dashboard;
- the daemon persists and retries instead of launchd crash-looping;
- macOS installer and repair scripts prove `/api/summary` is reachable before reporting success.

Final verification:

- regression: **74 passed**;
- extracted final ZIP regression: **74 passed**;
- installed wheel dashboard smoke: PASS;
- missing-live-env localhost smoke: PASS;
- shell syntax: PASS;
- final ZIP SHA-256: `d12dc52f0d13aa14b86cbe774d7d4242657f15b3f74b7f79cddf868a181b1baa`;
- wheel SHA-256: `337305545ea6a85f81523d27f8b39450b66c029db9a9fe6a230ddee29c6ce7d1`.

## Requested production flow

Statuses:

`SEARCHING -> CANDIDATE_FOUND -> DESIGN_VERIFIED -> OPPORTUNITY_APPROVED -> READY_FOR_MANUAL_TAPEOUT -> SUBMITTED_MANUALLY -> MONITORING -> REALIZED`

Live deterioration produces `DO_NOT_TAPEOUT`.

Implemented targets include immutable manual packages, expiry/revalidation, manual tx recording, expected/paper/realized accounting, L6 forward calibration, local dashboard, TOP-10 watchlist, competition monitoring, reward-aware search, champion feedback, safety checklist, post-tapeout monitoring and the primary KPI **Realized Net USD / Capital / Day**.

## MacBook target

The intended local source directory is exactly:

`/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a`

Private runtime/operator data belongs under `.runtime/` and must not be committed.

Use `INSTALL_FROM_ZIP.command` with the verified `tapeout_hybrid_v7.1_FINAL.zip`; it upgrades the target path while preserving `.runtime`, `.hybrid.env`, `.venv` and SQLite state, then starts and verifies localhost.

## Readiness states

- `SETUP_REQUIRED`: dashboard is alive, but live settings are incomplete.
- `LOCAL_READY`: local engine/bootstrap is healthy.
- Live doctor must pass before live data is trusted.
- `MONEY READINESS: MANUAL OPPORTUNITY READY` only appears when current verified conditions and opportunity gates qualify.

No software can guarantee profit. Market price, liquidity, network weight and competitors can change. The system is designed to reject weak opportunities rather than promise returns.

## Live truth boundary

The bundled adapter templates are fail-closed placeholders. Do not mark them verified until the exact TapeOut/BNB deployment task schema, addresses, ABI, preview semantics and market route are independently checked.

The official TapeOut PoD page may itself be unavailable or unable to load chain deployment data at times; in that case the correct hybrid action is `SETUP_REQUIRED` / `WAIT`, not fabricated live data.

L6 is not pre-certified: it stays `PREDICTION_UNCERTIFIED` / `CALIBRATING` until real frozen recommendations and realized outcomes satisfy the statistical gates.
