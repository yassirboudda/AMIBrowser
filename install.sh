#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR"

EXT_RELAY_DEST="$HOME/snap/chromium/common/clawsurf-relay-extension"
EXT_TEACH_DEST="$HOME/snap/chromium/common/clawsurf-teachanagent"
EXT_DEVTOOLS_MCP_DEST="$HOME/snap/chromium/common/clawsurf-devtools-mcp"
MCP_SERVER_DIR="$HOME/.local/share/clawsurf/devtools-mcp-server"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"

echo "🦀 Installing ClawSurf..."

# 1. Browser Relay extension
echo "  → Copying Browser Relay extension to $EXT_RELAY_DEST"
mkdir -p "$EXT_RELAY_DEST"
cp -r "$REPO_DIR/extension/"* "$EXT_RELAY_DEST/"

# 2. TeachAnAgent extension
echo "  → Copying TeachAnAgent extension to $EXT_TEACH_DEST"
mkdir -p "$EXT_TEACH_DEST/icons"
cp -r "$REPO_DIR/teachanagent/"* "$EXT_TEACH_DEST/"

# 3. DevTools MCP Logger extension
echo "  → Copying DevTools MCP Logger extension to $EXT_DEVTOOLS_MCP_DEST"
mkdir -p "$EXT_DEVTOOLS_MCP_DEST"
cp -r "$REPO_DIR/devtools-mcp/"* "$EXT_DEVTOOLS_MCP_DEST/"

# 4. MCP Server (for VS Code / GitHub Copilot integration)
echo "  → Installing DevTools MCP Server to $MCP_SERVER_DIR"
mkdir -p "$MCP_SERVER_DIR"
cp "$REPO_DIR/devtools-mcp-server/server.js" "$MCP_SERVER_DIR/"
cp "$REPO_DIR/devtools-mcp-server/package.json" "$MCP_SERVER_DIR/"
cp "$REPO_DIR/devtools-mcp-server/package-lock.json" "$MCP_SERVER_DIR/"
(cd "$MCP_SERVER_DIR" && npm install --omit=dev 2>/dev/null) || echo "  ⚠ npm install failed — run 'cd $MCP_SERVER_DIR && npm install' manually"

# 5. Configure VS Code MCP (if not already set)
VSCODE_MCP="$HOME/.config/Code/User/mcp.json"
if [[ ! -f "$VSCODE_MCP" ]]; then
  echo "  → Configuring VS Code MCP server"
  mkdir -p "$(dirname "$VSCODE_MCP")"
  cat > "$VSCODE_MCP" <<MCPEOF
{
  "servers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "node",
      "args": ["$MCP_SERVER_DIR/server.js"],
      "env": {
        "MCP_HTTP_PORT": "9223"
      }
    }
  }
}
MCPEOF
else
  echo "  ℹ VS Code MCP config already exists at $VSCODE_MCP — skipping"
  echo "    Add chrome-devtools server manually if needed (see README)"
fi

# 6. Launcher scripts
echo "  → Installing launcher scripts to $BIN_DIR"
mkdir -p "$BIN_DIR"
cp "$REPO_DIR/launcher/clawsurf.sh" "$BIN_DIR/ClawSurf"
cp "$REPO_DIR/launcher/clawsurf-launch.sh" "$BIN_DIR/ClawSurf-launch"
chmod +x "$BIN_DIR/ClawSurf" "$BIN_DIR/ClawSurf-launch"

# 7. Desktop entry
echo "  → Installing desktop entry"
mkdir -p "$APP_DIR"
sed "s|\\\$HOME|$HOME|g" "$REPO_DIR/launcher/clawsurf.desktop" > "$APP_DIR/clawsurf.desktop"

# 8. Update desktop database (optional)
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
echo "   Extensions auto-loaded: Browser Relay, TeachAnAgent, DevTools MCP Logger"
echo ""
echo "   DevTools MCP Logger:"
echo "     • Click the extension icon in ClawSurf → 'Activate' to start capturing"
echo "     • Data flows to VS Code via MCP (GitHub Copilot can query it)"
echo "     • Deactivate or close the tab → session data is auto-cleared"
