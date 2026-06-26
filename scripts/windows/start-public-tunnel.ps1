$ErrorActionPreference = "Stop"

$port = if ($env:PORT) { $env:PORT } else { "3000" }
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflared) {
  Write-Host "cloudflared is not installed."
  Write-Host "Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
}

Write-Host "Starting a temporary public tunnel to http://localhost:$port"
Write-Host "Keep this window open. Cloudflare will print the public HTTPS address below."
& $cloudflared.Source tunnel --url "http://localhost:$port"
