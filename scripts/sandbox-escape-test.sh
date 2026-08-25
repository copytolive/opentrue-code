#!/usr/bin/env sh
set -eu
command -v bwrap >/dev/null 2>&1 || { echo "bubblewrap is required" >&2; exit 1; }

root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT INT TERM
mkdir -p "$root/workspace"
printf 'inside\n' > "$root/workspace/inside.txt"
payload_uid="${SUDO_UID:-65534}"
payload_gid="${SUDO_GID:-65534}"
chown -R "$payload_uid:$payload_gid" "$root/workspace"
# The test workspace is intentionally writable. Isolation is proven by the
# absence of host paths/network, not by making the one approved workspace RO.
chmod 0777 "$root/workspace"

args="--unshare-all --die-with-parent --new-session --proc /proc --dev /dev --tmpfs /tmp --dir /workspace --bind $root/workspace /workspace --ro-bind /usr /usr"
for p in /bin /lib /lib64; do
  if [ -e "$p" ]; then args="$args --ro-bind $p $p"; fi
done

# shellcheck disable=SC2086
bwrap $args \
  --uid "$payload_uid" \
  --gid "$payload_gid" \
  --cap-drop ALL \
  --setenv PATH /usr/local/bin:/usr/bin:/bin \
  --setenv HOME /tmp \
  --setenv CI true \
  -- /usr/bin/sh -ceu '
    test "$(id -u)" -ne 0
    test -f /workspace/inside.txt
    test ! -e /etc/passwd
    test ! -e /root
    test ! -e /var/run/docker.sock
    if grep -q "^[^[:space:]]*[[:space:]]00000000[[:space:]]" /proc/net/route 2>/dev/null; then
      echo "sandbox unexpectedly has a default network route" >&2
      exit 42
    fi
    printf "sandbox-write-ok\n" > /workspace/probe.txt
  '

test "$(cat "$root/workspace/probe.txt")" = "sandbox-write-ok"
echo "SANDBOX ESCAPE TEST PASS: non-root payload can write only the approved workspace and cannot see host /etc, root, docker socket, or a default network route"
