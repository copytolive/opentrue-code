# RWACode Delivery Protocol

RWACode uses a single-candidate delivery protocol so failures are found before expensive packaging and stale CI is never treated as evidence.

## Canonical commands

From `rwacode/`:

- `npm run verify:no-ai-api` — fail-closed production scan for AI-provider API endpoints, keys/model env names, provider SDK imports, or the removed provider API runner in shipped runtime files.
- `npm run verify:fast` — NO_AI_API gate plus deterministic preflight, syntax, unit/security tests.
- `npm run verify:package` — build Intel + Apple Silicon packages, generate/verify manifest and hashes, then smoke-launch the packaged Intel app through a real renderer -> preload/contextBridge -> main IPC round-trip.
- `npm run verify:release` — complete local/release gate (`verify:fast` + `verify:package`).
- `bash scripts/real-mac-final.sh` — physical Mac acceptance against the exact public release for current `main`.
- `bash scripts/protect-main.sh --apply` — explicit one-time GitHub branch-protection install through an authenticated repository-admin `gh` session.

These commands are the source of truth. GitHub Actions orchestrates them; acceptance logic should not be duplicated in workflow shell fragments.

## NO_AI_API production contract

ChatGPT, Claude, Gemini, and DeepSeek are supported only as native/manual provider browser pages using the user's normal web login/session. Shipped RWACode runtime must not contain or reach AI-provider API endpoints, AI API credential/model environment paths, provider SDKs, cookie/session-as-API bridges, provider DOM scraping/injection, automated Send/click/keydown, or AI CLI fallback.

Free-form AI reasoning therefore remains manual. If the user wants an AI-generated edit, the user explicitly copies a JSON ChangeSet from the provider page and pastes it into the RWACode-owned **Paste ChangeSet -> Review ChangeSet** surface. The ChangeSet is root-locked and validated by the Transaction Engine; **Apply** remains a separate explicit action. Deterministic local replacements may prepare a ChangeSet, but production has no Auto-Apply UI.

Non-AI integrations remain independent: `@Local`, `@GitHub`, and `@GoogleDrive` continue to use their workspace adapters. Apply never piggybacks Git commit/push/PR or Drive Sync.

## Candidate rules

1. Freeze scope before full CI.
2. A candidate is one exact Git SHA.
3. Any source/workflow change creates a new candidate and invalidates green results from earlier SHAs.
4. Superseded CI runs are cancelled automatically.
5. Pull-request Desktop CI checks out the exact PR head SHA, not the synthetic merge ref.
6. Failure classification before editing: `PRODUCT_BUG`, `TEST_BUG`, `WORKFLOW_BUG`, `INFRA_FLAKE`, or `RELEASE_BUG`.
7. Merge only when required gates are green on the same candidate SHA.

## Gate order

| Gate | Contract |
| --- | --- |
| G0 | committed lockfile, Node >=22, candidate freeze, and `RWACODE_NO_AI_API_STATIC=PASS` |
| G1 | syntax + unit/security regression suite, including fail-closed no-provider-egress tests |
| G2 | root-locked Local/GitHub/Drive transaction integration and manual ChangeSet Review -> Apply -> Undo |
| G3 | source security always; container security only when relevant on PRs, full on main/schedule; stable `security-gate` aggregates the result |
| G4 | macOS x86_64 + arm64 DMG/ZIP build |
| G5 | `build-manifest.json` + `SHA256SUMS` exactly match built files and candidate SHA |
| G6 | packaged `.app` reaches explicit READY only after a real shell renderer IPC round-trip; provider/Preview remain unprivileged |
| G7 | merge exact reviewed candidate SHA |
| G8 | exact current `main` rebuilds and publishes a public GitHub prerelease with the same verification chain |
| G9 | physical Real-Mac acceptance: native provider input, Preview/Inspector, Review -> Apply, normal quit/restart persistence, exact-byte Undo |
| G10 | `DISTRIBUTION_READY` only after Developer ID signing/notarization, Gatekeeper clean-profile acceptance, upgrade/rollback proof |

