# OpenTrue Code

**UI publik:** https://opentrue-code.copytolive.chatgpt.site

OpenTrue Code adalah workspace pengembangan chat-first berbasis `code-server`, Monaco, Cline, Ollama, Open WebUI, PostgreSQL, Redis, dan worker terisolasi. Targetnya: pengguna dapat membaca repository, mengubah banyak file, menjalankan lint/test/build, memakai Git/GitHub, dan mengeksekusi deployment melalui percakapan, sementara model open-weight berjalan di komputer atau GPU server sendiri.

## Baseline stabil

Baseline production-foundation yang sudah digabung ke `main` adalah:

```text
086e8c7ee3bf495e14b052a217422d6cf0a97955
```

Perubahan setelah baseline wajib masuk melalui branch/PR dan melewati CI. Status GA yang jujur ada di `docs/GA_STATUS.md`: repository-side gate dapat `REPO PASS`, tetapi Mac/VPS/domain/GPU/beta tidak boleh disebut `RUNTIME PASS` tanpa receipt dari target nyata.

## Prinsip

- Editor berbasis proyek MIT `coder/code-server` dan engine Monaco/VS Code.
- Coding chat memakai Cline yang diarahkan ke Ollama lokal/self-hosted.
- Jalur AI utama tidak membutuhkan API model AI berbayar; default `qwen3-coder:30b` berjalan melalui Ollama.
- Open WebUI menyediakan chat umum/multi-model tanpa otomatis memberi hak eksekusi repository.
- Eksekusi berdampak memakai control-plane, approval gate, tenant-scoped worker, receipt, dan sandbox.
- Repository privat seperti `narzulalistiqlal/opentrue-platform` tetap terpisah dan hanya dibuka sebagai workspace; tidak disalin ke repo publik ini.
- `.env`, key/token, backup, private workspace, dan model weight diblokir oleh `.gitignore`, repository validator, serta secret scanning CI.

## Fresh clone → install

### macOS

```bash
git clone https://github.com/narzulalistiqlal/opentrue-code.git
cd opentrue-code
./scripts/install-macos.sh
```

Installer membuat `.env` lokal dengan secret acak, menyalakan PostgreSQL, Redis, control-plane, browser UI, Ollama, code-server+Cline, dan Open WebUI, kemudian menjalankan health check. Tidak perlu mengubah source code untuk boot dasar.

Untuk menjadikan Mac sebagai worker lokal yang hidup kembali setelah reboot, ikuti `docs/LOCAL_MAC.md` dan `scripts/install-local-bridge-macos.sh`. Hanya folder yang masuk `APPROVED_WORKSPACE_ROOTS` yang boleh diakses bridge.

### Windows PowerShell

```powershell
git clone https://github.com/narzulalistiqlal/opentrue-code.git
cd opentrue-code
.\scripts\install-windows.ps1
```

### Manual

```bash
cp .env.example .env
# ganti seluruh placeholder secret/password di .env
docker compose up -d ollama
docker compose run --rm ollama-model
docker compose up -d
./scripts/health-check.sh
```

Buka:

- Unified browser IDE/chat: `http://localhost:3000`
- code-server + Cline: `http://localhost:8080`
- Open WebUI: `http://localhost:3001`
- Control-plane: `http://127.0.0.1:8787`; melalui `/api/` ketika memakai Caddy
- Ollama: hanya jaringan internal Docker, tidak dipublikasikan langsung

## Local/open-weight AI

Default:

```env
OLLAMA_MODEL=qwen3-coder:30b
OLLAMA_MODELS=qwen3-coder:30b,qwen2.5-coder:14b
```

`OLLAMA_MODEL` adalah model bootstrap lokal. `OLLAMA_MODELS` adalah urutan primary → fallback untuk GPU/Vast worker. Sebelum memilih model untuk mesin baru, jalankan benchmark nyata:

```bash
node scripts/model-benchmark.mjs
```

