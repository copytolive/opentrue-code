# TapeOut Hybrid v8.2.8 — Official currentRate parity + shared-view isolation

Mac evidence from v8.2.7 showed the chain probe was healthy on BNB Chain 56, while `chain_snapshots` still aborted on an application revert before task-specific Lens isolation. The audited official TapeOut frontend reads live mining economics from `totalVerifWeight()`, `totalUnverWeight()`, `currentRate()`, and `UNVERIFIED_BPS()`; it derives daily network output as `currentRate * 86400`.

v8.2.8 changes:
- pins `currentRate()` selector `0xf9f8bdb7`;
- uses `currentRate * 86400 / 1e8` for BEM/day rather than the unused-in-live-path `dailyEmission()` view;
- isolates global reward/economic application reverts as `GLOBAL_ECONOMICS_UNAVAILABLE`;
- isolates processor material-view failures as `MATERIAL_VIEW_UNAVAILABLE`;
- keeps task/processor Lens view isolation from v8.2.7;
- unknown/reverted views never authorize a manual package;
- wallet execution remains `MANUAL_ONLY`; no signing or broadcasting was added.

Final clean-package gate:
- exact final ZIP extracted into a new directory: **140/140 tests PASS** using `PYTHONPATH=src`;
- `python3 -m compileall -q src`: **PASS**;
- package `.sh` / `.command` syntax: **14/14 PASS**;
- standalone verifier `bash -n`: **PASS**;
- all-in-one `bash -n`: **PASS**;
- embedded ZIP is byte-for-byte identical to the canonical ZIP;
- distributable contains no `.hybrid.env`, runtime DB, `.runtime`, `.venv`, or private-key artifact.

Canonical ZIP:
`tapeout_hybrid_v8_2_8_CURRENT_RATE_PARITY_FINAL.zip`

SHA256:
`521a35257e82ca05a443fca34c0c56c958be4476b7d5bad33865c675bbd2e76d`

Standalone verifier SHA256:
`321aece9ce50d285ec865ca942763c1c5215ea3fc2cecc4739bdd09ed3f3096c`

All-in-one SHA256:
`f6c745ab541f64024ec5bbc0008ca69e76da4b529fa85aaf3c892e91ac1ebd09`

Recovery patch SHA256:
`706dff6645d90f3abf25250739403f949c4c134696babe2678c15342a7bec867`
