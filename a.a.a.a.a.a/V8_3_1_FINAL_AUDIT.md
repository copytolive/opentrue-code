# TapeOut Hybrid v8.3.1 — Task-Source Resilience

Live v8.3.0 evidence showed the remaining run stopped before the scan-epoch fix could be exercised because `task_collector` hit a transient public HTTP failure, while BNB chain, protocol, market and localhost runtime remained healthy.

v8.3.1 final behavior:
- live `pod-mainnet.json` remains authoritative and is retried with bounded backoff;
- only a previously verified mainnet snapshot <=240 seconds old may bridge a transient mainnet HTTP failure, retaining its original fetched timestamp and revalidating hash/deployment pins;
- stale/malformed/tampered mainnet cache remains fail-closed;
- `pod-vectors-all.json` and `pod-refimpl.json` prefer live HTTP but can use bundled official v8.1 evidence;
- every used vector/ref entry is re-hashed against pinned manifest hashes before a task becomes active;
- exactly 125 audited full-domain stateless tasks remain mandatory;
- current-run scan-epoch freshness parity from v8.3.0 is retained;
- final actionable preflight remains fresh/live and wallet execution remains `MANUAL_ONLY`.

Final artifact gates:
- 149/149 tests PASS from canonical ZIP extracted clean;
- compileall PASS;
- 14/14 internal shell/command syntax PASS;
- standalone verifier syntax PASS;
- all-in-one syntax PASS;
- embedded ZIP byte-for-byte identical;
- archive contains no `.runtime`, `.venv`, `.hybrid.env`, pycache, or private-key artifact.

Canonical ZIP SHA256: `f549d13934978259c523c2a493c4a4f838021cd085b1637fe7e9163887b09129`
Verifier SHA256: `880432c9f60af1e3a1f1a6b0b41f2cd0810975392cb523408721a72028d68a38`
All-in-one SHA256: `cc648f1adf4aff14c8d7b6a038d5905126ed1f16058872fb2e7e253428eaf155`
Recovery patch SHA256: `1d9ab05c9d74784e20cf49c8138d6d23b1b5356bb373a9ce674f9f46d4db681c`

The canonical complete source/evidence is the ZIP stored in the project Library. Do not partially sync the runtime adapter without its audited evidence files.