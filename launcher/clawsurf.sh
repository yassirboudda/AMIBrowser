#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="$HOME/snap/chromium/common/clawsurf-profile"
EXT_DIR="$HOME/snap/chromium/common/clawsurf-relay-extension"
URL="${1:-about:blank}"

mkdir -p "$PROFILE_DIR"

ARGS=(
  --user-data-dir="$PROFILE_DIR"
  --remote-debugging-port=18800
  --no-first-run
  --no-default-browser-check
  --class=ClawSurf
  # On GNOME/Ubuntu Dock under Wayland, Chromium often reports the generic
  # app id and gets grouped/labeled as "Chromium Web Browser". Prefer X11 so
  # `StartupWMClass=ClawSurf` in clawsurf.desktop is honored for name/icon.
  --ozone-platform=x11
)

if [[ "${CLAWSURF_USE_RELAY_EXTENSION:-1}" == "1" && -d "$EXT_DIR" ]]; then
  ARGS+=(
    --disable-extensions-except="$EXT_DIR"
    --load-extension="$EXT_DIR"
  )
fi

export BAMF_DESKTOP_FILE_HINT="$HOME/.local/share/applications/clawsurf.desktop"
export DESKTOP_FILE_NAME="clawsurf"

exec /snap/bin/chromium "${ARGS[@]}" "$URL"
