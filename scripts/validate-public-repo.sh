#!/usr/bin/env sh
set -eu

fail(){ echo "PUBLIC_REPO_VALIDATION_FAIL: $*" >&2; exit 1; }

# Reject files that belong only to a local/private runtime. Match directory
# prefixes too; checking only the directory name would miss workspace/foo.
git ls-files | while IFS= read -r file; do
  case "$file" in
    .env|.env.*)
      [ "$file" = ".env.example" ] || fail "private environment file tracked: $file";;
    workspace/*|data/*|backups/*|receipts/*|secrets/*)
      fail "private/runtime path tracked: $file";;
    *.pem|*.key|*.p12|*.pfx|id_rsa*|id_ed25519*|*.gguf|*.safetensors|*.ckpt|*.onnx|*.pt|*.pth|*.dump|*.sql.gz)
      fail "forbidden tracked artifact: $file";;
  esac
  if [ -f "$file" ]; then
    size=$(wc -c < "$file" | tr -d ' ')
    [ "$size" -le 50000000 ] || fail "tracked file exceeds 50 MB: $file ($size bytes)"
  fi
done

# Exact high-risk markers are never allowed in the current public tree.
if git grep -I -n -E 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}' -- ':!scripts/validate-public-repo.sh' >/tmp/opentrue-public-secret-hits 2>/dev/null; then
  cat /tmp/opentrue-public-secret-hits >&2
  fail "high-risk secret marker found"
fi
rm -f /tmp/opentrue-public-secret-hits

echo "PUBLIC_REPO_VALIDATION_PASS"
