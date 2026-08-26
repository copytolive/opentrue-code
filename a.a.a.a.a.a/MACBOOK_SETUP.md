# MacBook Hybrid v7.1 Setup / Repair

Target source path:

`/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a`

## If you see ERR_CONNECTION_REFUSED

That means no process is listening on `127.0.0.1:8787`.

Upgrade to the verified `tapeout_hybrid_v7.1_FINAL.zip` using `INSTALL_FROM_ZIP.command`, then run:

```bash
cd '/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
./macos/repair_hybrid.sh
```

Prove HTTP locally:

```bash
curl -fsS http://127.0.0.1:8787/api/summary | python3 -m json.tool
open http://127.0.0.1:8787
```

Expected behavior:

- incomplete live settings -> page opens with `SETUP_REQUIRED`;
- local bootstrap healthy -> `LOCAL_READY`;
- live doctor healthy -> live readiness passes;
- current qualified opportunity -> `MONEY READINESS` can show `MANUAL OPPORTUNITY READY`.

## Install full source

Verified distribution: `tapeout_hybrid_v7.1_FINAL.zip`

SHA-256:

`d12dc52f0d13aa14b86cbe774d7d4242657f15b3f74b7f79cddf868a181b1baa`

Example:

```bash
chmod +x INSTALL_FROM_ZIP.command
./INSTALL_FROM_ZIP.command "$HOME/Downloads/tapeout_hybrid_v7.1_FINAL.zip"
```

The installer verifies SHA-256 before copying, preserves private/runtime state, installs the Python environment, starts both launch agents and verifies `/api/summary` before reporting dashboard success.

## Configure live values

Edit `.hybrid.env` and fill only verified values for:

- BNB RPC;
- task collector;
- chain collector;
- TapeOut protocol helper;
- BEM token;
- stablecoin token;
- Pancake V3 quoter/route.

Never put a seed phrase or wallet private key in `.hybrid.env`.

Then run:

```bash
./macos/doctor_hybrid.sh
```

The bundled adapters are intentionally fail-closed placeholders; the doctor rejects them as live/money-ready.

## Diagnostics

```bash
./macos/repair_hybrid.sh
./macos/doctor_hybrid.sh
./macos/status_hybrid.sh
```

Logs:

```bash
tail -100 .runtime/logs/dashboard.err.log
tail -100 .runtime/logs/dashboard.out.log
tail -100 .runtime/logs/daemon.err.log
```

## Manual operating loop

1. Wait for `READY_FOR_MANUAL_TAPEOUT`.
2. Run/click `RECHECK NOW`.
3. Continue only on `STILL_APPROVED` / `MANUAL TAPEOUT APPROVED`.
4. Execute the official wallet transaction manually.
5. Paste the resulting BNB transaction hash into the local dashboard.
6. Engine verifies receipt/task/processor/circuit/cost and monitors the position.
7. Record actual realized BEM/USD when sold.
8. Outcome feeds L6 calibration and later recommendations.

A working dashboard does not guarantee a profitable opportunity. Profit depends on live protocol, market and competitor conditions.
