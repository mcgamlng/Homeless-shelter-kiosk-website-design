#!/usr/bin/env bash
set -euo pipefail

sudo systemctl disable --now listening-house.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/listening-house.service
sudo systemctl daemon-reload
rm -f "$HOME/.config/autostart/listening-house-kiosk.desktop"

echo "Removed Listening House Raspberry Pi autostart files."
