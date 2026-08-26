# MacBook path fix — `cd: no such file or directory`

The error:

```text
cd: no such file or directory:
 /Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a
```

means the Hybrid source has not been installed into that path yet.

Hybrid v7.2 removes that prerequisite.

## Recommended

1. Download `tapeout_hybrid_v7_2_SELF_INSTALLING.zip`.
2. Extract the ZIP.
3. Open the extracted `a.a.a.a.a.a` directory.
4. Run `START_HYBRID.command` from there.

Or Terminal:

```bash
cd ~/Downloads
unzip -q tapeout_hybrid_v7_2_SELF_INSTALLING.zip
cd a.a.a.a.a.a
chmod +x START_HYBRID.command macos/*.sh
./START_HYBRID.command
```

`START_HYBRID.command` now creates the exact `/Users/Shared/.../a.a.a.a.a.a` path, copies the source there while preserving operator/runtime state, installs or repairs the Python runtime and launchd services, verifies `http://127.0.0.1:8787/api/summary`, then opens the local dashboard.

If live RPC/adapters are not configured yet, the page must still open and show `SETUP_REQUIRED`; it must not produce `ERR_CONNECTION_REFUSED`.
