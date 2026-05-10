# AMI Browser — iOS Mobile App Specification

> **Target:** iOS 17+ (iPhone & iPad)
> **Architecture:** Remote browser session on server + native Swift UI shell
> **Backend:** `https://ami.exchange` (shared with desktop V3)
> **Last updated:** 2025-07-14
> **Document owner:** AMI Exchange Engineering

---

## 1. Vision

AMI Browser iOS is a **thin client** that connects to a headless browser session running on the AMI server. The user sees a live, interactive browser feed rendered remotely — like a cloud gaming service, but for web browsing. AI features (chat, page analysis, automation) are handled server-side through the same `ami.exchange` backend used by the desktop V3 app.

**Why remote rendering?**
- Apple's App Store policy requires all iOS browsers to use WebKit (no Chromium)
- WebKit doesn't support the extensions, DevTools protocol, or automation APIs AMI needs
- Remote rendering sidesteps WebKit limitations entirely
- Server has full Chromium with all AMI extensions pre-loaded
- User gets the same experience as desktop, on mobile

---

## 2. Architecture Overview

```
┌─────────────────────┐
│   iOS App (Swift)    │
│                      │
│  ┌────────────────┐  │      WebSocket / WebRTC
│  │  Browser View   │──────────────────────────┐
│  │  (live stream)  │  │                        │
│  └────────────────┘  │                        ▼
│  ┌────────────────┐  │      ┌──────────────────────────┐
│  │  AI Chat Panel  │──────→ │   ami.exchange Server     │
│  └────────────────┘  │      │                          │
│  ┌────────────────┐  │      │  ┌────────────────────┐  │
│  │  Nav Bar / URL  │  │      │  │ Headless Chromium   │  │
│  └────────────────┘  │      │  │ + AMI Extensions    │  │
│                      │      │  │ + OpenClaw agent    │  │
│  Touch → coordinates │      │  └────────────────────┘  │
│  Gestures → actions  │      │                          │
│                      │      │  ┌────────────────────┐  │
│                      │      │  │ AI Proxy (fallback) │  │
│                      │      │  └────────────────────┘  │
└─────────────────────┘      └──────────────────────────┘
```

---

## 3. Server-Side Components

### 3.1 Headless Browser Pool

Each active user session gets a headless Chromium instance managed by the server:

```
Session Manager
├── Pool of headless Chromium instances (puppeteer/playwright)
├── Max concurrent sessions per server (based on RAM: ~4 per 1GB)
├── Session timeout: 15 min idle → hibernate, 30 min → terminate
├── AMI Hub extension pre-loaded in each instance
└── OpenClaw agent available for automation tasks
```

**Technology options:**
- **Puppeteer** with `--headless=new` (same Chromium as desktop)
- **Playwright** (multi-browser support, better API)
- **noVNC / Xvfb** (full graphical rendering, heavier)
- **CDP streaming** (Chrome DevTools Protocol `Page.screencastFrame`)

**Recommended: CDP `Page.screencastFrame`** — lightest weight, native Chromium, frame-by-frame JPEG/PNG stream over WebSocket.

### 3.2 Session API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/session/create` | Premium | Start headless browser session |
| DELETE | `/api/session/:id` | Premium | End session |
| GET | `/api/session/:id/status` | Premium | Session health/state |
| WS | `/api/session/:id/stream` | Premium | WebSocket: screencast frames + input events |
| POST | `/api/session/:id/navigate` | Premium | Navigate to URL |
| POST | `/api/session/:id/input` | Premium | Send touch/keyboard events |
| POST | `/api/session/:id/resize` | Premium | Update viewport size |

### 3.3 OpenClaw Integration

OpenClaw (the AMI automation agent) runs alongside each headless session:
- User can ask AI to "fill this form", "find cheapest flight", "summarize this page"
- OpenClaw operates on the remote Chromium via CDP
- Results shown in real-time on the user's mobile screen
- Same agent capabilities as desktop V3

---

## 4. iOS App — Native UI

### 4.1 Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Swift 6 |
| UI | SwiftUI |
| Min iOS | 17.0 |
| Networking | URLSession + WebSocket (native) |
| Video decode | AVFoundation / Metal (for WebRTC) or raw JPEG frames |
| Auth | Clerk iOS SDK |
| Payments | StoreKit 2 (Apple IAP for subscription) |

### 4.2 Screen Layout

