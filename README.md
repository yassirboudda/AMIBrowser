
# AMI Browser for Linux

A next-generation Chromium-based browser for automation, AI, and Web3 — now fully rebranded as **AMI Browser** (formerly ClawSurf) and packed with 200+ integrations, built-in OpenClaw agent, and advanced privacy tools.

---

## 🚀 What is AMI Browser?

**AMI Browser** is a privacy-first, automation-ready browser for Linux, designed for power users, developers, and crypto/web3 enthusiasts. It combines a hardened Chromium core with:
- **Built-in OpenClaw agent** for browser automation, scripting, and AI workflows
- **247+ integrations**: Web3 wallets, DeFi, Discord, Telegram, X, Notion, GitHub, and more
- **Advanced privacy/adblock**: AMI Adblocker, tracker blocking, anti-fingerprinting
- **Action recording**: TeachAnAgent extension to record and replay browser actions as JSON
- **DevTools MCP Logger**: Full browser debugging, error capture, and VS Code Copilot integration
- **Rewards & wallet**: AMI Rewards, built-in wallet, and crypto tools
- **Linux-native**: Fast, secure, and open source

---

## ✨ Key Features

- **OpenClaw Agent**: Automate browsing, fill forms, extract data, run scripts, and connect to AI models
- **247+ Integrations**: Connect Discord, Telegram, X, Notion, GitHub, DeFi, and more
- **Web3 Ready**: Built-in wallet, dApp support, and crypto tools
- **Privacy by Default**: Adblock, tracker blocking, anti-fingerprinting, isolated profiles
- **Action Recorder**: Record, export, and replay browser actions (TeachAnAgent)
- **DevTools MCP Logger**: Debug, capture errors, and stream browser events to VS Code Copilot
- **Rewards**: Earn AMI rewards for browsing and using integrations
- **Linux Desktop Integration**: Native launcher, desktop entry, and isolated user data

---

## 🛠️ Install

