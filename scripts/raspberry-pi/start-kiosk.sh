#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KIOSK_URL="${KIOSK_URL:-http://127.0.0.1:3000/kiosk}"
KIOSK_PROFILE_DIR="${KIOSK_PROFILE_DIR:-$PROJECT_DIR/data/chromium-kiosk-profile}"
KIOSK_LAUNCH_URL="$KIOSK_URL"
if [[ "$KIOSK_LAUNCH_URL" == *"?"* ]]; then
  KIOSK_LAUNCH_URL="$KIOSK_LAUNCH_URL&kioskBuild=$(date +%s)"
else
  KIOSK_LAUNCH_URL="$KIOSK_LAUNCH_URL?kioskBuild=$(date +%s)"
fi

export DISPLAY="${DISPLAY:-:0}"
if [[ -z "${XAUTHORITY:-}" && -n "${HOME:-}" && -f "$HOME/.Xauthority" ]]; then
  export XAUTHORITY="$HOME/.Xauthority"
fi
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" && -n "${XDG_RUNTIME_DIR:-}" ]]; then
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
fi

wait_for_server() {
  for attempt in {1..160}; do
    if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if ! wait_for_server; then
  echo "Listening House server is not ready yet. Trying to start it..."
  sudo -n systemctl start listening-house.service >/dev/null 2>&1 || true
fi

if ! wait_for_server; then
  echo "Listening House server did not respond at http://127.0.0.1:3000/api/health"
  echo "Check it with: sudo systemctl status listening-house --no-pager"
  exit 1
fi

for attempt in {1..10}; do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

mkdir -p "$KIOSK_PROFILE_DIR"
rm -rf "$KIOSK_PROFILE_DIR/Default/Cache" \
  "$KIOSK_PROFILE_DIR/Default/Code Cache" \
  "$KIOSK_PROFILE_DIR/Default/Service Worker" 2>/dev/null || true

if [[ "${KIOSK_SET_VOLUME:-1}" != "0" && -x "$PROJECT_DIR/scripts/raspberry-pi/volume-control.sh" ]]; then
  "$PROJECT_DIR/scripts/raspberry-pi/volume-control.sh" loud >/dev/null 2>&1 || true
fi

find_browser() {
  if [[ -n "${KIOSK_BROWSER:-}" && -x "$KIOSK_BROWSER" ]]; then
    echo "$KIOSK_BROWSER"
    return 0
  fi

  for candidate in \
    /usr/lib/chromium/chromium \
    /usr/lib/chromium-browser/chromium-browser \
    /snap/bin/chromium; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  if command -v chromium >/dev/null 2>&1; then
    command -v chromium
    return 0
  fi

  if command -v chromium-browser >/dev/null 2>&1; then
    command -v chromium-browser
    return 0
  fi

  return 1
}

if ! BROWSER="$(find_browser)"; then
  echo "Chromium was not found. Install it with: sudo apt install -y chromium-browser"
  exit 1
fi

unset CHROMIUM_FLAGS CHROME_FLAGS

exec "$BROWSER" \
  --user-data-dir="$KIOSK_PROFILE_DIR" \
  --kiosk "$KIOSK_LAUNCH_URL" \
  --start-fullscreen \
  --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --disable-extensions \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000
