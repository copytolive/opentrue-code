# RWACode macOS Distribution Completion

This document defines the final production-distribution path after the normal NO_AI_API engineering release is green.

## Security model

Apple credentials never belong in source control, release notes, issues, chat, or workflow logs. The repository only stores credential names and fail-closed build logic. Values are stored as GitHub Actions secrets by the repository owner from a trusted Mac.

Required credentials:

- Developer ID Application certificate exported as a password-protected `.p12`
- App Store Connect Team API key `.p8`
- App Store Connect API Key ID
- App Store Connect Issuer ID
- Apple Team ID

The signed distribution workflow requires these GitHub Actions secret names:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_API_KEY_P8_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_TEAM_ID`

## One-time credential installation

From the repository root on the trusted Mac:

```bash
bash rwacode/scripts/configure-apple-distribution.sh
```

The script reads private values interactively, sends them directly to GitHub Actions secrets through the authenticated `gh` session, never prints the values, and never writes them into the repository.

## Signed exact-main candidate

`.github/workflows/rwacode-distribution.yml` is manual-only and requires an explicit exact current `main` SHA. It fails unless:

1. all Apple distribution secret names resolve to non-empty values;
2. the requested SHA is exactly current `origin/main`;
3. the normal NO_AI_API/static/unit/security gates pass;
4. Intel and Apple Silicon DMG/ZIP packages build with `forceCodeSigning=true`;
5. both app bundles are signed with Developer ID Application;
6. the expected Apple Team ID is present in the signature;
7. Apple notarization tickets are stapled and validate;
8. Gatekeeper accepts both app bundles;
9. package hashes and exact candidate SHA match the manifest;
10. the packaged renderer -> preload -> main IPC READY smoke passes.

Only then does CI publish the prerelease tag:

`rwacode-v<version>-distribution-<12-char-main-sha>`

The signed candidate includes the four macOS packages, `build-manifest.json`, `SHA256SUMS`, and `DISTRIBUTION_ATTESTATION.txt`.

## Final physical completion

After the Apple credentials are installed, the canonical owner-side command is:

```bash
bash rwacode/scripts/distribution-final.sh
```

That script:

1. fast-forwards the local repository to exact `origin/main` and refuses a dirty worktree;
2. verifies the required secret names exist without reading their values;
3. triggers the signed/notarized exact-main workflow when the distribution candidate does not already exist;
4. waits for the workflow and release;
5. downloads the correct architecture ZIP + DMG + SHA256 + attestation;
6. re-verifies checksums, Developer ID signature, notarization staple, Gatekeeper and exact commit locally;
7. runs the full interactive `REAL_MAC_FINAL` flow against the signed distribution tag, including manual native provider input, Preview/Inspector, Review -> Apply, normal Cmd+Q, restart persistence and exact-byte Undo;
8. requires a clean-profile/second-Mac launch with no Gatekeeper bypass;
9. requires controlled upgrade/rollback compatibility proof;
10. promotes the GitHub prerelease to the latest non-prerelease only after every previous gate passes.

The only valid terminal completion marker is:

```text
DISTRIBUTION_READY=PASS
```

Do not describe a signed candidate, an unsigned engineering preview, or a workflow-only result as `DISTRIBUTION_READY` before this marker is produced by the physical final script.
