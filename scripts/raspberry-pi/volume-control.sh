#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
STEP="${VOLUME_STEP:-5%}"
LOUD_LEVEL="${KIOSK_VOLUME_PERCENT:-90%}"

run_wpctl() {
  command -v wpctl >/dev/null 2>&1 || return 1
  case "$ACTION" in
    up)
      wpctl set-mute @DEFAULT_AUDIO_SINK@ 0
      wpctl set-volume -l 1.0 @DEFAULT_AUDIO_SINK@ "$STEP+"
      ;;
    down)
      wpctl set-volume @DEFAULT_AUDIO_SINK@ "$STEP-"
      ;;
    mute)
      wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle
      ;;
    loud)
      wpctl set-mute @DEFAULT_AUDIO_SINK@ 0
      wpctl set-volume -l 1.0 @DEFAULT_AUDIO_SINK@ "$LOUD_LEVEL"
      ;;
    status)
      wpctl get-volume @DEFAULT_AUDIO_SINK@
      ;;
    *)
      return 1
      ;;
  esac
}

run_pactl() {
  command -v pactl >/dev/null 2>&1 || return 1
  case "$ACTION" in
    up)
      pactl set-sink-mute @DEFAULT_SINK@ 0
      pactl set-sink-volume @DEFAULT_SINK@ "+$STEP"
      ;;
    down)
      pactl set-sink-volume @DEFAULT_SINK@ "-$STEP"
      ;;
    mute)
      pactl set-sink-mute @DEFAULT_SINK@ toggle
      ;;
    loud)
      pactl set-sink-mute @DEFAULT_SINK@ 0
      pactl set-sink-volume @DEFAULT_SINK@ "$LOUD_LEVEL"
      ;;
    status)
      pactl get-sink-volume @DEFAULT_SINK@
      ;;
    *)
      return 1
      ;;
  esac
}

run_amixer() {
  command -v amixer >/dev/null 2>&1 || return 1
  local control
  for control in Master Speaker PCM; do
    if ! amixer sget "$control" >/dev/null 2>&1; then
      continue
    fi
    case "$ACTION" in
      up)
        amixer -q sset "$control" "$STEP+" unmute
        ;;
      down)
        amixer -q sset "$control" "$STEP-"
        ;;
      mute)
        amixer -q sset "$control" toggle
        ;;
      loud)
        amixer -q sset "$control" "$LOUD_LEVEL" unmute
        ;;
      status)
        amixer sget "$control"
        ;;
      *)
        return 1
        ;;
    esac
    return 0
  done
  return 1
}

if run_wpctl || run_pactl || run_amixer; then
  exit 0
fi

echo "No supported Raspberry Pi audio volume tool was found."
echo "Install one of: wireplumber, pulseaudio-utils, or alsa-utils."
exit 1
