# AI-CONTROL-AGENT SYSTEM — SOURCE OF TRUTH

**Architecture:** AI apa pun ↔ Control API ↔ Mac/Windows Agent ↔ Local / Server / VPS  
**Project:** OpenTrue Code / OpenTrue Engine  
**Repository:** `copytolive/opentrue-code`  
**Target local workspace:** `/Users/Shared/WorkspaceBersama/rwa.ms`  
**Document version:** 1.0 — 2026-08-31

---

## 1. Tujuan akhir

Dokumen ini adalah source of truth implementasi agar satu sistem bisa menerima pekerjaan dari **AI apa pun** (ChatGPT/OpenAI, Claude, Gemini, model lokal, aplikasi internal, MCP client, atau REST client), mengubahnya menjadi job yang terkontrol melalui **Control API**, lalu mengeksekusi job tersebut melalui **agent yang terpasang di Mac atau Windows**, atau melalui **agent headless di server/VPS**.

Target akhirnya bukan demo UI. Targetnya adalah engine yang benar-benar dapat dipakai untuk membaca repository, membuat rencana, mengedit file, menjalankan test/build/lint, mengoperasikan Git dengan approval, menggunakan browser automation yang dibatasi, menjalankan MCP, mengirim job ke mesin lain, menghasilkan receipt, dan membangun installer Mac/Windows.

### Definition of Done

Sistem baru boleh disebut **TUNTAS / RELEASE READY** jika semua poin berikut terbukti dengan receipt nyata:

1. Engine lokal aktif hanya di loopback dan memerlukan token lokal.
2. AI/controller dapat membuat job melalui Control API.
3. Control API melakukan autentikasi, authorization, queue, approval, lease, heartbeat, retry, dan receipt.
4. Mac agent dapat claim job, mengeksekusi task allowlisted, mengirim heartbeat, dan menyelesaikan job.
5. Windows agent melakukan hal yang sama tanpa rusak oleh path seperti `C:\\workspace\\repo`.
6. Agent hanya boleh bekerja di approved Git workspace roots.
7. Tidak ada arbitrary-shell endpoint dari jaringan.
8. Ask/Plan bersifat read-only; Agent/Debug/write/Git mutation membutuhkan explicit approval sesuai policy.
9. Provider inference dapat diganti: Ollama, OpenAI, Anthropic, Gemini, OpenAI-compatible, LM Studio, atau provider lain melalui adapter.
10. macOS ARM64 installer dibuild, dipasang, dibuka, engine health PASS, workspace dibuka, Ask/Agent PASS.
11. macOS Intel installer dibuild dan smoke install PASS.
12. Windows x64 installer dibuild, silent install PASS, aplikasi terbuka, engine health PASS, workspace dibuka, Ask/Agent PASS.
13. Headless server/VPS agent dapat dipasang sebagai service dan reconnect setelah restart.
14. Semua output job menghasilkan immutable receipt minimal: job ID, worker ID, start/end time, exit code, timeout state, output hash, dan audit event.
15. Secrets tidak disimpan di repository, log, receipt, atau prompt; desktop memakai OS secure storage.
16. GitHub CI: agent parity, acceptance, bugbot, desktop engine, security/supply-chain, dan release checks hijau.
17. macOS production build ditandatangani/notarized sebelum distribusi massal; Windows production build ditandatangani agar tidak mengandalkan bypass Gatekeeper/SmartScreen.
18. Release menyediakan checksum SHA-256 untuk semua installer.
19. Rollback dan restore drill terbukti.
20. Dokumentasi operasi, troubleshooting, security, install, upgrade, dan uninstall tersedia.

---

## 2. Arsitektur kanonik

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                           AI / CONTROLLER                                 │
│ ChatGPT │ Claude │ Gemini │ Local LLM │ MCP Client │ REST/CLI │ Internal │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │ HTTPS / localhost / MCP adapter
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              CONTROL API                                  │
│ Auth │ Tenant/Project │ Job Queue │ Approval │ Lease │ Audit │ Receipts  │
└───────────────────────┬───────────────────────────┬───────────────────────┘
                        │                           │
                HTTPS claim/heartbeat       HTTPS claim/heartbeat
                        │                           │
                        ▼                           ▼
