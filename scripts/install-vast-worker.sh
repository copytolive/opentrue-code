#!/usr/bin/env sh
set -eu
command -v docker >/dev/null 2>&1 || { echo "Docker required" >&2; exit 1; }
: "${CONTROL_PLANE_URL:?required}" "${CONTROL_PLANE_TOKEN:?required}"
docker pull ollama/ollama:latest
docker rm -f opentrue-ollama >/dev/null 2>&1 || true
docker run -d --gpus all --restart unless-stopped --name opentrue-ollama -p 127.0.0.1:11434:11434 ollama/ollama:latest
docker exec opentrue-ollama ollama pull "${OLLAMA_MODEL:-qwen2.5-coder:7b}"
echo "Ollama worker ready; start workers/vast-worker.mjs with the same protected environment."
