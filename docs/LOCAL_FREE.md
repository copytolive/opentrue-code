# Mode lokal gratis — Windows dan macOS

Mode ini menjalankan model, chat, IDE, terminal, dan coding agent di komputer
sendiri. Tidak ada biaya token dan tidak membutuhkan Vast.ai.

## Kebutuhan realistis

- Minimum: 16 GB RAM dan ruang kosong 25 GB; gunakan qwen2.5-coder:3b.
- Disarankan: 32 GB RAM dan ruang kosong 40 GB; gunakan qwen2.5-coder:7b.
- Lebih kuat: RAM/unified memory 48–64 GB; gunakan qwen3-coder:30b.
- Windows: Windows 10/11 64-bit, virtualisasi dan WSL2 aktif.
- macOS: Apple Silicon disarankan; Intel tetap dapat berjalan lebih lambat.

## Instalasi macOS

1. Install dan buka Docker Desktop.
2. Clone repository.
3. Jalankan: chmod +x scripts/*.sh
4. Jalankan: ./scripts/install-macos.sh

## Instalasi Windows

1. Install Docker Desktop dan aktifkan backend WSL2.
2. Clone repository.
3. Buka PowerShell di folder repository.
4. Jalankan: Set-ExecutionPolicy -Scope Process Bypass
5. Jalankan: .\\scripts\\install-windows.ps1

## Dibuka melalui browser

- Coding agent: http://localhost:3000
- Chat lokal: http://localhost:3001
- IDE: http://localhost:8080

Browser hanya menjadi tampilan. Model dan source tetap berada di komputer.
Jangan membuka port langsung ke internet; gunakan HTTPS gateway pada panduan
ANYWHERE_DEPLOYMENT.md.

Semua komponen dapat dipakai tanpa biaya API, tetapi listrik, perangkat,
internet, domain, dan penggunaan Docker Desktop oleh perusahaan besar tetap
dapat mempunyai biaya atau ketentuan lisensi sendiri.