```
┌──────────────────────────────────┐
│ ◄  ►  🔄  🔒 ami.exchange/...   │  ← URL bar + nav buttons
├──────────────────────────────────┤
│                                  │
│                                  │
│       Remote Browser View        │  ← Live stream from server
│       (touch-interactive)        │
│                                  │
│                                  │
│                                  │
├──────────────────────────────────┤
│  🏠   🔍   🤖   📑   ⋯          │  ← Bottom tab bar
│ Home  Search  AI   Tabs  More    │
└──────────────────────────────────┘
```

### 4.3 Key UI Components

1. **Browser View** — Full-screen live stream, multitouch input forwarding
2. **URL Bar** — Native Swift text field, sends `navigate` command to server
3. **AI Chat** — Bottom sheet (slide up), same chat UI as desktop Hub
4. **Tab Switcher** — Grid of session thumbnails (each tab = server session or tab within session)
5. **Settings** — Account, subscription, theme, quality settings
6. **Onboarding** — Clerk sign-in → subscription upsell → first session

---

## 5. Input Handling

### 5.1 Touch → Mouse Translation

| iOS Gesture | Server Event |
|------------|-------------|
| Tap | `mousedown` + `mouseup` + `click` at coordinates |
| Long press | `mousedown` (hold) → context menu |
| Pan (scroll) | `wheel` events with delta |
| Pinch | Viewport zoom (client-side scale + server `Page.setDeviceMetricsOverride`) |
| Two-finger tap | Right-click |
| Swipe left/right | Browser back/forward |
| Text input | `Input.dispatchKeyEvent` per character via CDP |

### 5.2 Virtual Keyboard

- When user taps an input field (detected via `DOM.focus` CDP event), show native iOS keyboard
- Key events sent via WebSocket to server's CDP `Input.dispatchKeyEvent`
- Autocomplete/autofill handled server-side by Chromium's built-in

### 5.3 Latency Optimization

- Target: < 100ms touch-to-visual-update
- Use WebSocket for input (not REST)
- Server renders at 30fps (adjustable 15-60fps based on network)
- Frame quality: adaptive JPEG quality (30-80%) based on bandwidth
- Option: WebRTC for sub-50ms with hardware encoding

---

## 6. Subscription & Payments

### 6.1 Apple IAP (Required by App Store)

Apple requires in-app purchases for digital subscriptions. Must use StoreKit 2:

| Product ID | Price | Description |
|-----------|-------|-------------|
| `ami.premium.monthly` | $19.99/month (≈ 20€) | AMI Premium — unlimited AI + remote browsing |
| `ami.premium.yearly` | $199.99/year | AMI Premium Annual |

**Apple takes 30% cut** (15% for Small Business Program if < $1M revenue).

### 6.2 Discount Code

The `amidev` code (1 year free) works via the existing backend `/api/subscription/activate-code` endpoint. In the iOS app:
1. User enters code in Settings → Subscription → "Have a code?"
2. App calls `POST /api/subscription/activate-code` with auth header
3. Server grants premium, StoreKit not involved (no Apple cut)

### 6.3 Server-Side Validation

- App sends Clerk JWT with every API call
- Server checks `user.isPremium()` before creating browser sessions
- Apple receipt validation via `StoreKit 2` server-to-server notifications
- Sync Apple subscription status → MongoDB user record

---

## 7. Streaming Protocol

### 7.1 CDP Screencast (Recommended for MVP)

```javascript
// Server-side (Node.js + Puppeteer)
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 }); // iPhone 15

const client = await page.target().createCDPSession();
await client.send("Page.startScreencast", {
  format: "jpeg",
  quality: 60,
  maxWidth: 390,
  maxHeight: 844,
  everyNthFrame: 2, // 30fps effective
});

client.on("Page.screencastFrame", ({ data, sessionId, metadata }) => {
  // Send base64 JPEG frame over WebSocket to iOS app
  ws.send(JSON.stringify({ type: "frame", data, metadata }));
  client.send("Page.screencastFrameAck", { sessionId });
});
```

### 7.2 iOS Frame Display

```swift
// SwiftUI view for remote browser
struct BrowserStreamView: View {
    @StateObject private var session = BrowserSession()

    var body: some View {
        ZStack {
            if let frame = session.currentFrame {
                Image(uiImage: frame)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onEnded { value in
                                session.sendTap(at: value.location)
                            }
                    )
            } else {
                ProgressView("Connecting…")
            }
        }
        .onAppear { session.connect() }
    }
}
```

### 7.3 Future: WebRTC

For sub-50ms latency, upgrade to WebRTC:
- Server encodes with VP9/H264 (hardware if available)
- iOS decodes natively via AVFoundation
- Data channel for input events (replaces WebSocket)
- Requires `libwebrtc` integration or a service like LiveKit