Benchmark merekam wall/load time, prompt/output token count, dan output tokens/second dari Ollama. Keputusan model tetap harus mempertimbangkan keberhasilan task coding, RAM/VRAM, context, dan biaya GPU—bukan tokens/s saja. Panduan: `docs/LOCAL_AI.md` dan `docs/GPU_WORKER.md`.

## Kemampuan agentik

- Chat → analisis/index codebase dan usulan perubahan.
- Edit/refactor multi-file, checkpoint/branch, diff sebelum commit, lint, test, build, debug, dan preview.
- Terminal melalui Local Bridge atau Bubblewrap sandbox dengan allowlist/isolasi.
- Git status/diff/commit dan workflow GitHub ketika credential/koneksi pengguna tersedia.
- Tenant-isolated jobs dengan Redis lease, heartbeat, retry/recovery, WebSocket event, dan execution receipt.
- PostgreSQL persistence + forced Row-Level Security untuk job, audit, usage, workspace sync, secret dan billing entitlement.
- Browser cloud workspace sync dengan optimistic version check.
- Signed/idempotent billing webhook, fair-use persisten, Redis rate limiting, dan token-protected metrics.
- Dedicated deployment targets `deploy-staging` dan `deploy-production`; deployment job selalu membutuhkan approval, menggunakan exact commit SHA, health check, serta rollback receipt.
- Vast/Ollama inference worker memiliki heartbeat, retry, model fallback, dan inference metadata.
- Untrusted-code sandbox menggunakan Bubblewrap, non-root payload, no Docker socket, no default network, serta CPU/RAM/PID/time limits.

## Production / domain

Production memakai Caddy sebagai satu-satunya public edge untuk HTTP/HTTPS. PostgreSQL, Redis, Ollama, control-plane raw port, dan worker tidak boleh dipublikasikan langsung ke Internet.

Panduan deployment/domain: `docs/ANYWHERE_DEPLOYMENT.md`.
Panduan DR: `docs/DISASTER_RECOVERY.md`.
Panduan observability/SLO: `docs/OBSERVABILITY.md`.
Threat model: `docs/THREAT_MODEL.md`.

## CI, supply chain, dan acceptance

PR production harus melewati:

- public-repository policy: tidak ada `.env`, private key/token, workspace, backup, atau model weights;
- full-history Gitleaks scan;
- npm dependency audits;
- Trivy source/config dan runtime-image scan;
- CycloneDX SBOM + SHA-256 checksums;
- control-plane PostgreSQL/Redis integration dan tenant isolation tests;
- billing signature/replay, rate limit, worker lease/recovery dan backup/restore drills;
- UI/runtime image build, Compose/Caddy validation;
- canonical Bubblewrap isolation/escape test.

Acceptance lengkap ada di `docs/ACCEPTANCE_TEST.md`.

Load-test k6 100 → 500 → 1.000 virtual users tersedia melalui workflow manual `Capacity 100-1000 users`. Workflow harus diarahkan ke staging nyata. Keberadaan script/workflow **bukan** bukti kapasitas 1.000 user; hasil staging p50/p95/p99/error/DB/Redis/queue-latency wajib disimpan sebagai evidence.

## Repository privat sebagai dogfood

Clone repository aplikasi ke folder yang di-ignore atau folder eksternal yang secara eksplisit diizinkan:

```bash
git clone <private-repository-url> workspace/project-name
```

Gunakan credential Git/SSH di secret store lokal. Jangan commit credential atau menyalin source privat ke tree publik OpenTrue Code.

## Status menuju GA

`docs/GA_STATUS.md` adalah source of truth untuk 22 gate. `GA READY` hanya boleh dinyatakan setelah seluruh gate yang membutuhkan dunia nyata telah menghasilkan bukti: Mac Local Bridge, GitHub E2E, VPS deploy+rollback, domain HTTPS/private ports, GPU worker+failover, live billing provider, monitoring/alerts, 100/500/1.000-user staging, replacement-host restore, dogfood dan public beta.

## Lisensi

Konfigurasi dan source OpenTrue Code mengikuti `LICENSE` repository ini. Setiap komponen upstream tetap mengikuti lisensinya masing-masing.
