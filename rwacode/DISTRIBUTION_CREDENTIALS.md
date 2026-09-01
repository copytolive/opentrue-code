# Apple Distribution Credentials

RWACode's signed macOS distribution workflow uses repository Actions secrets. Secret values must be installed from a trusted local Mac and must never be pasted into issues, pull requests, logs, or chat.

From the repository root, run:

```bash
bash rwacode/scripts/configure-apple-distribution.sh
```

The installer reads the Developer ID Application `.p12`, its export password, an App Store Connect `.p8` key, API Key ID, Issuer ID, and Apple Team ID locally. Binary key material is base64-encoded locally and each value is passed to `gh secret set` through standard input. The script never prints the secret values.

After the six secret names are configured, the physical final gate is:

```bash
bash rwacode/scripts/distribution-final.sh
```

That command only reaches `DISTRIBUTION_READY=PASS` after exact-main signing/notarization, artifact/hash verification, Gatekeeper validation, physical Real-Mac acceptance, clean-profile launch acceptance, and controlled upgrade/rollback acceptance all pass.