┌──────────────────────────────┐     ┌──────────────────────────────────────┐
│ MAC / WINDOWS LOCAL AGENT    │     │ SERVER / VPS / GPU / DEPLOY AGENT   │
│ Desktop + Local Engine       │     │ Headless service                     │
│ Approved roots only          │     │ Isolated worker roots                │
│ OS secure credential store   │     │ systemd / container / sandbox        │
└───────────────┬──────────────┘     └──────────────────┬───────────────────┘
                │                                       │
                ▼                                       ▼
┌──────────────────────────────┐     ┌──────────────────────────────────────┐
│ LOCAL WORKSPACES             │     │ REMOTE WORKSPACES / DEPLOY TARGETS   │
│ Git repos, files, tests      │     │ Git, build, deploy, model workers     │
└──────────────────────────────┘     └──────────────────────────────────────┘
```

### Prinsip utama

- **AI bukan trusted executor.** AI hanya mengusulkan intent/action; policy engine menentukan apa yang boleh dijalankan.
- **Control API bukan shell proxy.** API hanya menerima task/operation yang didefinisikan dan divalidasi.
- **Agent adalah security boundary.** Agent memverifikasi token, target, approved root, task allowlist, timeout, dan approval sebelum spawn proses.
- **Workspace adalah boundary kedua.** Semua path di-realpath dan harus tetap berada di root yang disetujui.
- **Receipt adalah bukti.** PASS tidak boleh hanya berasal dari rencana, UI, atau asumsi.

---

## 3. Dua arti “AI apa pun”

Sistem harus mendukung dua lapisan yang berbeda.

### 3.1 AI sebagai controller

AI eksternal dapat mengirim pekerjaan ke Control API tanpa perlu menjadi model inference di dalam engine. Contoh:

- ChatGPT membuat job `test`, `build`, `agent`, `git_status`, atau `deploy`.
- Claude menjalankan adapter MCP yang menerjemahkan tool call menjadi REST Control API.
- Gemini atau aplikasi internal menggunakan REST client dengan token scoped.
- CLI lokal menggunakan `controlctl` untuk submit, approve, status, cancel, dan fetch receipt.

Controller tidak mendapat akses shell mentah. Ia mendapat API terstruktur.

### 3.2 AI sebagai model inference

Engine juga membutuhkan model untuk Ask/Plan/Agent/Debug. Model router harus bersifat provider-agnostic:

- Ollama — default local/open-weight.
- LM Studio — OpenAI-compatible local endpoint.
- OpenAI API.
- Anthropic API.
- Google Gemini API.
- OpenAI-compatible endpoint lain.
- Future providers melalui adapter tanpa mengubah AgentCore.

Dengan pemisahan ini, ChatGPT dapat menjadi controller sementara AgentCore menggunakan Ollama, atau sebaliknya.

---

## 4. Komponen sistem

### 4.1 Control API

Tanggung jawab:

- Authenticate controller dan worker.
- Scope token ke tenant/project/target/capabilities.
- Create job dan validasi schema.
- Menahan job yang membutuhkan approval.
- Queue + priority.
- Worker registration dan capability advertisement.
- Lease/claim untuk menghindari double execution.
- Heartbeat untuk memperpanjang lease.
- Retry hanya untuk failure yang dinyatakan retryable.
- Cancellation.
- Receipt store.
- Audit log append-only.
- Rate limiting dan abuse controls.

Endpoint minimum:

```text
POST /v1/jobs
GET  /v1/jobs/:id
POST /v1/jobs/:id/approve
POST /v1/jobs/:id/cancel
POST /v1/workers/register
POST /v1/workers/claim
POST /v1/workers/jobs/:id/heartbeat
POST /v1/workers/jobs/:id/complete
GET  /v1/workers
GET  /v1/receipts/:id
GET  /v1/health
```

### 4.2 Local Agent / Local Bridge

Local Agent adalah proses yang berjalan di Mac/Windows dan melakukan long-poll/claim ke Control API.

Kontrak minimum:

- `CONTROL_PLANE_URL` wajib HTTPS kecuali localhost.
- Token worker minimum-length dan scoped.
- `APPROVED_WORKSPACE_ROOTS` wajib ada.
- Setiap requested cwd di-realpath lalu dibandingkan terhadap approved roots.
- Task harus ada di allowlist.
- Environment child harus minimal; jangan meneruskan seluruh secret environment.
- Output dipotong dengan batas ukuran.
- Timeout memicu SIGTERM lalu kill fallback.
- Heartbeat periodik selama job hidup.
- Completion mengirim exit code, timeout flag, error, duration, output, dan SHA-256 output.

### 4.3 OpenTrue Engine

Engine adalah local API yang dipakai Desktop App dan dapat dipakai CLI lokal. Engine harus listen di `127.0.0.1`, bukan `0.0.0.0`.

Fungsi inti:

- Health/info.
- Workspace approval dan switch.
- File tree/list/read/write dengan path boundary.
- Ask/Plan/Agent/Debug.
- Deterministic repository index/search/symbol/dependency graph.
- Semantic search via local embeddings dengan fallback deterministic index.
- Checkpoint + restore.
- Patch preview + apply.
- Test/build/lint/typecheck profiles.
- Git status/diff/branch/commit/push/PR/checks/merge/worktree.
- MCP tools.
- Browser automation dengan allowlisted hosts.
- Subagents/multi-agent melalui isolated worktrees.
- Connection config ke remote Control API.

### 4.4 Desktop App

Desktop app harus menjadi client nyata ke Engine, bukan simulasi state di browser.

Minimal UI:

- Explorer/file tree.
- Tabs + Monaco editor.
- Save/rename/delete/new file.
- Agent chat dengan Ask/Plan/Agent/Debug.
- Diff/changes review.
- Approval prompt sebelum write-sensitive action.
- Terminal/tasks panel untuk allowlisted profiles.
- Source Control panel.
- Settings: provider, model, endpoint, API key, approved roots, Control API.
- Connection health: Engine / Model / Control API / Worker.
- Receipts/audit viewer.

### 4.5 Server/VPS Agent

Headless worker digunakan untuk pekerjaan yang tidak harus dieksekusi di laptop:

- Build berat.
- Deploy.
- Browser task di environment server.
- GPU inference worker.
- Background agents.
- Scheduled maintenance.

Worker harus dipasang sebagai service (systemd pada Linux) dan hanya diberi filesystem root/capability minimum yang dibutuhkan.

---

## 5. Job contract

Contoh payload controller:

```json
{
  "task": "agent",
  "projectId": "copytolive-rwa",
  "target": "local-bridge",
  "args": ["/workspace/repo", "perbaiki test yang gagal"],
  "requiresApproval": true,
  "priority": 10,
  "timeoutMs": 300000
}
```

Status state machine:

```text
CREATED → WAITING_APPROVAL → QUEUED → LEASED → RUNNING → SUCCEEDED
                                            └───────→ FAILED
                                            └───────→ TIMED_OUT
                                            └───────→ CANCELLED
                           lease expired → QUEUED/FAILED according to policy
