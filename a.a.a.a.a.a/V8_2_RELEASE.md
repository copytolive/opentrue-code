# TapeOut Hybrid v8.2 Final Release Receipt

Date: 2026-08-27
Branch: `hybrid-v7-tapeout`

Canonical tested package:

- `tapeout_hybrid_v8_2_LIVE_ADAPTERS_FINAL.zip`
- SHA-256: `ac5aca249449e07ba78448e45ba9ae32ed52a70dc7dcd293bc27256d128bbeee`
- pytest from clean extracted ZIP: **112/112 PASS**
- Python compileall: **PASS**
- shell/command syntax: **13/13 PASS**
- package version: **8.2.0**

Mac all-in-one verifier:

- `TapeOut_V82_FINAL_ALL_IN_ONE.command`
- SHA-256: `6fdfba34e5f554e53c0a8be70da3e96b3ecf78853b19db537a9ba176d79be6d7`
- embedded package SHA verified byte-for-byte against the canonical package
- wallet boundary: **MANUAL_ONLY**
- no autonomous signing or broadcast

The final live gate intentionally runs on the Mac runtime because it must prove the user's current configured BNB RPC, current official TapeOut deployment/task pins, live contract calls, market quote, doctor status and localhost dashboard. A changed/unavailable external dependency must fail closed rather than be forced green.

`main` is not merged by this release receipt.
