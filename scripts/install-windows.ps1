$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Install Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/"
  exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Buka Docker Desktop dengan WSL2, tunggu aktif, lalu jalankan ulang."
  exit 1
}

function New-HexSecret([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToHexString($buffer).ToLowerInvariant()
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  $editorPassword = New-HexSecret 16
  $authSecret = New-HexSecret 32
  $billingSecret = New-HexSecret 32
  $metricsToken = New-HexSecret 32
  $webuiSecret = New-HexSecret 32
  $postgresPassword = New-HexSecret 24
  $redisPassword = New-HexSecret 24

  $content = Get-Content ".env" -Raw
  $content = [regex]::Replace($content, "(?m)^CODE_SERVER_PASSWORD=.*$", "CODE_SERVER_PASSWORD=$editorPassword")
  $content = [regex]::Replace($content, "(?m)^AUTH_SIGNING_SECRET=.*$", "AUTH_SIGNING_SECRET=$authSecret")
  $content = [regex]::Replace($content, "(?m)^BILLING_WEBHOOK_SECRET=.*$", "BILLING_WEBHOOK_SECRET=$billingSecret")
  $content = [regex]::Replace($content, "(?m)^METRICS_TOKEN=.*$", "METRICS_TOKEN=$metricsToken")
  $content = [regex]::Replace($content, "(?m)^WEBUI_SECRET_KEY=.*$", "WEBUI_SECRET_KEY=$webuiSecret")
  $content = [regex]::Replace($content, "(?m)^POSTGRES_PASSWORD=.*$", "POSTGRES_PASSWORD=$postgresPassword")
  $content = [regex]::Replace($content, "(?m)^REDIS_PASSWORD=.*$", "REDIS_PASSWORD=$redisPassword")
  Set-Content ".env" $content -Encoding utf8
  Write-Host "Password editor lokal: $editorPassword"
  Write-Host "Secret lain tersimpan hanya di .env lokal dan tidak dicetak."
}

New-Item -ItemType Directory -Force "workspace" | Out-Null
Write-Host "Menyalakan Ollama lebih dulu..."
docker compose up -d ollama
Write-Host "Mengunduh OLLAMA_MODEL. Default qwen3-coder:30b berukuran besar; proses ini harus selesai sebelum IDE dinyalakan."
docker compose run --rm ollama-model
Write-Host "Menyalakan seluruh OpenTrue Code..."
docker compose up -d
& "$PSScriptRoot\health-check.ps1"
Start-Process "http://localhost:3000"