```

Receipt minimum:

```json
{
  "jobId": "...",
  "workerId": "...",
  "startedAt": "...",
  "completedAt": "...",
  "exitCode": 0,
  "timedOut": false,
  "durationMs": 4217,
  "outputHash": "sha256:...",
  "artifacts": [],
  "auditId": "..."
}
```

---

## 6. Task allowlist

Network-accessible agent tidak boleh memiliki endpoint `run arbitrary shell`. Task harus dinyatakan satu per satu.

| Task | Mode | Approval | Contoh eksekusi |
|---|---|---:|---|
| `git_status` | read | tidak | `git status --short` |
| `git_diff` | read | tidak | `git diff --stat HEAD` |
| `test` | exec | policy | `npm test` |
| `build` | exec | policy | `npm run build` |
| `lint` | exec | policy | `npm run lint` |
| `python_version` | read | tidak | `python3 --version` |
| `ask` | AI read | tidak | OpenTrue Ask |
| `plan` | AI read | tidak | OpenTrue Plan |
| `agent` | write | ya | OpenTrue Agent `--yes` |
| `debug` | write | ya | OpenTrue Debug `--yes` |
| `checkpoint` | write metadata | ya/policy | OpenTrue checkpoint |
| `git_branch` | git write | ya | OpenTrue branch |
| `git_commit` | git write | ya | OpenTrue commit |
| `git_push` | remote write | ya wajib | OpenTrue push `--yes` |
| `git_pr` | remote write | ya wajib | OpenTrue PR `--yes` |
| `git_merge` | irreversible-ish | ya wajib | OpenTrue merge `--yes` |
| `worktree` | filesystem write | ya | isolated worktree |

Task baru harus melalui code review, test, threat review, dan receipt test sebelum masuk allowlist.

---

## 7. Workspace isolation

1. Root harus dipilih oleh user/admin secara eksplisit.
2. Root harus merupakan path nyata, bukan string prefix yang belum di-realpath.
3. Requested path di-resolve dan di-realpath.
4. Hanya `path === root` atau descendant `root + separator` yang diterima.
5. Symlink yang keluar root harus ditolak setelah realpath.
6. Desktop tidak boleh otomatis menyetujui `/`, seluruh drive, atau seluruh home directory.
7. Multi-tenant worker tidak boleh memakai shared writable root tanpa isolation.
8. Private repository, model weights, `.env`, SSH key, browser state, dan backup tidak boleh disalin ke public repository.

---

## 8. Provider routing

Schema konseptual:

```json
{
  "provider": "ollama|openai|anthropic|gemini|openai-compatible|lmstudio",
  "model": "...",
  "endpoint": "...",
  "apiKeyRef": "os-secure-store://...",
  "timeoutMs": 60000,
  "maxRetries": 2
}
```

Rules:

- API key tidak dikirim ke renderer process; hanya main/engine process yang boleh mengambilnya.
- macOS: Keychain.
- Windows: DPAPI/Credential Manager equivalent.
- Linux server: secret store/systemd credential/provider secret manager.
- Log tidak boleh mencetak Authorization header atau key.
- Endpoint remote wajib HTTPS kecuali loopback/local development.
- Provider failover harus tercatat di receipt tanpa membocorkan key.

---

## 9. MacBook runtime

Target distribusi: macOS Apple Silicon arm64 DMG+ZIP dan macOS Intel x64 DMG+ZIP.

```text
OpenTrue Code.app
  ├─ Electron main process
  ├─ local Engine child process (127.0.0.1 only)
  ├─ secure-store bridge
  ├─ approved workspace roots
  └─ optional Control API connection
