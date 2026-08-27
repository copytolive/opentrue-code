# TapeOut Hybrid v8.2.9 — Contract Target Parity

Evidence-backed correction from the official TapeOut v8.1 frontend:
- The frontend binds `le=(h?.mining)||""`.
- The same `le` contract is used for `processorMultiplier`, `designCommitment`, `commitDesign`, `bestSlot(uint32,address)`, and `bonusOf(uint32,uint256)`.
- Therefore pre-tapeout `bestSlot` and `bonusOf` are PodMining views, not PodLens views.
- PodLens remains the target for `previewScore(...)` / `pendingLive(...)` after a circuit exists.
- v8.2.9 moves both single and batch slot calls to `contracts.mining` and records the slot-view contract explicitly in diagnostics.

Final package gate:
- 142/142 regression tests PASS from a clean extracted ZIP.
- `python3 -m compileall -q src adapters` PASS.
- 14/14 internal `.sh` / `.command` files pass `bash -n`.
- Standalone verifier `bash -n` PASS.
- All-in-one `bash -n` PASS and embedded ZIP is byte-for-byte identical to the canonical ZIP.
- Wallet execution remains `MANUAL_ONLY`; no signing or broadcasting automation was added.

Canonical ZIP SHA256: `aad4bc5f38ca5eee1dc30f9dc1f1a14d18f983cdeb224372bcb72af3ae27c886`
Verifier SHA256: `e3ca8978b1501198683e15cdd1212f40c3dac92b246ca99dd5528841888c22a2`
All-in-one SHA256: `b448a87ea46bc8b3bd588b477fabfb04e4d52332c0fe304027bc792b4831e2c0`
Recovery patch SHA256: `050dd15bf6d89a5034119dcff2d8d63d61a85465e74e7edfb503adec0b11a8cd`
