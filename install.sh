#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

EXT_DEST="$HOME/snap/chromium/common/clawsurf-relay-extension"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"

echo "🦀 Installing ClawSurf..."

# 1. Extension
echo "  → Copying extension to $EXT_DEST"
mkdir -p "$EXT_DEST"
cp -r "$REPO_DIR/extension/"* "$EXT_DEST/"

# 2. Launcher scripts
echo "  → Installing launcher scripts to $BIN_DIR"
mkdir -p "$BIN_DIR"
cp "$REPO_DIR/launcher/clawsurf.sh" "$BIN_DIR/ClawSurf"
cp "$REPO_DIR/launcher/clawsurf-launch.sh" "$BIN_DIR/ClawSurf-launch"
chmod +x "$BIN_DIR/ClawSurf" "$BIN_DIR/ClawSurf-launch"

# 3. Desktop entry
echo "  → Installing desktop entry"
mkdir -p "$APP_DIR"
sed "s|\\\$HOME|$HOME|g" "$REPO_DIR/launcher/clawsurf.desktop" > "$APP_DIR/clawsurf.desktop"

# 4. Update desktop database (optional, may not be available)
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$APP_DIR" 2>/dev/null || true
fi

echo ""
echo "✅ ClawSurf installed!"
echo ""
echo "   Launch:  ClawSurf"
echo "   Or:      ClawSurf https://example.com"
echo ""
echo "   Make sure ~/.local/bin is in your PATH."
echo "   The OpenClaw Browser Relay extension will auto-load in ClawSurf."