```

Install acceptance:

1. DMG mount berhasil.
2. App copy/install berhasil.
3. App launch berhasil.
4. Engine `/health` 200.
5. Add approved Git workspace.
6. File tree nyata muncul.
7. Read/save file bekerja.
8. Ask bekerja dengan provider terpilih.
9. Agent write meminta approval.
10. Test/build profile berjalan.
11. Git status/diff bekerja.
12. Restart app mempertahankan non-secret settings; secret tetap di secure store.
13. Uninstall tidak menghapus workspace pengguna.

Untuk distribusi publik, build production harus Apple-signed dan notarized. CI build tanpa credential signing hanya boleh disebut **unsigned test artifact**, bukan GA installer.

---

## 10. Windows runtime

Target distribusi: Windows 10/11 x64, NSIS `.exe` installer + portable ZIP.

Windows-specific requirements:

- Jangan memisahkan `APPROVED_WORKSPACE_ROOTS` menggunakan `:` karena `C:\\...` mengandung colon. Gunakan delimiter OS (`path.delimiter`, yaitu `;` di Windows).
- Semua child process menggunakan `shell: false` jika tidak diperlukan.
- Path normalization harus memakai API `node:path` sesuai platform.
- Secrets memakai Windows secure storage/DPAPI.
- Installer silent mode harus benar-benar diuji di Windows runner.
- Uninstaller tidak boleh menghapus repository/workspace user.

Acceptance Windows wajib menguji drive-letter path, path dengan spasi, engine health, Ask/Agent, restart, dan uninstall.

---

## 11. Server/VPS mode

```text
VPS
├─ opentrue-agent.service
├─ optional model-worker.service
├─ isolated workspace root
├─ local receipt cache/spool
└─ outbound HTTPS only → Control API
```

Agent tidak membutuhkan inbound public port bila menggunakan claim/long-poll. Acceptance meliputi service enable/start, outbound HTTPS, worker ONLINE, reboot/reconnect, timeout/cancel, lease expiry, receipt after reconnect, dan workspace escape rejection.

---

## 12. Local-only, hybrid, dan remote modes

- **Local-only:** Desktop → Local Engine → local model. Tidak perlu remote Control API.
- **Hybrid:** Desktop/AI Controller → Control API → Local Agent, sementara model/deploy worker bisa di VPS/GPU.
- **Remote-first:** Controller → Control API → VPS/sandbox worker; desktop hanya viewer/controller.

Mode dipilih lewat konfigurasi, bukan fork source code.

---

## 13. Security model

Non-negotiable:

- Remote traffic HTTPS.
- Loopback-only local Engine.
- Bearer token scoped dan rotatable.
- Explicit approval untuk high-impact action.
- Approved roots + realpath boundary + symlink escape protection.
- No arbitrary shell over network.
- Child env minimal.
- Output cap + timeout.
- No secret in logs/receipts.
- Production credentials di host/provider secret store.
- Sandbox tidak mendapat host Docker socket.
- Worker token minimum scope: project + target + capability.
- Rate limiting per controller/worker/tenant.
- Audit event stream.
- Dependency/vulnerability/security CI.
- Installer signing untuk GA.

Threat tests wajib meliputi prompt injection, traversal, symlink escape, malicious repo script, command argument injection, token replay, duplicate job, lease loss, rogue worker, secret exfiltration, poisoned MCP, malicious browser page, dan Git mutation tanpa approval.

---

## 14. Observability dan audit

Metrics minimum: job state counts, queue latency, execution duration, active workers, heartbeat age, lease expiry, model latency/error/failover, approval wait, version adoption, agent crash/restart.

Logs structured JSON dengan `requestId`, `jobId`, `workerId`, `projectId`, `tenantId` dan tanpa secrets. Receipt harus bisa diekspor sebagai acceptance evidence.

---

## 15. Git dan software-development workflow

```text
AI task
 → Agent creates checkpoint
 → reads/searches repo
 → proposes/applies approved hunks
 → runs lint/typecheck/test/build
 → shows diff
 → user approves branch/commit/push
 → PR
 → CI checks
 → merge approval
 → release/deploy
 → receipt
