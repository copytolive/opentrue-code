# TapeOut Hybrid v8.2.7 — Slot-view resilient release

Canonical tested package: `tapeout_hybrid_v8_2_7_SLOT_VIEW_RESILIENT_FINAL.zip`

SHA-256: `1f2f31206191bc5259dbc00c8a4a23dbe7c37896d063d109261713b465f25c0e`

Standalone verifier SHA-256: `0635ddeee011c996055c6a4f2be18c32d4affa18480af5056a9a2b1b02aa2a39`

All-in-one SHA-256: `703e968d283c1ef8ebe0106c015888ad81b7f81ae76613b582adeba8e2df38e4`

Verification:
- source regression: 135/135 PASS
- exact ZIP clean-extract regression: 135/135 PASS
- compileall: PASS
- package shell/command syntax: 13/13 PASS
- standalone verifier syntax: PASS
- all-in-one syntax: PASS
- embedded ZIP is byte-for-byte identical to canonical ZIP

Behavior:
- isolates task/processor `bestSlot` / `bonusOf` application reverts;
- deterministic contract reverts are not retried across every RPC provider;
- unknown slot view remains `preview_eligible=false` / `SLOT_VIEW_UNAVAILABLE`;
- L2/preflight/manual package stays fail-closed;
- wallet boundary remains `MANUAL_ONLY`.

The full tested source is canonical in the ZIP above. `V8_2_7_PATCH.diff` is retained as the recovery patch. Do not partially bump GitHub runtime files without applying the complete patch atomically.
