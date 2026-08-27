# TapeOut Hybrid v8.2.2 — Live Scan Visibility / Fast Baseline Hotfix

## Reason
v8.2.1 reached `LIVE_READY`, but the dashboard could remain empty while the foreground cycle spent a very large compute budget before persisting the first candidate snapshot.

## Fix
- Use each audited official `pod-refimpl.json` reference netlist as an immediate verified baseline for the 125 supported full-domain combinational tasks.
- Re-verify the decoded reference circuit against the full official vector domain before it can enter evaluation.
- Preserve the persistent search farm for later improvements; do not block initial dashboard population on the 100k-candidate portfolio search.
- Persist scan progress after every processed task so the separate dashboard process sees incremental candidates.
- Add `SCAN PROGRESS` and diagnostics to the dashboard.
- Empty UI now means no candidate has been evaluated yet, not that a full scan found nothing.

## Safety
- Wallet remains `MANUAL_ONLY`.
- No private key, seed phrase, signing, or broadcast support is added.
- Reference designs are baselines only. Economics, incumbent state, live BNB data, executable BEM quote, stress, probability, and maturity gates remain mandatory.
- `WAIT` remains a valid economic result.

## Verified artifact
`tapeout_hybrid_v8_2_2_FAST_LIVE_SCAN_FINAL.zip`

SHA256: `c5880d54a80ed60f1e40d4dd5377b2dee0ae58b2109db8571411eedfbecdefc3`

Regression gates:
- pytest: 117/117 PASS (repeated full-suite passes after one non-reproducible localhost-start timing timeout)
- compileall: PASS
- official full-domain reference circuits: 125/125 valid, exhaustive, and C-matched
- shell/command syntax: 14/14 PASS
- package secret-pattern scan: PASS

The canonical runnable artifact is the verified ZIP/all-in-one package; `main` is not merged.
