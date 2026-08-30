$ErrorActionPreference = "Stop"

$repo = "copytolive/opentrue-code"
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "OpenTrue-Code-Installer" }
$asset = $release.assets | Where-Object { $_.name -like "*windows-x64.exe" } | Select-Object -First 1
if (-not $asset) {
  throw "No Windows x64 OpenTrue Code installer found in the latest GitHub release."
}

$tmp = Join-Path $env:TEMP ("OpenTrue-Code-" + [guid]::NewGuid().ToString() + ".exe")
Write-Host "Downloading OpenTrue Code..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -UseBasicParsing

try {
  Write-Host "Starting installer..."
  $p = Start-Process -FilePath $tmp -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Installer exited with code $($p.ExitCode)" }
  Write-Host "OpenTrue Code installation completed."
  Write-Host "Windows SmartScreen may warn because this public build is unsigned. The installer does not disable SmartScreen."
}
finally {
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}
