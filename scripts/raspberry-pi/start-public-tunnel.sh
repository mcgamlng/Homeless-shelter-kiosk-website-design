#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

echo "Starting a temporary public tunnel to http://localhost:${PORT}"
echo "Keep this terminal open. Cloudflare will print the public HTTPS address below."
cloudflared tunnel --url "http://localhost:${PORT}"
