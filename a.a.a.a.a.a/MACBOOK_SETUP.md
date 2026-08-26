# MacBook Hybrid v7 Setup

Target source path:

`/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a`

Hybrid v7 is designed as:

- MacBook background daemon: search / verify / proof / economics / monitoring / learning.
- Browser dashboard: `http://127.0.0.1:8787`.
- Wallet: manual only, outside the engine.
- Private runtime data: `.runtime/`.

## Install full source

The verified full-source distribution is `tapeout_hybrid_v7_FINAL.zip`.

Expected SHA-256:

`6455e3b211162bd2a5269856cbca928a48a6eb15e9b433ab1a9c65b49517a1eb`

Use `INSTALL_FROM_ZIP.command` in this directory and pass the downloaded ZIP path.

Example:

```bash
chmod +x INSTALL_FROM_ZIP.command
./INSTALL_FROM_ZIP.command "$HOME/Downloads/tapeout_hybrid_v7_FINAL.zip"
```

The installer verifies the SHA-256 before copying anything.

## Configure

After source installation:

```bash
cd '/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
cp .hybrid.env.example .hybrid.env
chmod 600 .hybrid.env
```

Fill only verified live values for BNB RPC, task collector, chain collector, protocol helper and exact BEM/stablecoin quote route.

Do not put a seed phrase or wallet private key in `.hybrid.env`.

## Start

```bash
./macos/install_hybrid.sh
```

Then open:

`http://127.0.0.1:8787`

Status:

```bash
./macos/status_hybrid.sh
```

## Manual operating loop

1. Wait for `READY_FOR_MANUAL_TAPEOUT`.
2. Click/run `RECHECK NOW`.
3. Continue only if the replacement package says `STILL_APPROVED` / `MANUAL TAPEOUT APPROVED`.
4. Execute the transaction manually in the official wallet/site.
5. Paste the resulting BNB transaction hash into the local dashboard.
6. Engine verifies receipt/task/processor/circuit/cost and moves to monitoring.
7. Record actual realized BEM/USD when sold.
8. Outcome enters L6 calibration and the next L8-style capital recommendation.

## Truth boundary

A successful software install does not itself prove the current TapeOut deployment adapter is correct, and it does not certify L6 >=90%. Live adapters must be audited and L6 only opens after sufficient real frozen forward predictions and realized outcomes pass the statistical gates.
