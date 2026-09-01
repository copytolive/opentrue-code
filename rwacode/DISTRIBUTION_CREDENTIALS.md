# Apple Distribution Credentials

RWACode's signed macOS distribution workflow uses repository Actions secrets. Secret values must be installed from a trusted local Mac and must never be pasted into issues, pull requests, logs, or chat.

## Required signing credentials

- Developer ID Application certificate exported as `.p12`
- `.p12` export password
- Apple Team ID

## Choose one notarization method

### Option 1 — Apple ID + app-specific password

This is the fastest fallback when App Store Connect API access or a `.p8` team key is unavailable. Use the Apple ID attached to the Apple Developer team and create an app-specific password for that Apple ID. Do not use the normal Apple ID password.

The installer stores these repository Actions secrets:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

### Option 2 — App Store Connect API key

The CI-friendly alternative uses:

- `APPLE_API_KEY_P8_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_TEAM_ID`

The `.p8` file is base64-encoded locally before being sent to GitHub Actions Secrets.

## Install credentials

From the repository root, run:

```bash
bash rwacode/scripts/configure-apple-distribution.sh
```

The installer first asks for the `.p12` and Team ID, then lets you choose Apple ID or API-key notarization. Every secret value is passed to `gh secret set` through standard input. The script never prints secret values.

## Run the physical final gate

After the signing credentials and one notarization method are configured, run:

```bash
bash rwacode/scripts/distribution-final.sh
```

That command only reaches `DISTRIBUTION_READY=PASS` after exact-main signing/notarization, artifact/hash verification, Gatekeeper validation, physical Real-Mac acceptance, clean-profile launch acceptance, and controlled upgrade/rollback acceptance all pass.
