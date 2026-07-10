#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
NPM_BIN="$(command -v npm)"

if [[ -z "$NPM_BIN" ]]; then
  echo "npm was not found. Install Node.js 20 LTS first."
  exit 1
fi

if [[ -z "$USER_HOME" || ! -d "$USER_HOME" ]]; then
  echo "Could not find the home folder for $APP_USER."
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl espeak-ng
  if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
    sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
  fi
fi

if [[ ! -d "$PROJECT_DIR/dist" ]]; then
  npm run build
fi

if [[ ! -d "$PROJECT_DIR/data/hmong-voice/Kong" ]]; then
  npm run speech:install-hmong || echo "Hmong voice download failed. The kiosk can still run; retry later."
fi

npm run speech:preload || echo "Speech preload could not finish. Read aloud will still use live fallback when available."

sudo tee /etc/systemd/system/listening-house.service >/dev/null <<SERVICE
[Unit]
Description=Listening House Guest Check-In System
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
EnvironmentFile=-$PROJECT_DIR/.env
ExecStart=$NPM_BIN start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable listening-house.service
sudo systemctl restart listening-house.service

chmod +x "$PROJECT_DIR/scripts/raspberry-pi/start-kiosk.sh"
chmod +x "$PROJECT_DIR/scripts/raspberry-pi/install-kiosk-launcher.sh"
"$PROJECT_DIR/scripts/raspberry-pi/install-kiosk-launcher.sh"

echo "Installed Listening House server service and desktop kiosk autostart."
echo "Server service: sudo systemctl status listening-house"
echo "Kiosk launcher: $USER_HOME/.config/autostart/listening-house-kiosk.desktop"
echo "Restart the Raspberry Pi to confirm the kiosk opens full screen."
