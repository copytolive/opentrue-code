# TapeOut Hybrid v7.9 — Final Audit

## Purpose
v7.9 hardens the v7.8 evidence path before any live TapeOut adapter is enabled.

## Security fixes
- RPC endpoint credentials, path segments, query strings, fragments, and userinfo are not persisted in downloadable evidence.
- RPC curl stderr is not persisted because it may echo credential-bearing URLs.
- `protocol-candidates.json` is generated only from addresses discovered in official same-origin TapeOut frontend assets.
- Candidate addresses are probed with read-only `eth_getCode` only after an RPC returns BNB Chain ID 56 (`0x38`).
- `has_bytecode=true` proves contract existence only; it does not certify TapeOut identity, ABI, selectors, task schema, or transaction semantics.

## Safety boundary
- `task_collector`, `chain_collector`, and `protocol_helper` remain fail-closed placeholders.
- No private key or seed is read or stored.
- No signing or raw-transaction broadcast was added.
- Wallet execution remains manual.

## Verification
- Baseline v7.8 ZIP SHA-256 matched the handoff: `8220419590b8d902530f8d5c0eb721a10c7aa8ee57e711bde0151cc007f351c2`.
- Final v7.9 ZIP SHA-256: `66b321bf88d273370dd32922a2bfb02a8213171ce0d724197f52538c2675fad9`.
- v7.9 regression suite: **102 passed**.
- `compileall`: **PASS**.
- macOS shell / `.command` syntax validation: **PASS**.
- Existing editable runtime is refreshed automatically when source package version changes.
- Credential-pattern scan: no local `.env`, private key, seed phrase, or obvious embedded API key found in the distribution tree.

## Live-readiness rule
`LIVE READY` must remain false until official evidence plus on-chain verification proves enough facts to implement and audit all three live adapters. Community material can be used for discovery only, never as the sole production trust anchor.
