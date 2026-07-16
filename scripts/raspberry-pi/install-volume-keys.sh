#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
SKIP_APT="${SKIP_APT:-0}"

if [[ -z "$USER_HOME" || ! -d "$USER_HOME" ]]; then
  echo "Could not find the home folder for $APP_USER."
  exit 1
fi

if [[ "$SKIP_APT" != "1" ]] && command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y xbindkeys alsa-utils pulseaudio-utils || \
    sudo apt-get install -y xbindkeys alsa-utils
fi

chmod +x "$PROJECT_DIR/scripts/raspberry-pi/volume-control.sh"

CONFIG_DIR="$USER_HOME/.config/listening-house"
AUTOSTART_DIR="$USER_HOME/.config/autostart"
CONFIG_FILE="$CONFIG_DIR/volume-keys.xbindkeysrc"
DESKTOP_FILE="$AUTOSTART_DIR/listening-house-volume-keys.desktop"

mkdir -p "$CONFIG_DIR" "$AUTOSTART_DIR"

cat >"$CONFIG_FILE" <<KEYS
"$PROJECT_DIR/scripts/raspberry-pi/volume-control.sh up"
  XF86AudioRaiseVolume

"$PROJECT_DIR/scripts/raspberry-pi/volume-control.sh down"
  XF86AudioLowerVolume

"$PROJECT_DIR/scripts/raspberry-pi/volume-control.sh mute"
  XF86AudioMute
KEYS

cat >"$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Listening House Volume Keys
Comment=Enable keyboard volume controls for the Listening House kiosk
Exec=xbindkeys -f "$CONFIG_FILE"
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP

chown -R "$APP_USER:$APP_USER" "$CONFIG_DIR" "$AUTOSTART_DIR"

if command -v xbindkeys >/dev/null 2>&1 && [[ -n "${DISPLAY:-}" ]]; then
  pkill -u "$APP_USER" -f "xbindkeys.*$CONFIG_FILE" 2>/dev/null || true
  if [[ "$(id -un)" == "$APP_USER" ]]; then
    xbindkeys -f "$CONFIG_FILE" >/dev/null 2>&1 || true
  else
    sudo -H -u "$APP_USER" env DISPLAY="${DISPLAY:-:0}" \
      XAUTHORITY="${XAUTHORITY:-$USER_HOME/.Xauthority}" \
      xbindkeys -f "$CONFIG_FILE" >/dev/null 2>&1 || true
  fi
fi

"$PROJECT_DIR/scripts/raspberry-pi/volume-control.sh" loud || true

echo "Installed Listening House keyboard volume controls."
echo "Volume keys are bound to: $CONFIG_FILE"