1. Download the latest Linux release: [Releases](https://github.com/yassirboudda/AMIBrowser/releases)
2. Extract the tarball and run `./install.sh`
3. Launch with `AMI-Browser` or from your desktop menu

---

## 📦 Project Structure

```
AMI-Browser/
├── ami-adblocker/      # Advanced ad/tracker blocker extension
├── ami-wallet/         # Web3 wallet extension
├── ami-rewards/        # Rewards and incentives
├── ami-webstore/       # Extension store UI
├── clawsurf-hub/       # Main browser hub UI (now AMI Hub)
├── devtools-mcp/       # DevTools MCP Logger extension
├── devtools-mcp-server/# MCP server for VS Code Copilot
├── teachanagent/       # Action recorder extension
├── launcher/           # Linux launcher scripts and desktop entry
├── install.sh          # Installer script
└── README.md
```

---

## 🤖 Built-in Integrations (Sample)
- Discord, Telegram, X (Twitter), Notion, GitHub, Vercel, AWS, Stripe, PayPal, DeFi, Web3 wallets, and 200+ more
- See the AMI Hub for the full integrations catalog

---

## 🧠 Built-in OpenClaw Agent
- Automate any site: fill forms, extract data, run scripts, schedule tasks
- Chat with the agent, create automations, and connect to AI models (OpenAI, Anthropic, Gemini, etc.)
- Record and replay actions with TeachAnAgent

---

## 🛡️ Privacy & Security
- Ad/tracker blocking, anti-fingerprinting, isolated profiles
- No telemetry, no tracking, open source

---

## 💬 Community & Support
- [Discord](https://discord.ami.finance/)
- [Telegram](https://t.me/amichain)
- [X (Twitter)](https://x.com/amibrowser)

---

## 📝 License
MIT

---

**AMI Browser** — The all-in-one browser for automation, privacy, and Web3.

## DevTools MCP Logger — Browser Debugging for AI

The DevTools MCP Logger captures real-time browser activity and makes it available to GitHub Copilot (or any MCP client) as queryable context.

### Architecture

```
┌─────────────────┐     HTTP (localhost:9223)    ┌──────────────────┐     stdio     ┌───────────────┐
│  ClawSurf        │ ──────────────────────────▶  │  MCP Server      │ ◀──────────▶  │  VS Code /    │
│  Extension       │   POST /events               │  (Node.js)       │   MCP proto   │  GitHub Copilot│
│  (debugger API)  │   POST /meta                 │  In-memory store │               │               │
│                  │   DELETE on page close        │                  │               │               │
└─────────────────┘                               └──────────────────┘               └───────────────┘
```

### What It Captures
- **Network requests** — URLs, methods, status codes, headers, timing
- **Console output** — log, warn, error, info with stack traces
- **JavaScript errors & exceptions**
- **DOM mutations** — node insertions, removals, attribute changes
- **Performance metrics** — page load, DOMContentLoaded, etc.
- **Script sources** parsed by the browser

### MCP Tools (for GitHub Copilot)
- `get_active_sessions` — List all monitored tabs
- `get_all_logs` — Get all captured data
- `get_session_logs` — Get logs for specific tab with category filter
- `get_errors` — Get only errors/exceptions
- `get_network_requests` — Get network activity
- `get_console_output` — Get console messages
- `clear_session` / `clear_all_sessions` — Manual cleanup

### Usage
1. Navigate to any page in ClawSurf
2. Click the DevTools MCP Logger icon → **Activate**
3. Interact with the page — all activity is captured
4. In VS Code, open GitHub Copilot Chat and add context from the `chrome-devtools` MCP
5. Ask Copilot about errors, network issues, or page behavior
6. **Deactivate** or close the tab → session data is automatically cleared (no log pollution)

### VS Code MCP Configuration

The installer auto-configures `~/.config/Code/User/mcp.json`. Manual setup:

```json
{
  "servers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "node",
      "args": ["~/.local/share/clawsurf/devtools-mcp-server/server.js"],
      "env": { "MCP_HTTP_PORT": "9223" }
    }
  }
}
```

## TeachAnAgent — Browser Action Recorder

TeachAnAgent records your browser interactions so you can teach an AI agent by example.

### Captured Events
- **Clicks** — element tag, text, CSS selector, coordinates
- **Inputs** — typed values (passwords auto-masked), change events
- **Form submits** — form action and method
- **Scroll** — position snapshots (throttled to 500ms)
- **Keyboard shortcuts** — modifier combos + Enter/Tab/Escape
- **Navigation** — URL changes, SPA pushState/replaceState, hash changes
- **Page lifecycle** — load, unload, beforeunload

### Usage
1. Click the TeachAnAgent extension icon in the toolbar
2. Press **⏺ Record** to start capturing
3. Interact with the page normally
4. Use **⏸ Pause** / **▶ Resume** as needed
5. Press **⏹ Stop** to end the session
6. Click **⬇ Export JSON** to download the recorded events

Starting a new recording clears the previous session. A visual indicator (🔴 / ⏸️) appears at the top of the page during recording.

## How It Works

1. `ClawSurf` launches Chromium with `--remote-debugging-port=18800` and a dedicated user profile
2. All three extensions load automatically:
   - **Browser Relay** connects to OpenClaw's relay WebSocket
   - **TeachAnAgent** stands by for recording
   - **DevTools MCP Logger** waits for activation per tab
3. OpenClaw's AI agent can navigate, snapshot, click, and interact with any page through CDP commands forwarded via the relay
4. The status pill on every page shows the relay connection state in real-time
5. When DevTools MCP Logger is activated, all browser events flow to VS Code / GitHub Copilot as MCP resources

## Configuration

Open the Browser Relay extension options page (click extension icon → "Options") to configure:
- **Relay port** — default `18792`
- **Auto-attach** — enabled by default

## License

MIT
