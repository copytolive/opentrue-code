# TapeOut Hybrid v8.2.7 — Official BNB RPC Fallback Hardening

Final build gate:
- 131/131 regression tests PASS.
- `python3 -m compileall -q src` PASS.
- 14/14 `.sh` / `.command` files pass `bash -n`.
- Operator-configured RPC endpoints remain first priority.
- Public BSC mainnet endpoints documented by BNB Chain are appended only as read-only fallbacks:
  - `https://bsc-dataseed.bnbchain.org`
  - `https://bsc-dataseed-public.bnbchain.org`
- BNB Chain documentation states BSC mainnet Chain ID 56 and a public endpoint rate limit of 10K/5min.
- Endpoint URLs are never persisted/logged by the adapter/receipt.
- v8.2.6 two-call batch capability detection remains; unsupported batch falls back to paced sticky serial RPC.
- Watchlists containing only RPC/CHAIN pipeline errors remain fail-closed.
- Wallet execution remains `MANUAL_ONLY`; no signing or broadcasting was added.

Canonical artifact SHA256: `3ccbf0c212a74f6c8e00b78d81c551cc89113af714961664642ceda1f9975a9d`
