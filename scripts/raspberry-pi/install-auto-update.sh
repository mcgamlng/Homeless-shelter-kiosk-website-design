#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="${APP_USER:-${SUDO_USER:-}}"

if [[ -z "$APP_USER" || "$APP_USER" == "root" ]]; then
  APP_USER="$(stat -c "%U" "$PROJECT_DIR")"
fi

if [[ -z "$APP_USER" || "$APP_USER" == "root" ]]; then
  echo "Could not identify the Raspberry Pi desktop user for updates."
  echo "Run again with: sudo APP_USER=\$USER ./scripts/raspberry-pi/install-auto-update.sh"
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required for the automatic update timer."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required so the update can run as $APP_USER."
  exit 1
fi

chmod +x "$PROJECT_DIR/scripts/raspberry-pi/update-from-github.sh"

sudo tee /etc/systemd/system/listening-house-auto-update.service >/dev/null <<SERVICE
[Unit]
Description=Listening House automatic GitHub update
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$PROJECT_DIR
Environment=SKIP_APT=1
ExecStart=$(command -v sudo) -H -u $APP_USER $PROJECT_DIR/scripts/raspberry-pi/update-from-github.sh
SERVICE

sudo tee /etc/systemd/system/listening-house-auto-update.timer >/dev/null <<TIMER
[Unit]
Description=Run Listening House GitHub update every two weeks

[Timer]
OnBootSec=20min
OnUnitActiveSec=14d
Persistent=true
RandomizedDelaySec=30min
Unit=listening-house-auto-update.service

[Install]
WantedBy=timers.target
TIMER

sudo systemctl daemon-reload
sudo systemctl enable --now listening-house-auto-update.timer

echo "Installed Listening House automatic updater."
echo "It will run every two weeks after the last update, with a small random delay."
echo "Check it with: systemctl list-timers listening-house-auto-update.timer"
