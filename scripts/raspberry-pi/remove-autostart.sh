#!/usr/bin/env bash
set -euo pipefail

APP_USER="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"

sudo systemctl disable --now listening-house.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/listening-house.service
sudo systemctl daemon-reload
if [[ -n "$USER_HOME" ]]; then
  rm -f "$USER_HOME/.config/autostart/listening-house-kiosk.desktop"
fi

echo "Removed Listening House Raspberry Pi autostart files."
