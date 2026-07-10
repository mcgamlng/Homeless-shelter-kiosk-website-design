#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
DESKTOP_DIR="$USER_HOME/Desktop"
AUTOSTART_DIR="$USER_HOME/.config/autostart"
LOCAL_BIN_DIR="$USER_HOME/.local/bin"
LAUNCHER_SCRIPT="$LOCAL_BIN_DIR/open-listening-house-kiosk"

if [[ -z "$USER_HOME" || ! -d "$USER_HOME" ]]; then
  echo "Could not find the home folder for $APP_USER."
  exit 1
fi

mkdir -p "$DESKTOP_DIR" "$AUTOSTART_DIR" "$LOCAL_BIN_DIR"

cat > "$LAUNCHER_SCRIPT" <<LAUNCHER
#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$PROJECT_DIR"
KIOSK_URL="\${KIOSK_URL:-http://127.0.0.1:3000/kiosk}"

cd "\$PROJECT_DIR"

if ! curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
  sudo -n systemctl start listening-house.service >/dev/null 2>&1 || true
fi

exec "\$PROJECT_DIR/scripts/raspberry-pi/start-kiosk.sh"
LAUNCHER

cat > "$DESKTOP_DIR/Listening House Kiosk.desktop" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Open Listening House Kiosk
Comment=Open the shelter check-in kiosk full screen
Exec=$LAUNCHER_SCRIPT
Icon=$PROJECT_DIR/public/icons/lh-icon-192.png
Terminal=false
StartupNotify=false
Categories=Utility;
DESKTOP

cat > "$AUTOSTART_DIR/listening-house-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Listening House Kiosk
Comment=Open the shelter check-in kiosk full screen
Exec=$LAUNCHER_SCRIPT
X-GNOME-Autostart-enabled=true
StartupNotify=false
DESKTOP

chmod +x "$PROJECT_DIR/scripts/raspberry-pi/start-kiosk.sh"
chmod +x "$LAUNCHER_SCRIPT"
chmod +x "$DESKTOP_DIR/Listening House Kiosk.desktop"
chmod +x "$AUTOSTART_DIR/listening-house-kiosk.desktop"
chown "$APP_USER:$APP_USER" "$LAUNCHER_SCRIPT"
chown -R "$APP_USER:$APP_USER" "$DESKTOP_DIR/Listening House Kiosk.desktop" "$AUTOSTART_DIR"

if command -v gio >/dev/null 2>&1; then
  sudo -u "$APP_USER" gio set "$DESKTOP_DIR/Listening House Kiosk.desktop" metadata::trusted true >/dev/null 2>&1 || true
fi

echo "Installed desktop and startup kiosk launchers for $APP_USER."
