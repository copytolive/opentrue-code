# TapeOut Hybrid v7.9 — Evidence Safety + Protocol Candidate Probe

- Redacts RPC URL path/query/userinfo from persisted evidence.
- Never persists curl stderr from credential-bearing RPC calls.
- Adds `protocol-candidates.json` from official same-origin frontend addresses.
- Probes candidate addresses with read-only `eth_getCode` on BNB Chain only.
- A bytecode hit is explicitly **not** treated as TapeOut protocol verification.
- Keeps `task_collector`, `chain_collector`, and `protocol_helper` fail-closed.
- Wallet boundary remains manual; no signing or broadcasting.