## Build manifest

`npm run manifest:build` produces `dist/build-manifest.json` and `dist/SHA256SUMS`. The manifest records product, package version, checked-out Git commit, architecture, artifact type, byte size, and SHA-256 digest for all four macOS packages.

No workflow is allowed to hard-code a versioned RWACode artifact filename. Version comes from `rwacode/package.json`.

## Launch definition

A process merely remaining alive is not launch proof. In CI smoke mode only (`RWACODE_CI_SMOKE=1`), the privileged shell reports READY only after the local `index.html` renderer successfully invokes a privileged shell IPC method and the preload reports the matching app version back to main. The smoke runner verifies PID, app version, file-shell URL and `ipcRoundTrip=true`. After READY is proven, the runner terminates the process only as test cleanup; SIGTERM behavior is not treated as equivalent to a user choosing Quit on macOS.

Definitions:

- `CI_LAUNCH_PASS`: packaged app reaches shell READY through the real IPC bridge in macOS CI.
- `REAL_MAC_PASS`: the public/main artifact passes physical Mac interaction, normal quit/restart persistence and exact Undo proof.
- `DISTRIBUTION_READY`: additionally code-signed and notarized with Apple release credentials and proven on a clean profile.

Unsigned engineering previews must not be described as notarized production distributions.

## Public publication

Every RWACode-affecting push to `main` runs `.github/workflows/rwacode-release.yml`. It rebuilds the exact `main` SHA, executes `npm run verify:release`, and publishes a public GitHub prerelease tagged `rwacode-v<version>-build-<short-sha>` containing:

- Intel DMG
- Intel ZIP
- Apple Silicon DMG
- Apple Silicon ZIP
- `build-manifest.json`
- `SHA256SUMS`

The release is an **engineering preview** until Developer ID signing/notarization and clean-profile Gatekeeper acceptance are proven.

## Physical Real-Mac gate

`bash rwacode/scripts/real-mac-final.sh` is intentionally interactive. It fast-forwards the local repository to exact `origin/main`, resolves the public release tag for that SHA, downloads the correct Intel/Apple-Silicon ZIP plus `SHA256SUMS`, verifies the public artifact, launches that packaged app, creates one controlled `VALUE=12345` fixture, and pauses only for the human-only checks that CI cannot perform:

- open ChatGPT / Claude / Gemini / DeepSeek as normal native provider pages and verify manual mouse/keyboard input with no RWACode DOM automation;
- verify the provider and Preview surfaces never gain privileged workspace IPC;
- Preview/Inspector behavior and resize geometry;
- prepare the controlled edit, Review -> Apply, and verify the physical AFTER hash differs;
- normal Cmd+Q;
- packaged-app restart and browser-session/workspace-state persistence per contract;
- durable Undo after restart and byte-for-byte restored SHA-256;
- verify Apply alone did not commit/push/open a PR or Sync to Drive.

The script itself verifies the physical file changed after Apply and that SHA-256 after Undo is byte-for-byte identical to BEFORE. It prints `REAL_MAC_FINAL=PASS` only after all physical acknowledgements and machine-verifiable assertions pass.

## Repository-admin gate

The security workflow exposes one stable required context, `security-gate`, so branch protection never depends on a path-conditional container job. The canonical required contexts are:

- `test-and-build-macos`
- `acceptance`
- `bugbot`
- `security-gate`

When a connected GitHub integration cannot mutate repository administration state, run this explicit owner-side command after the final checks exist:

`bash rwacode/scripts/protect-main.sh --apply`

The script uses GitHub's branch-protection REST endpoint through the already-authenticated `gh` account. It requires pull requests with zero mandatory reviewers, strict up-to-date status checks, conversation resolution, administrator enforcement, and disables force pushes/deletion. It then reads the protection back and prints `BRANCH_PROTECTION=PASS` only when the exact contexts and safety toggles match.