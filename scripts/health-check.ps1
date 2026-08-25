$ErrorActionPreference = "Continue"
$failed = $false
$targets = @{
  "Control plane"="http://127.0.0.1:8787/health"
  "Unified browser IDE"="http://localhost:3000"
  "Local chat"="http://localhost:3001"
  "code-server"="http://localhost:8080"
}
foreach ($item in $targets.GetEnumerator()) {
  $ok = $false
  for ($i=0; $i -lt 30; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 $item.Value | Out-Null; $ok=$true; break }
    catch { Start-Sleep -Seconds 2 }
  }
  if ($ok) { Write-Host "PASS  $($item.Key)  $($item.Value)" }
  else { Write-Host "FAIL  $($item.Key)  $($item.Value)"; $failed=$true }
}
if ($failed) { exit 1 }
