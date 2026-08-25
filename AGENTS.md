# OpenTrue Code Agent Rules

## Default workflow

1. Inspect the repository and its local instructions.
2. State the intended change and affected files.
3. Create a dedicated branch for non-trivial work.
4. Make the smallest coherent edit.
5. Run relevant lint, typecheck, tests, and build.
6. Show `git diff --stat` and summarize verification.
7. Commit only after verification.
8. Push or deploy only after explicit user approval.

## Mandatory approval gates

Explicit approval is required immediately before:

- pushing to a protected/default branch;
- merging a pull request;
- running a production deployment;
- applying database migrations;
- changing DNS, firewall, secrets, access, billing, or infrastructure;
- deleting files, branches, releases, deployments, or production data.

## Never

- print, commit, upload, or echo secrets;
- copy `.env`, credentials, private keys, wallets, database dumps, or user data into Git;
- bypass branch protection, tests, or confirmation gates;
- claim deployment success without a health check and revision/commit receipt;
- claim a test passed when it was not executed.
