# Repository Review

Use this skill when reviewing a code change before commit or PR.

1. Read the diff and identify the behavior being changed.
2. Check authentication, authorization, tenant boundaries, filesystem boundaries, command execution, network access, secrets, and destructive operations when relevant.
3. Search for call sites and tests affected by changed symbols.
4. Run the narrowest relevant tests first, then lint/typecheck/build when defined.
5. Run Bugbot for newly introduced high-risk patterns.
6. Report concrete failures with file/function context. Do not claim a check passed unless it actually ran.
7. Keep remote mutation and production actions behind explicit approval.
