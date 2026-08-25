# TapeOut Hybrid v7

Folder ini adalah workspace produksi hybrid untuk target:

`/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a`

Mode operasi utama:

`SEARCHING → CANDIDATE_FOUND → DESIGN_VERIFIED → OPPORTUNITY_APPROVED → READY_FOR_MANUAL_TAPEOUT → SUBMITTED_MANUALLY → MONITORING → REALIZED`

Wallet tetap manual. Engine tidak mengirim transaksi otomatis dalam mode hybrid.

## Target yang sudah diimplementasikan

1. Hybrid Decision Mode
2. Manual TapeOut Package
3. Expiry & live revalidation
4. Manual transaction recorder via tx hash
5. Expected / paper / realized accounting
6. Bootstrap L6 dari frozen forward predictions
7. Local browser dashboard
8. TOP-10 watchlist
9. Competition monitor
10. Reward-aware search allocation
11. Search improvement / champion feedback loop
12. Manual safety checklist
13. Post-tapeout reward + competition monitor
14. Learning/calibration report
15. KPI utama: Realized Net USD / Capital / Day

Regression lokal terakhir: **70 tests passed**.

## MacBook

Setelah branch ini di-checkout ke workspace Mac, gunakan `.env.hybrid.example`, lalu jalankan:

```bash
./macos/install-hybrid-launchd.sh
```

Dashboard lokal:

```text
http://127.0.0.1:8787
```

## Full source bundle

Folder `.bundle/` menyimpan source bundle lengkap dalam beberapa chunk Base64. Jalankan `python3 materialize_bundle.py` untuk membangun ulang seluruh workspace source jika diperlukan.

L6 tidak dipalsukan: instalasi baru tetap `PREDICTION_UNCERTIFIED/CALIBRATING` sampai outcome nyata memenuhi syarat kalibrasi statistik.
