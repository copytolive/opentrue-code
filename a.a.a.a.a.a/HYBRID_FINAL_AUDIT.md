# Hybrid v7 Final Audit

Version: `7.0.0`

Primary mode: `HYBRID_MANUAL_EXECUTION`

## Final verification evidence

- Full regression suite: **71 passed**
- Import smoke: **71 modules, 0 failures**
- Python `compileall`: **PASS**
- Hybrid configuration validation: **PASS**
- macOS shell syntax validation: **PASS**
- Wheel build: **PASS**
- Isolated wheel install: **PASS**
- Installed `tapeout-hybrid --help`: **PASS**

Wheel SHA-256:

`9d5d6cf3f9f099c52fc91654796abb82c71eea8f7ea92f1fec043573fb340f12`

Full source ZIP SHA-256:

`6455e3b211162bd2a5269856cbca928a48a6eb15e9b433ab1a9c65b49517a1eb`

## Requested 15 hybrid targets

1. Hybrid state machine — DONE.
2. Manual TapeOut Package — DONE.
3. Expiry/revalidation — DONE.
4. Manual transaction recorder — DONE.
5. Expected/paper/realized accounting — DONE.
6. Frozen-prediction L6 bootstrap — DONE.
7. Local opportunity dashboard — DONE.
8. TOP-10 watchlist — DONE.
9. Competition monitor — DONE.
10. Reward-aware search allocation — DONE.
11. Search champion improvement loop — DONE.
12. One-screen manual safety checklist — DONE.
13. Post-tapeout competitor/reward monitoring — DONE.
14. Learning/calibration report — DONE.
15. KPI `Realized Net USD / Capital / Day` — DONE.

## Wallet boundary

Hybrid v7 does not sign or broadcast wallet transactions. It does not need or store a private key. Wallet execution stays manual.

## Fail-closed boundaries

`verified=true` for an adapter is an operator/audit assertion and is not inferred automatically. Unknown or stale task/chain/market/protocol data results in WAIT / DO_NOT_TAPEOUT.

## L6 truth

The calibration gate exists and is tested, but a fresh deployment is not pre-certified at 90%. It requires immutable forward predictions followed by real realized outcomes, with sufficient sample count, global and recent-window 95% Wilson lower bounds meeting the configured threshold, and Brier/ECE limits passing.
