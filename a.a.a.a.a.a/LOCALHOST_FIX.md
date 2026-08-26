# Localhost 8787 Fix — Hybrid v7.1

The screenshot `ERR_CONNECTION_REFUSED` means no process was listening on `127.0.0.1:8787`.

## Root cause fixed

Hybrid v7.0 could die before binding HTTP because a disabled execution block still attempted signer construction and the dashboard built the full live engine before starting the web server.

Hybrid v7.1 changes this:

- disabled wallet execution never constructs a signer;
- dashboard binds through a resilient facade first;
- missing env/RPC/adapters show `SETUP_REQUIRED` instead of killing HTTP;
- daemon retries in place instead of launchd crash-looping;
- `doctor_hybrid.sh` checks configuration, BNB chain ID, live task source and exact-size market quote;
- `repair_hybrid.sh` restarts services and proves localhost reachability;
- installer waits for `/api/summary` before reporting success.

## Repair

```bash
cd '/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
./macos/repair_hybrid.sh
curl -fsS http://127.0.0.1:8787/api/summary | python3 -m json.tool
open http://127.0.0.1:8787
```

If the page opens with `SETUP_REQUIRED`, the localhost problem is fixed. Configure audited live values in `.hybrid.env`, then run `./macos/doctor_hybrid.sh`.

`MONEY READINESS` stays `LIVE DATA NOT READY` until verified live checks pass. No software can guarantee future profit; the engine only approves a current manual opportunity when its configured economic, stress and probability gates pass.
