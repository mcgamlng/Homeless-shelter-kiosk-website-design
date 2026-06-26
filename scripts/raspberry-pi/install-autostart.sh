#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="${SUDO_USER:-$USER}"
NPM_BIN="$(command -v npm)"

if [[ -z "$NPM_BIN" ]]; then
  echo "npm was not found. Install Node.js 20 LTS first."
  exit 1
fi

sudo tee /etc/systemd/system/listening-house.service >/dev/null <<SERVICE
[Unit]
Description=Listening House Bracelet Kiosk System
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
ExecStart=$NPM_BIN start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable listening-house.service
sudo systemctl restart listening-house.service

mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/listening-house-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Listening House Kiosk
Comment=Open the shelter check-in kiosk full screen
Exec=$PROJECT_DIR/scripts/raspberry-pi/start-kiosk.sh
X-GNOME-Autostart-enabled=true
DESKTOP

chmod +x "$PROJECT_DIR/scripts/raspberry-pi/start-kiosk.sh"

echo "Installed Listening House server service and desktop kiosk autostart."
echo "Restart the Raspberry Pi to confirm the kiosk opens full screen."
