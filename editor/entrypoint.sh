#!/bin/sh
set -eu

# OpenTrue runs the editor with the fixed upstream `coder` UID/GID (1000).
# We intentionally do not support runtime UID rewriting via fixuid/DOCKER_USER:
# bind mounts are owned/provisioned by the OpenTrue deployment, which removes
# the setuid fixuid binary and its vulnerable Go runtime from the image.

if [ -n "${DOCKER_USER:-}" ]; then
  echo "DOCKER_USER is not supported by the hardened OpenTrue editor image" >&2
  exit 64
fi

# Preserve the useful upstream startup hook without requiring fixuid/sudo.
if [ -n "${ENTRYPOINTD:-}" ] && [ -d "${ENTRYPOINTD}" ]; then
  find "${ENTRYPOINTD}" -type f -executable -print -exec {} \;
fi

exec dumb-init /usr/bin/code-server \
  --bind-addr 0.0.0.0:8080 \
  /home/coder/workspace \
  "$@"
