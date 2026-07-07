#!/usr/bin/env bash
set -euo pipefail

KIOSK_URL="${KIOSK_URL:-http://127.0.0.1:3000/kiosk}"

for attempt in {1..160}; do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if command -v chromium-browser >/dev/null 2>&1; then
  BROWSER="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  BROWSER="chromium"
else
  echo "Chromium was not found. Install it with: sudo apt install -y chromium-browser"
  exit 1
fi

exec "$BROWSER" \
  --kiosk "$KIOSK_URL" \
  --start-fullscreen \
  --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --disable-extensions \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000