```

Tidak boleh ada silent push/merge dari prompt biasa.

---

## 16. MCP integration

Sediakan MCP server `opentrue-control` dengan tools minimal:

```text
opentrue_job_create
opentrue_job_status
opentrue_job_approve
opentrue_job_cancel
opentrue_workers_list
opentrue_receipt_get
```

MCP hanya adapter ke Control API; policy tetap di Control API + Agent.

---

## 17. CLI integration

```text
controlctl login/config
controlctl workers
controlctl submit --target local-bridge --task test --cwd ...
controlctl status JOB_ID
controlctl approve JOB_ID
controlctl cancel JOB_ID
controlctl receipt JOB_ID
```

Local Engine CLI:

```text
opentrue ask "..."
opentrue plan "..."
opentrue agent "..." --yes
opentrue debug "..." --yes
opentrue verify --yes
opentrue index
opentrue semantic-search "..."
opentrue checkpoint
opentrue status
opentrue diff
opentrue push --yes
opentrue pr --yes
opentrue checks
opentrue merge --yes
```

---

## 18. Release pipeline Mac + Windows

1. Source checkout pinned/reproducible.
2. Node/runtime version pinned.
3. Engine unit/integration tests.
4. Existing Agent Runtime tests.
5. Local Bridge tests.
6. Desktop source syntax/type checks.
7. macOS arm64 package.
8. macOS x64 package.
9. Windows x64 package.
10. Real installer smoke per OS runner.
11. Security scan.
12. SBOM.
13. Artifact upload.
14. SHA256SUMS.
15. Signing/notarization/signing gates for GA channel.
16. Release notes + upgrade/rollback notes.

Tidak boleh menyebut Mac PASS hanya karena DMG terbentuk; DMG harus di-mount dan aplikasi divalidasi. Tidak boleh menyebut Windows PASS hanya karena `.exe` terbentuk; installer harus dijalankan pada Windows runner/device.

---

## 19. Struktur lokal di `rwa.ms`

```text
/Users/Shared/WorkspaceBersama/rwa.ms/
├─ AI_CONTROL_AGENT_SYSTEM_SOURCE_OF_TRUTH.md
├─ repos/
│  └─ opentrue-code/
├─ installers/
├─ receipts/
├─ backups/
└─ RWA_MS_R...REPOS.tar.gz     # archive existing, jangan ditimpa
```

`repos/opentrue-code` adalah working clone. Installer dan receipt dipisahkan dari source repository.

---

## 20. Status implementasi saat dokumen ini dibuat

Repository sudah memiliki Agent Runtime dengan Ask/Plan/Agent/Debug, repo indexing, checkpoints, patch engine, quality profiles, Git workflow, browser agent, MCP, subagents/worktrees, control-plane client, model router Ollama, dan Local Bridge dengan approved-root validation serta heartbeat/receipt.

Branch desktop-engine menambahkan local Engine, provider adapters, Electron desktop app, Mac/Windows packaging, dan CI installer smoke.

Bukti 2026-08-31:

- Agent parity CI: PASS.
- Acceptance CI: PASS.
- Bugbot: PASS setelah test fixture false-positive dibenahi.
- Engine/provider tests: PASS.
- Local Bridge tests: PASS.
- macOS arm64 build + DMG mount smoke: PASS.
- macOS Intel build + DMG mount smoke: PASS.
- Windows package build: PASS, tetapi NSIS silent-install smoke terakhir masih FAIL dan wajib diperbaiki sebelum merge/release.
- Security full-history scan mendeteksi historical public WBNB contract address sebagai generic API-key finding. Penyelesaiannya harus berupa rule/allowlist yang sangat spesifik atau history policy yang direview; jangan mematikan Gitleaks global.
- Apple notarization dan Windows code signing belum boleh dinyatakan PASS tanpa credential/signing receipt nyata.

**Kesimpulan status:** arsitektur engine sudah dibangun, tetapi final GA belum boleh diklaim sampai Windows installer + security + signing/real-device selesai.

---

## 21. Urutan penyelesaian sampai tuntas

### P0 — Stabilkan PR desktop-engine

- Ambil log Windows NSIS smoke yang gagal.
- Perbaiki installer command/path/exit handling.
- Ulangi Windows runner sampai install PASS.
- Buat exception Gitleaks yang hanya mengenali historical public contract address tersebut.
- Pastikan seluruh required CI hijau.

### P1 — Merge dan build release candidate

- Review PR.
- Merge hanya setelah CI hijau.
- Build RC Mac arm64, Mac x64, Windows x64.
- Generate SHA256SUMS + SBOM.

### P2 — Real-device Mac acceptance

- Install pada Mac pengguna.
- Launch dan health PASS.
- Approve workspace `rwa.ms/repos/...`.
- Ask PASS.
- Agent edit + approval PASS.
- Test/build PASS.
- Restart PASS.
- Capture receipt.

### P3 — Real-device Windows acceptance

- Install Windows 10/11 x64.
- Test drive-letter path + spaces.
- Health/workspace/Ask/Agent/test/Git PASS.
- Restart + uninstall PASS.
- Capture receipt.

### P4 — Control API end-to-end

- Deploy staging Control API HTTPS.
- Register Mac + Windows worker.
- Submit dari external AI adapter.
- Approval → claim → heartbeat → complete.
- Verify no duplicate execution.
- Test cancellation, timeout, reconnect.
- Receipt PASS.

### P5 — VPS/server

- Install headless agent sebagai systemd service.
- Test reboot/reconnect.
- Test isolated workspace.
- Test model/deploy worker separately.
- Test failover.

### P6 — Production release

- Apple Developer signing + notarization.
- Windows Authenticode signing.
- Release channel + checksums.
- Upgrade/rollback test.
- Security final review.
- Publish installer/documentation.

---

## 22. Acceptance matrix final

| Gate | Mac | Windows | VPS | Bukti wajib |
|---|---:|---:|---:|---|
| Installer/package build | ✓ | ✓ | n/a | CI artifact |
| Installer smoke | ✓ | wajib PASS | n/a | OS runner log |
| App/service launch | wajib | wajib | wajib | receipt |
| Engine health | wajib | wajib | n/a | HTTP receipt |
| Approved workspace | wajib | wajib | wajib | boundary test |
| Ask/Plan read-only | wajib | wajib | optional | agent receipt |
| Agent/Debug approval | wajib | wajib | wajib | approval audit |
| File edit + checkpoint | wajib | wajib | wajib | diff + receipt |
| Test/build/lint | wajib | wajib | wajib | process receipt |
| Git status/diff | wajib | wajib | wajib | receipt |
| Git push/merge approval | wajib | wajib | wajib | audit |
| Control API claim | wajib | wajib | wajib | job history |
| Heartbeat/lease | wajib | wajib | wajib | audit |
| Timeout/cancel | wajib | wajib | wajib | job history |
| Reconnect after restart | wajib | wajib | wajib | worker timeline |
| Secret storage | Keychain | DPAPI | secret store | security audit |
| Path escape rejection | wajib | wajib | wajib | negative test |
| AI provider swap | wajib | wajib | optional | provider receipt |
| Security CI | global | global | global | GitHub checks |
| Signing | notarized | Authenticode | n/a | signature evidence |
| SHA256SUMS | global | global | global | release asset |

Tidak ada FINAL PASS jika satu gate wajib masih FAIL/UNKNOWN.

---

## 23. Operasional harian

1. Install OpenTrue Code.
2. Pilih workspace Git.
3. Pilih AI provider/model.
4. Jika remote control diperlukan, masukkan Control API URL dan worker token melalui secure settings.
5. Gunakan Ask/Plan untuk read-only.
6. Gunakan Agent/Debug untuk perubahan; review diff dan approval.
7. Jalankan tests.
8. Review Git diff.
9. Approve push/PR hanya ketika siap.
10. Semua remote jobs dapat dilihat status/receipt-nya.

---

## 24. Troubleshooting minimum

### Engine tidak hidup
- Pastikan app process berjalan.
- Cek port hanya di loopback.
- Jangan ubah bind menjadi public sebagai workaround.
- Cek engine log yang sudah redacted dari secrets.

### Model gagal
- Cek endpoint/model selection.
- Ollama/LM Studio: pastikan local server hidup.
- Remote provider: cek secure credential reference, bukan mencetak key.

### Workspace ditolak
- Pastikan path adalah Git repository yang di-approve.
- Jangan menambahkan root drive hanya agar lolos.
- Periksa symlink/realpath.

### Worker offline
- Cek Control API URL HTTPS.
- Cek token scope/expiry.
- Cek heartbeat age.
- Jangan blind restart bila ada job aktif.

### Job stuck
- Periksa approval state, lease owner, dan heartbeat.
- Cancel/requeue sesuai policy; jangan eksekusi manual tanpa audit.

---

## 25. Aturan perubahan sistem

Perubahan pada authentication/authorization, token scopes, approved-root/path handling, command/task allowlist, child process execution, secret storage, Control API exposure, Git push/merge/deploy, sandbox/container isolation, auto-update/installer, signing/notarization, atau tenant/billing isolation dianggap high risk dan membutuhkan test + review tambahan.

Jangan menghapus approval/security check hanya untuk membuat CI hijau.

---

## 26. Satu kalimat target produk

**OpenTrue Code adalah engine coding/automation lintas AI yang membuat AI apa pun dapat mengirim pekerjaan melalui Control API ke agent Mac, Windows, atau VPS secara aman, terisolasi, dapat diaudit, dan dapat dibuktikan dengan receipt nyata.**
