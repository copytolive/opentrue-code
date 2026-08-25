#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Install Docker Desktop: https://docs.docker.com/desktop/setup/install/mac-install/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Buka Docker Desktop, tunggu aktif, lalu jalankan ulang."
  exit 1
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl diperlukan untuk membuat secret lokal yang aman."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  editor_password="$(openssl rand -hex 16)"
  auth_secret="$(openssl rand -hex 32)"
  billing_secret="$(openssl rand -hex 32)"
  metrics_token="$(openssl rand -hex 32)"
  webui_secret="$(openssl rand -hex 32)"
  postgres_password="$(openssl rand -hex 24)"
  redis_password="$(openssl rand -hex 24)"

  sed -i.bak \
    -e "s|^CODE_SERVER_PASSWORD=.*|CODE_SERVER_PASSWORD=$editor_password|" \
    -e "s|^AUTH_SIGNING_SECRET=.*|AUTH_SIGNING_SECRET=$auth_secret|" \
    -e "s|^BILLING_WEBHOOK_SECRET=.*|BILLING_WEBHOOK_SECRET=$billing_secret|" \
    -e "s|^METRICS_TOKEN=.*|METRICS_TOKEN=$metrics_token|" \
    -e "s|^WEBUI_SECRET_KEY=.*|WEBUI_SECRET_KEY=$webui_secret|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$postgres_password|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$redis_password|" \
    .env
  rm -f .env.bak
  echo "Password editor lokal: $editor_password"
  echo "Secret lain tersimpan hanya di .env lokal dan tidak dicetak."
fi

mkdir -p workspace
echo "Menyalakan Ollama lebih dulu..."
docker compose up -d ollama
echo "Mengunduh model OLLAMA_MODEL. Default qwen3-coder:30b berukuran besar; proses ini harus selesai sebelum IDE dinyalakan."
docker compose run --rm ollama-model
echo "Menyalakan seluruh OpenTrue Code..."
docker compose up -d
"$(dirname "$0")/health-check.sh"
open http://localhost:3000
