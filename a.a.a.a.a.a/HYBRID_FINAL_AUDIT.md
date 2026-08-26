# TapeOut Hybrid v7.1 — Final Audit

## Software verification

- Regression suite: **74 passed**
- Extracted final ZIP regression: **74 passed**
- Installed wheel dashboard smoke: **PASS**
- Missing-live-env localhost resilience: **PASS**
- macOS shell syntax: **PASS**
- Hybrid wallet boundary: manual only
- Dashboard: `127.0.0.1:8787`

Final distribution hashes:

- `tapeout_hybrid_v7.1_FINAL.zip`
  - SHA-256: `d12dc52f0d13aa14b86cbe774d7d4242657f15b3f74b7f79cddf868a181b1baa`
- `tapeout_design_engine-7.1.0-py3-none-any.whl`
  - SHA-256: `337305545ea6a85f81523d27f8b39450b66c029db9a9fe6a230ddee29c6ce7d1`

## Localhost incident fix

The `ERR_CONNECTION_REFUSED` failure mode was reproduced conceptually and fixed at the bootstrap boundary. The final tests explicitly start the dashboard with required live environment variables absent and verify that HTTP still responds with `SETUP_REQUIRED`.

Root fixes:

1. disabled execution no longer constructs an external signer;
2. dashboard starts through `ResilientHybridFacade` before full live-engine construction;
3. incomplete setup does not crash the HTTP service;
4. daemon remains alive and retries;
5. installer/repair scripts verify `/api/summary` before success.

## Money truth boundary

A functioning local application does not guarantee profit. `MONEY READINESS` requires verified live data and a current opportunity that passes the economic/stress/probability/recheck gates.

The public/bundled live adapters remain fail-closed placeholders unless replaced by audited production adapters. No private key is required by Hybrid mode.

## L6

L6 is not pre-certified. It stays `PREDICTION_UNCERTIFIED` / `CALIBRATING` until real frozen forward recommendations and realized outcomes satisfy the statistical requirements.
