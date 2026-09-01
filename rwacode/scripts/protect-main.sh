#!/usr/bin/env bash
set -euo pipefail

REPO="${RWACODE_REPOSITORY:-copytolive/opentrue-code}"
BRANCH="${RWACODE_PROTECTED_BRANCH:-main}"
MODE="${1:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) is required."
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login"
  exit 1
fi

cat <<'PLAN'
RWACode main protection target:
- require pull request before merge (0 mandatory approving reviews)
- require branch to be up to date
- require status checks:
  * test-and-build-macos
  * acceptance
  * bugbot
  * security-gate
- require conversation resolution
- enforce rules for repository admins
- block force pushes
- block branch deletion
PLAN

if [[ "$MODE" != "--apply" ]]; then
  echo "DRY_RUN=PASS"
  echo "To apply explicitly: bash rwacode/scripts/protect-main.sh --apply"
  exit 0
fi

TMP="$(mktemp -t rwacode-protection.XXXXXX.json)"
trap 'rm -f "$TMP"' EXIT
cat >"$TMP" <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "test-and-build-macos",
      "acceptance",
      "bugbot",
      "security-gate"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON

echo "Applying protection to $REPO:$BRANCH ..."
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "repos/$REPO/branches/$BRANCH/protection" \
  --input "$TMP" >/dev/null

PROTECTED="$(gh api "repos/$REPO/branches/$BRANCH" --jq '.protected')"
test "$PROTECTED" = "true"

STRICT="$(gh api "repos/$REPO/branches/$BRANCH/protection" --jq '.required_status_checks.strict')"
test "$STRICT" = "true"

CONTEXTS="$(gh api "repos/$REPO/branches/$BRANCH/protection" --jq '.required_status_checks.contexts[]' | sort)"
EXPECTED="$(printf '%s\n' acceptance bugbot security-gate test-and-build-macos | sort)"
test "$CONTEXTS" = "$EXPECTED"

CONVERSATIONS="$(gh api "repos/$REPO/branches/$BRANCH/protection" --jq '.required_conversation_resolution.enabled')"
test "$CONVERSATIONS" = "true"

FORCE_PUSH="$(gh api "repos/$REPO/branches/$BRANCH/protection" --jq '.allow_force_pushes.enabled')"
DELETIONS="$(gh api "repos/$REPO/branches/$BRANCH/protection" --jq '.allow_deletions.enabled')"
test "$FORCE_PUSH" = "false"
test "$DELETIONS" = "false"

echo "BRANCH_PROTECTION=PASS"
echo "REPOSITORY=$REPO"
echo "BRANCH=$BRANCH"
echo "REQUIRED_CHECKS=acceptance,bugbot,security-gate,test-and-build-macos"
