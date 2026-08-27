# TapeOut Hybrid v8.3.1 — Task-Source Resilience Final Release

Live v8.3.0 evidence showed the runtime/chain/protocol path remained healthy, but the verifier stopped before the scan-epoch gate because `task_collector` hit a transient public HTTP failure.

v8.3.1 hardening:
- `pod-mainnet.json` remains the authoritative discovery source and is retried with bounded backoff;
- a previously verified mainnet snapshot may be reused only from production runtime cache with age <= 240 seconds and is revalidated against pinned deployment/schema facts;
- stale, malformed, or tampered mainnet cache remains fail-closed;
- vectors/refimpl prefer live official HTTP and may fall back to the bundled official v8.1 evidence;
- every vector/ref entry is still re-hashed against the 267 pinned task hashes before activation;
- exactly 125 audited full-domain stateless tasks remain required;
- build/test environments do not write `.runtime` cache into the source tree unless `HYBRID_RUNTIME` or an explicit cache path is configured;
- cache/static evidence never authorizes wallet action; actionable preflight remains fresh/live;
- wallet execution remains `MANUAL_ONLY`.

Final artifact gates:
- 149/149 tests PASS from canonical ZIP extracted into a clean directory;
- `python3 -m compileall -q src adapters` PASS;
- 14/14 internal `.sh` / `.command` syntax PASS;
- standalone verifier syntax PASS;
- all-in-one syntax PASS;
- embedded ZIP is byte-for-byte identical to canonical ZIP;
- archive security gate PASS: no `.hybrid.env`, `.runtime`, `.venv`, or private-key artifact.

Canonical ZIP SHA256: `f549d13934978259c523c2a493c4a4f838021cd085b1637fe7e9163887b09129`
Verifier SHA256: `880432c9f60af1e3a1f1a6b0b41f2cd0810975392cb523408721a72028d68a38`
All-in-one SHA256: `cc648f1adf4aff14c8d7b6a038d5905126ed1f16058872fb2e7e253428eaf155`
Recovery patch SHA256: `1d9ab05c9d74784e20cf49c8138d6d23b1b5356bb373a9ce674f9f46d4db681c`
