# ClawSurf 🦀🏄

A dedicated Chromium-based browser for [OpenClaw](https://openclaw.ai) automation. ClawSurf runs as a separate browser profile with the **OpenClaw Browser Relay** extension pre-loaded, so your main browser stays untouched.

## Features

- **Isolated profile** — separate user data directory, won't interfere with your daily browser
- **OpenClaw Browser Relay extension** — auto-loaded on every page, maintains CDP (Chrome DevTools Protocol) connection for AI agent control
- **Always-on status indicator** — floating pill shows connection status (🟢 LISTENING / 🟡 CDP READY / 🔴 OFF)
- **Auto-attach** — relay re-attaches automatically on tab create, navigation, and page load
- **Title rewriting** — replaces "Chromium" with "ClawSurf" in window titles
- **Dock-friendly** — proper `StartupWMClass` and desktop entry so it shows as "ClawSurf" in your taskbar

## Requirements

- **Linux** with Chromium installed via snap (`/snap/bin/chromium`)
- [OpenClaw](https://openclaw.ai) gateway running locally (default port `18789`)

## Install

```bash
git clone https://github.com/Airpote/ClawSurf.git
cd ClawSurf
chmod +x install.sh
./install.sh
```

## Usage

```bash
# Open ClawSurf
ClawSurf

# Open a specific URL
ClawSurf https://example.com
```

The extension connects to:
- **CDP** on `127.0.0.1:18800` (Chromium remote debugging)
- **OpenClaw Gateway** on `127.0.0.1:18789`
- **Relay WebSocket** on `127.0.0.1:18792`

## Project Structure

```
ClawSurf/
├── extension/              # Chrome MV3 extension
│   ├── manifest.json       # Extension manifest
│   ├── background.js       # Service worker (relay, CDP forwarding)
│   ├── content-status.js   # In-page status pill + title rewriter
│   ├── options.html        # Settings page
│   ├── options.js          # Settings logic
│   └── icons/              # Extension icons
├── launcher/
│   ├── clawsurf.sh         # Main launcher script
│   ├── clawsurf-launch.sh  # Background launcher (for .desktop)
│   └── clawsurf.desktop    # Desktop entry template
├── install.sh              # Installer
└── README.md
```

## How It Works

1. `ClawSurf` launches Chromium with `--remote-debugging-port=18800` and a dedicated user profile
2. The **Browser Relay** extension loads automatically and connects to OpenClaw's relay WebSocket
3. OpenClaw's AI agent can now navigate, snapshot, click, and interact with any page through CDP commands forwarded via the extension
4. The status pill on every page shows the connection state in real-time

## Configuration

Open the extension options page (click extension icon → "Options") to configure:
- **Relay port** — default `18792`
- **Auto-attach** — enabled by default

## License

MIT
