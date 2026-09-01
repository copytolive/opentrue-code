# RWACode Delivery Protocol

RWACode uses a single-candidate delivery protocol so failures are found before expensive packaging and stale CI is never treated as evidence.

## Canonical commands

From `rwacode/`:

- `npm run verify:fast` — deterministic preflight, syntax, unit/security tests.
- `npm run verify:package` — build Intel + Apple Silicon packages, generate/verify manifest and hashes, then smoke-launch the packaged Intel app to shell READY.
- `npm run verify:release` — complete local/release gate (`verify:fast` + `verify:package`).
- `bash scripts/real-mac-final.sh` — physical Mac acceptance against the exact public release for current `main`.
- `bash scripts/protect-main.sh --apply` — explicit one-time GitHub branch-protection install through an authenticated repository-admin `gh` session.

These commands are the source of truth. GitHub Actions orchestrates them; acceptance logic should not be duplicated in workflow shell fragments.

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
| G0 | committed lockfile, Node >=22, forbidden legacy runtime absent, workflow candidate freeze |
| G1 | syntax + unit/security regression suite |
| G2 | root-locked Local/GitHub/Drive transaction integration |
| G3 | source security always; container security only when relevant on PRs, full on main/schedule; stable `security-gate` aggregates the result |
| G4 | macOS x86_64 + arm64 DMG/ZIP build |
| G5 | `build-manifest.json` + `SHA256SUMS` exactly match built files and candidate SHA |
| G6 | packaged `.app` reaches explicit shell READY; runner cleanup is not confused with a user Quit action |
| G7 | merge exact reviewed candidate SHA |
| G8 | main commit rebuilds and publishes a public GitHub pre-release with the same verification chain |
| G9 | physical Real-Mac acceptance: native provider input, normal quit/restart persistence, Apply, exact-byte Undo |

## Build manifest

`npm run manifest:build` produces `dist/build-manifest.json` and `dist/SHA256SUMS`. The manifest records product, package version, checked-out Git commit, architecture, artifact type, byte size, and SHA-256 digest for all four macOS packages.

No workflow is allowed to hard-code a versioned RWACode artifact filename. Version comes from `rwacode/package.json`.

## Launch definition

A process merely remaining alive is not launch proof. In CI smoke mode only (`RWACODE_CI_SMOKE=1`), the privileged shell writes a READY marker under the operating-system temporary directory after the local `index.html` renderer fires `did-finish-load`. The smoke runner verifies PID, app version and file-shell URL. After READY is proven, the runner terminates the process only as test cleanup; SIGTERM behavior is not treated as equivalent to a user choosing Quit on macOS.

Definitions:

- `CI_LAUNCH_PASS`: packaged app reaches shell READY in macOS CI.
- `REAL_MAC_PASS`: the public/main artifact passes physical Mac interaction, normal quit/restart persistence and exact Undo proof.
- `DISTRIBUTION_READY`: additionally code-signed and notarized with Apple release credentials.

Unsigned engineering previews must not be described as notarized production distributions.

## Public publication

Every RWACode-affecting push to `main` runs `.github/workflows/rwacode-release.yml`. It rebuilds the exact `main` SHA, executes `npm run verify:release`, and publishes a public GitHub prerelease tagged `rwacode-v<version>-build-<short-sha>` containing:

- Intel DMG
- Intel ZIP
- Apple Silicon DMG
- Apple Silicon ZIP
- `build-manifest.json`
- `SHA256SUMS`

## Physical Real-Mac gate

`bash rwacode/scripts/real-mac-final.sh` is intentionally interactive. It fast-forwards the local repository to exact `origin/main`, resolves the public release tag for that SHA, downloads the correct Intel/Apple-Silicon ZIP plus `SHA256SUMS`, verifies the public artifact, launches that packaged app, creates one controlled `VALUE=12345` fixture, and pauses only for the human-only checks that CI cannot perform:

- provider-native mouse/keyboard input with no RWACode DOM automation;
- Preview/Inspector behavior;
- Review -> Apply on the controlled fixture;
- normal Cmd+Q;
- packaged-app restart and browser-session persistence;
- durable Undo after restart.

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
