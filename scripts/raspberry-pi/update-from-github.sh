#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-listening-house.service}"
DATABASE_PATH="${DATABASE_PATH:-$PROJECT_DIR/data/listening-house.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/data/backups}"
SKIP_APT="${SKIP_APT:-0}"

cd "$PROJECT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "Git is not installed. Run: sudo apt-get install -y git"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed. Install Node.js 20 LTS first."
  exit 1
fi

if [[ "$SKIP_APT" != "1" ]] && command -v apt-get >/dev/null 2>&1; then
  echo "Checking Raspberry Pi speech package..."
  sudo apt-get update
  sudo apt-get install -y espeak-ng alsa-utils xbindkeys pulseaudio-utils || \
    sudo apt-get install -y espeak-ng alsa-utils xbindkeys
elif [[ "$SKIP_APT" == "1" ]]; then
  echo "Skipping apt package checks for automatic update."
fi

echo "Stopping Listening House service if it is running..."
sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true

mkdir -p "$BACKUP_DIR"
if [[ -f "$DATABASE_PATH" ]]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  echo "Backing up database to $BACKUP_DIR/listening-house-$STAMP.sqlite"
  cp "$DATABASE_PATH" "$BACKUP_DIR/listening-house-$STAMP.sqlite"
  [[ -f "$DATABASE_PATH-wal" ]] && cp "$DATABASE_PATH-wal" "$BACKUP_DIR/listening-house-$STAMP.sqlite-wal"
  [[ -f "$DATABASE_PATH-shm" ]] && cp "$DATABASE_PATH-shm" "$BACKUP_DIR/listening-house-$STAMP.sqlite-shm"
else
  echo "No existing database found at $DATABASE_PATH. Skipping database backup."
fi

echo "Pulling latest code from GitHub..."
git pull --ff-only

echo "Installing dependencies..."
npm install

echo "Building production website..."
npm run build

echo "Refreshing kiosk desktop launcher..."
chmod +x "$PROJECT_DIR/scripts/raspberry-pi/"*.sh
"$PROJECT_DIR/scripts/raspberry-pi/install-kiosk-launcher.sh" || echo "Desktop launcher refresh failed. The server can still run."
"$PROJECT_DIR/scripts/raspberry-pi/install-volume-keys.sh" || echo "Volume key setup failed. The kiosk can still run."

if [[ ! -d "$PROJECT_DIR/data/hmong-voice/Kong" ]]; then
  echo "Installing Hmong fallback voice pack..."
  npm run speech:install-hmong || echo "Hmong voice download failed. The kiosk can still run; retry later."
else
  echo "Hmong fallback voice pack already installed."
fi

echo "Preparing read-aloud speech cache..."
npm run speech:preload || echo "Speech preload could not finish. Read aloud will still use live fallback when available."

if systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "Restarting $SERVICE_NAME..."
  sudo systemctl start "$SERVICE_NAME"
  sleep 2
  sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
else
  echo "Service $SERVICE_NAME is not installed yet."
  echo "Run: sudo ./scripts/raspberry-pi/install-autostart.sh"
fi

echo "Checking local server health..."
for attempt in {1..30}; do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo "Update complete. Kiosk: http://localhost:3000/kiosk"
    exit 0
  fi
  sleep 1
done

echo "Update finished, but the local health check did not respond."
echo "Check logs with: journalctl -u $SERVICE_NAME -n 80 --no-pager"
exit 1
