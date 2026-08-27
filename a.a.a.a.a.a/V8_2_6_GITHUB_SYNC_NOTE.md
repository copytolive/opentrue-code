# v8.2.6 GitHub sync note

The canonical v8.2.6 executable source package is preserved as `tapeout_hybrid_v8_2_6_PROVIDER_COMPATIBLE_FINAL.zip` in the project Library, SHA256 `c5a2ac2bca0ebefbfd7ab476c12eb846d9b9cf0bf8c18eec676c787cefe1fad7`.

The GitHub connector used in this session does not provide a native apply-patch/upload-binary operation for the full runtime package. To avoid leaving this branch with a partial import dependency, the branch keeps the last self-contained `chain_collector` until the full v8.2.6 helper/core tree can be transported atomically. The tested ZIP plus `V8_2_6_PATCH.diff` are the recovery/canonical artifacts.

Do not merge to `main` from this note alone. Wallet policy remains MANUAL_ONLY.