---

## 8. Offline & Fallback

| Scenario | Behavior |
|----------|----------|
| No internet | Show cached pages (if implemented), or "No connection" screen |
| High latency (> 300ms) | Reduce frame rate, increase JPEG compression |
| Server full | "All sessions busy, please try again in a moment" |
| Session timeout | "Session expired" → auto-reconnect with same URL |

**Local fallback (future):** For basic browsing, fall back to WKWebView (WebKit) when server is unavailable. AI features disabled in local mode.

---

## 9. Security

| Concern | Mitigation |
|---------|-----------|
| User data in remote session | Sessions isolated per user, destroyed on disconnect |
| Credential entry (passwords) | Input streamed over TLS (WSS), never stored on server |
| Cookie/session theft | Each headless browser has its own profile directory, wiped on session end |
| Apple review | App functions as a "remote desktop" — precedent: Chrome Remote Desktop, Shadow, GeForce Now |
| Rate abuse | Max 2 concurrent sessions per user, 8 hour daily limit |

---

## 10. MVP Scope (Phase 1)

**Target: Get in App Store with core experience**

| Feature | Priority | Est. Effort |
|---------|----------|-------------|
| Clerk auth + sign-in flow | P0 | 2 days |
| StoreKit 2 subscription | P0 | 3 days |
| WebSocket session manager (server) | P0 | 4 days |
| CDP screencast streaming | P0 | 3 days |
| Touch → CDP input forwarding | P0 | 2 days |
| URL bar + navigation | P0 | 1 day |
| AI chat panel (calls `/api/ami/chat`) | P1 | 2 days |
| Tab management (multiple sessions) | P1 | 3 days |
| Basic settings (quality, account) | P1 | 1 day |
| App Store submission | P0 | 2 days |
| **Total MVP** | | **~23 days** |

### Phase 2 (Post-Launch)
- WebRTC upgrade for lower latency
- OpenClaw automation UI
- Offline WKWebView fallback
- iPad split-view support
- Bookmarks & history sync with desktop
- Widget (quick launch + AI shortcut)
- Share extension (share URL → open in AMI)
- Siri Shortcuts integration

---

## 11. Server Requirements

### Per-Session Resources
| Resource | Usage |
|----------|-------|
| RAM | ~150-250MB per headless Chromium session |
| CPU | 0.3-0.5 cores per active session |
| Bandwidth | ~1-3 Mbps per session (at 30fps, JPEG quality 60) |
| Disk | 50MB per session profile (temp) |

### Scaling Plan
| Users | Server Spec | Monthly Cost |
|-------|------------|-------------|
| 1-4 (MVP) | Current Vultr 1GB (137.220.61.167) | $6/mo |
| 5-20 | Vultr 4GB High Frequency | $24/mo |
| 20-100 | Vultr 8GB + separate session server | $48/mo |
| 100+ | Multiple session servers behind load balancer | Varies |

---

## 12. App Store Strategy

### Category
- **Primary:** Utilities → Web Browser
- **Alternate:** Productivity

### Positioning
> "AMI Browser — AI-powered browsing with zero configuration. Chat with any webpage, automate tasks, and browse with built-in ad blocking. Your AI runs in the cloud — no API keys needed."

### App Store Compliance
- Remote rendering is permitted (see: Chrome Remote Desktop, GeForce NOW, Xbox Cloud Gaming)
- Must **not** claim to be a "web browser" that renders locally (Apple's WebKit rule)
- Position as "AI-powered cloud browser" or "remote browsing assistant"
- In-app purchases via StoreKit only (no external payment links per Apple rules)

### Review Risks
| Risk | Mitigation |
|------|-----------|
| Rejected as "remote browser" | Frame as "AI browsing assistant" — primary value is AI, not browsing |
| WebView requirement | We don't use WKWebView for browsing — it's a streaming client |
| Content policy | Server-side content filtering, same as any cloud service |

---

## 13. Design System

Follow AMI Browser visual identity:
- **Primary color:** `#1a1a2e` (dark navy)
- **Accent:** `#e94560` (AMI red)
- **Secondary accent:** `#0f3460` (deep blue)
- **Background:** `#16213e` (dark mode default)
- **Font:** SF Pro (system), monospace for code/URLs

Matches the desktop Hub extension aesthetic. Dark mode default, light mode optional.

---

*This is the initial specification for AMI Browser iOS. Implementation begins after V3 desktop backend stabilization and MVP server infrastructure is proven.*

*Last updated by: AMI Exchange Engineering Team*
