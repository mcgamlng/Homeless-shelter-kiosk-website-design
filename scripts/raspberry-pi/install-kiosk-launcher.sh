#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
DESKTOP_DIR="$USER_HOME/Desktop"
AUTOSTART_DIR="$USER_HOME/.config/autostart"

if [[ -z "$USER_HOME" || ! -d "$USER_HOME" ]]; then
  echo "Could not find the home folder for $APP_USER."
  exit 1
fi

mkdir -p "$DESKTOP_DIR" "$AUTOSTART_DIR"

cat > "$DESKTOP_DIR/Listening House Kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Open Listening House Kiosk
Comment=Open the shelter check-in kiosk full screen
Exec=$PROJECT_DIR/scripts/raspberry-pi/start-kiosk.sh
Icon=$PROJECT_DIR/public/icons/lh-icon-192.png
Terminal=false
Categories=Utility;
DESKTOP

cat > "$AUTOSTART_DIR/listening-house-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Listening House Kiosk
Comment=Open the shelter check-in kiosk full screen
Exec=$PROJECT_DIR/scripts/raspberry-pi/start-kiosk.sh
X-GNOME-Autostart-enabled=true
DESKTOP

chmod +x "$PROJECT_DIR/scripts/raspberry-pi/start-kiosk.sh"
chmod +x "$DESKTOP_DIR/Listening House Kiosk.desktop"
chown -R "$APP_USER:$APP_USER" "$DESKTOP_DIR/Listening House Kiosk.desktop" "$AUTOSTART_DIR"

echo "Installed desktop and startup kiosk launchers for $APP_USER."
