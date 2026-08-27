# TapeOut Hybrid v8.2 — Final Adapter Audit

Date: 2026-08-27

## Evidence basis

The v8.2 adapter manifest was pinned from the user-collected official TapeOut
v8.1 evidence bundle. That bundle contains official `pod-mainnet.json`,
`pod-vectors-all.json`, `pod-refimpl.json`, `pod-taskbank.json`, public PoD HTML,
and 40 same-origin JavaScript assets.

Verified/pinned facts:

- BNB Chain ID: 56.
- Official task snapshot: 267 tasks (209 combinational, 58 sequential).
- Reference implementations: 267/267.
- Official vector sets: 267/267.
- Safe live scope: 125 stateless combinational/vector tasks with exhaustive full
  input-domain vectors.
- Core contracts: mining, lens, BEM token and factory are pinned from the
  official deployment JSON.
- Processors: Behemoth, TapeOut and RefBench addresses/multipliers are pinned.
- Netlist wire format: tail outputs, 3-byte big-endian operands, NAND opcode 00,
  LATCH opcode 01.
- Official frontend flow confirms material acquisition, optional `commitDesign`,
  and `tapeout(bytes,uint32,uint32)`.

## Independent ABI math

All selectors used by the adapters were independently recalculated with legacy
Ethereum Keccak-256 from the exact official ABI signatures. 20/20 selectors
matched. The `TapedOut(uint256,address,uint32,uint32)` event topic also matched
exactly.

## Full evidence pin replay

- Manifest contracts/CPUs vs official `pod-mainnet.json`: PASS.
- Task manifest cardinality: 267/267 PASS.
- Vector SHA-256 pins: 267/267 PASS.
- Reference SHA-256 pins: 267/267 PASS.
- Reference B* burn-count pins: 267/267 PASS.
- All 125 supported reference netlists verify exhaustively under the pinned LSB
  vector interpretation: PASS.

## Wire-format regression fixed in v8.2

TapeOut treats the final N signals as outputs. The previous lowering algorithm
could fail for multiple non-tail outputs because copy pairs were emitted one
output at a time. Later copy gates could push an earlier output out of the
final-N window.

v8.2 uses a two-phase lowering algorithm:

1. prepare/invert every arbitrary source output;
2. append exactly one final gate per output consecutively.

Thus the final N signals are always the requested outputs. Deployment scoring,
verification, fingerprints, package netlists and burn accounting now operate on
the normalized wire-format circuit. Any abstract optimality claim is downgraded
to `BEST_KNOWN_WIRE_FORMAT` when normalization changes the circuit.

An exhaustive property regression enumerates 399 output tuples over a test
circuit (widths 1, 2 and 3) and proves behavior is preserved and outputs are tail.

## Regression status

- pytest: **112 passed**.
- Python `compileall`: PASS.
- shell syntax: **13/13 PASS**.
- package metadata/import smoke: version **8.2.0** PASS.
- no `.hybrid.env`, SQLite DB or runtime state is included in the distributable.

## Live boundary

The execution environment used to build this package has outbound network
blocked, so a final live doctor must run on the Mac runtime. The Mac verifier is
required to prove, at install time:

- current official task/deployment pins still match;
- BNB RPC is chain 56 and audited contracts remain callable;
- processor/material ABI probes pass;
- protocol codec probe passes;
- executable BEM market quote passes;
- dashboard responds locally.

Only then may the dashboard report `LIVE_READY`. A changed external deployment
must remain `SETUP_REQUIRED`/WAIT, never be forced green.

## Wallet boundary

**MANUAL_ONLY**. v8.2 does not hold a private key, sign a wallet transaction, or
autonomously broadcast a TapeOut transaction.
