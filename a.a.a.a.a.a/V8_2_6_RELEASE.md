# TapeOut Hybrid v8.2.6 — Provider-Compatible Adaptive RPC

Canonical tested artifact: `tapeout_hybrid_v8_2_6_PROVIDER_COMPATIBLE_FINAL.zip`

SHA256: `c5a2ac2bca0ebefbfd7ab476c12eb846d9b9cf0bf8c18eec676c787cefe1fad7`

Verification before release:
- 130/130 regression tests PASS from a clean re-extraction of the ZIP.
- compileall PASS.
- 14/14 shell/command syntax checks PASS.
- embedded ZIP inside the all-in-one installer is byte-for-byte identical to the canonical ZIP.
- wallet boundary remains `MANUAL_ONLY`; no signing or broadcasting.

Trigger: v8.2.5 proved normal BNB RPC calls worked but the raw JSON-RPC batch path was rejected/throttled by the configured provider.

v8.2.6 transport rule:
- probe raw batch capability with exactly two calls at most once per endpoint;
- if unsupported, immediately use paced sticky serial `eth_call` with bounded failover;
- if supported, cap batches at 8 and split only on the known-capable endpoint;
- keep global chain/material state shared across the 125-task scan;
- never persist RPC endpoint URLs.

The full canonical package and recovery patch are preserved in the ChatGPT Library. `main` is intentionally untouched.