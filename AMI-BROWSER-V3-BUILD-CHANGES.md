# AMI Browser v3.0 — Binary-Level Feature Build Plan

> **Target Base:** Chromium 146.0.7680.80 (same base, new patches on top of V2)
> **Goal:** Match & exceed Strawberry Browser + Arc Browser + Edge + Brave features at the binary level
> **Last updated:** 2026-04-09
> **Document owner:** AMI Exchange Engineering
> **Predecessor:** AMI-BROWSER-V2-BUILD-CHANGES.md (bug fixes, branding, core patching)

---

## Why V3?

V2 focused on branding (remove "Chromium"), bundling extensions, fixing critical bugs, and establishing the foundation. Most V2 features are extension-level — they don't touch Chromium's C++ source, UI framework, or rendering pipeline.

**V3 is the binary build.** Every feature in this document requires modifying Chromium's C++ source code, GN build system, or native UI layer. Extension-level features (AI chat, integrations, skills library) are already handled by the Hub extension and don't need a rebuild.

After V3, AMI Browser will have:
- Every UI feature Arc Browser is loved for (Split View, Spaces, Sidebar Tabs)
- Every AI feature Strawberry Browser charges $250/month for (Companion sidebar, Smart History, Approval dialogs, Parallel automations with Mission Control live view)
- Every productivity feature Edge is praised for (Vertical Tabs, Web Capture, Reader Mode, Collections)
- Every privacy feature Brave is known for (Network-level ad blocking, fingerprinting protection, zero telemetry)
- And things NO other browser has: Built-in Rewards & Wallet, 50+ AI providers with BYO keys, Linux-first, open source, free forever

---

## Table of Contents

1. [V2 Critical Bugs — Must Fix First](#1-v2-critical-bugs--must-fix-first)
2. [Split View — Side-by-Side Browsing](#2-split-view--side-by-side-browsing)
3. [Spaces & Profiles — Context Switching](#3-spaces--profiles--context-switching)
4. [Native AI Sidebar — Chat-First Design](#4-native-ai-sidebar--chat-first-design)
5. [Chat-First New Tab Page (WebUI)](#5-chat-first-new-tab-page-webui)
6. [Vertical Tabs with Tree View](#6-vertical-tabs-with-tree-view)
7. [Smart History — Semantic Search](#7-smart-history--semantic-search)
8. [5-Second Link Previews](#8-5-second-link-previews)
9. [Tidy Tab Titles & Tidy Downloads](#9-tidy-tab-titles--tidy-downloads)
10. [Native AMI Shield Toolbar Button](#10-native-ami-shield-toolbar-button)
11. [AMI Rewards Toolbar Button](#11-ami-rewards-toolbar-button)
12. [Web Capture / Screenshot Tool](#12-web-capture--screenshot-tool)
13. [Smart Reader Mode with AI](#13-smart-reader-mode-with-ai)
14. [Tab Indicators & Working Badges](#14-tab-indicators--working-badges)
15. [Network-Level Ad Blocking](#15-network-level-ad-blocking)
16. [Connected Apps / OAuth System](#16-connected-apps--oauth-system)
17. [Approval System — Native UI](#17-approval-system--native-ui)
18. [Parallel Browser Automations & Mission Control](#18-parallel-browser-automations--mission-control)
19. [Session Replay & Activity Audit](#19-session-replay--activity-audit)
20. [Embedded Core Extensions — Non-Removable](#20-embedded-core-extensions--non-removable)
21. [Default Settings & Privacy Hardening](#21-default-settings--privacy-hardening)
22. [AMI Visual Identity — UI/UX Hardcoded Overhaul](#22-ami-visual-identity--uiux-hardcoded-overhaul)
23. [Custom Omnibox Commands & Actions](#23-custom-omnibox-commands--actions)
24. [Packaging & Distribution](#24-packaging--distribution)
25. [Competitive Feature Matrix](#25-competitive-feature-matrix)
26. [Build Priority & Effort Estimates](#26-build-priority--effort-estimates)
27. [Smart Tab Switcher — Visual Carousel](#27-smart-tab-switcher--visual-carousel)
28. [Zen-Style Compact Browsing — Multi-Row Tabs & Glance](#28-zen-style-compact-browsing--multi-row-tabs--glance)
29. [V3 AI Architecture — Server-Side Proxy (No BYO Keys)](#29-v3-ai-architecture--server-side-proxy-no-byo-keys)
30. [Replace Native Chromium "Ask AI" / Side Panel Button with AMI Chat](#30-replace-native-chromium-ask-ai--side-panel-button-with-ami-chat)
31. [Opera-Style Chromium WebUI Takeover — Full Internal Page Redesign](#31-opera-style-chromium-webui-takeover--full-internal-page-redesign)

---

## 1. V2 Critical Bugs — Must Fix First

These are P0 items from V2 that MUST be resolved before any V3 feature work. They all require C++ source changes.

| # | Bug | Root Cause | Fix | Files |
|---|-----|-----------|-----|-------|
| 1 | Right-click context menu broken | Blanket `sed` corrupts `.grd` attribute names | Python XML parser for `.grd`/`.grdp` — only patch `<message>` text content | All `.grd`/`.grdp` in `chrome/`, `components/`, `ui/` |
| 2 | Copy/Paste (Ctrl+C) broken | Same `.grd` corruption | Same fix as #1 | Same |
| 3 | User-Agent triggers Google captcha | UA token replaced with "AMIBrowser" | Keep `Chrome/146` in UA, only brand `application_name`/`GetProduct()` | `content/common/user_agent.cc`, `components/embedder_support/user_agent_utils.cc` |
| 4 | Window title shows "Chromium" | Incomplete string replacement | Fix `GetWindowTitleForCurrentTab()` + proper `.grd` patching | `chrome/browser/ui/browser.cc` |
| 5 | NTP white flash before extension loads | NTP is extension-based, not native WebUI | Build NTP as WebUI at `chrome://newtab/` (see §5) | `chrome/browser/ui/webui/new_tab_page/` |
| 6 | "Developer mode extensions" warning | Extensions loaded via `--load-extension` | Bundle as component extensions (see §20) | `chrome/browser/extensions/component_loader.cc` |
| 7 | "Google API keys missing" infobar | No API keys shipped | Set GN args `google_api_key = ""` + remove infobar delegate | `chrome/browser/ui/startup/google_api_keys_infobar_delegate.cc` |
| 8 | GCM registration errors | Google Cloud Messaging tries to register | Disable at compile: `enable_gcm_driver = false` | `components/gcm_driver/`, GN config |
| 9 | 887 residual "Chromium" strings in binary | Third-party + internal references | Selectively patch user-visible ones, skip `third_party/`, `v8/`, `WebRTC/` | Multiple (see V2 doc §1.3) |

**Estimated total:** 4-6 hours. These are all understood and documented in V2 — just need to be executed cleanly.

---

## 2. Split View — Side-by-Side Browsing

> **Inspired by:** Arc Browser's Split View — the single most loved feature in internet discussions about Arc.

### What it is
Two web pages displayed side-by-side within a **single tab slot**. The user drags a tab onto another tab and they merge into a split view. A draggable divider lets the user resize the split.

### Why it requires a binary change
Chromium's tab model is 1 tab = 1 WebContents = 1 renderer. Split view requires a tab to host **two WebContents** with a native divider between them.

### Implementation Plan
```
chrome/browser/ui/views/frame/
├── split_view_controller.h / .cc         — manages split state per tab
├── split_view_divider.h / .cc            — draggable resize divider view
```

**Key C++ changes:**
1. **Tab model extension** — `TabStripModel` already supports tab groups. Extend to support a `SplitViewPair` struct:
   ```cpp
   struct SplitViewPair {
     content::WebContents* left;
     content::WebContents* right;
     float divider_position;  // 0.0-1.0, default 0.5
   };
   ```
2. **BrowserView modification** — When a tab has a SplitViewPair, the `ContentsContainer` renders two `WebView` widgets side by side with a `SplitViewDivider` (a thin draggable `views::View`) between them.
3. **Tab strip UI** — Split tabs show a "⊞" icon overlay on the tab favicon area. Clicking it unsplits.
4. **Activation gestures:**
   - Drag tab A onto tab B while holding `Ctrl` → split
   - Right-click tab → "Split with..." → pick another tab
   - Keyboard: `Ctrl+Shift+\` to split current tab with the one to the right
   - Command palette: type "split" in omnibox
5. **URL bar behavior** — Show the URL of the focused side. A small dot indicates which side is active. Clicking the other side switches focus.
6. **Navigation** — Each side navigates independently. Back/forward applies to the focused side only.

**Files to modify:**
- `chrome/browser/ui/views/frame/browser_view.cc` — add split container logic
- `chrome/browser/ui/tabs/tab_strip_model.cc` — add SplitViewPair tracking
- `chrome/browser/ui/views/tabs/tab.cc` — add split indicator overlay
- `chrome/browser/ui/views/frame/contents_layout_manager.cc` — dual WebView layout
- `chrome/browser/ui/browser_navigator.cc` — handle navigation in split context

**Edge cases:**
- DevTools opens for the focused side only
- Printing prints the focused side
- Find-in-page applies to the focused side
- Full-screen mode exits split view and full-screens the focused side
- Split tabs persist across browser restart (save in session data)

**Effort:** 12-16 hours

---

## 3. Spaces & Profiles — Context Switching

> **Inspired by:** Arc Browser's Spaces — separate browsing contexts for work, personal, projects, hobbies.

### What it is
A **Space** is a named browsing context with its own set of tabs, pinned sites, bookmarks, and visual theme. The user can switch between spaces with a keyboard shortcut or a sidebar selector. Each space keeps its tabs isolated — switching spaces hides the current tabs and shows the other space's tabs.

### Why it requires a binary change
Chrome has "profiles" but they open separate windows. Spaces are **in-window** context switches — same window, different tab sets. This requires modifying the tab strip model to support multiple "tab collections" per window and switching between them.

### Implementation Plan

1. **Space model:**
   ```cpp
   struct Space {
     std::string name;           // "Work", "Personal", "Projects"
     std::string icon;           // emoji or icon name
     SkColor color;              // space accent color
     std::vector<TabInfo> tabs;  // tabs belonging to this space
     std::vector<PinnedSite> pins;
   };
   ```

2. **Space strip UI** — A horizontal strip above the tab bar (or as a vertical sidebar element) showing space icons. Click to switch. Current space is highlighted with its accent color.

3. **Space switching:**
   - Click space icon → hides current tabs, shows target space's tabs
   - Keyboard: `Ctrl+1-9` already taken (tabs), so use `Alt+1-9` for spaces
   - Or `Ctrl+Space` to open a space picker dropdown

4. **Default spaces:** Ship with "Personal" and "Work" pre-created. User can add up to 10.

5. **Space-specific settings:**
   - Each space can have a different default search engine
   - Each space can have different extensions enabled/disabled
   - Each space can have different AI agent settings (custom system prompt, preferred provider, etc.)

6. **Visual differentiation:**
   - Tab bar background tint changes per space
   - Sidebar accent color changes
   - Space name shown in window title: "AMI Browser — Work"

**Files to modify:**
- `chrome/browser/ui/tabs/tab_strip_model.cc` — multi-collection tab management
- `chrome/browser/ui/views/frame/browser_view.cc` — space strip UI
- `chrome/browser/ui/views/tabs/tab_strip.cc` — per-space tab rendering
- `chrome/browser/sessions/session_service.cc` — persist spaces across restarts
- New files: `chrome/browser/ui/views/spaces/space_strip_view.h/.cc`, `chrome/browser/spaces/space_model.h/.cc`

**Effort:** 16-24 hours

---

## 4. Native AI Sidebar — Chat-First Design

> **Inspired by:** Strawberry Browser's embedded sidebar companion + Edge's Copilot sidebar + Brave's Leo sidebar.
> **Why AMI's is better:** 50+ AI providers with BYO keys (not locked to one vendor), local model support (Ollama, LM Studio), agent capabilities with browser automation, approval system, built-in rewards & wallet.

### What it is
A native side panel (like Chromium's existing side panel infrastructure) that serves as the primary AI chat interface. One click opens it. It persists across tab switches.

### Design — Two Modes

**Mode 1: Chat-Only (default)**
```
┌──────────────────────────┐
│ AMI Agent ▾  [⚙] [×]    │  ← Agent selector + settings + close
│──────────────────────────│
│                          │
│  Agent: What can I help  │
│  you with?               │
│                          │
│  User: Find me the top   │
│  5 trending repos on...  │
│                          │
│  Agent: 🔄 Thinking...   │
│  > Opening github.com    │
│  > Extracting trending   │
│  > [screenshot preview]  │
│                          │
│──────────────────────────│
│ [📎] Type a message... [🧠]│  ← Attachment + input + thinking toggle
│ [Chat] [Hub] [History]   │  ← Bottom nav
└──────────────────────────┘
```

**Mode 2: Full Hub (click Hub nav icon)**
- Opens the full Hub dashboard in the sidebar (connections, skills, automations, stats)
- Can switch back to Chat with one click

### Why Binary-Level
- Chromium's `SidePanelRegistry` manages built-in side panels (Reading List, Bookmarks, History)
- Registering "AMI Chat" as a built-in panel = instant availability, no extension needed
- Side panel WebUI loads instantly (no extension load delay)
- Can communicate with the browser process directly (for Smart History, tab control, etc.)

### Implementation

1. **Register AMI Chat as a SidePanel entry:**
   ```cpp
   // chrome/browser/ui/views/side_panel/ami_chat_side_panel.h
   class AMIChatSidePanel : public SidePanelEntryScope {
     // Registers WebUI at chrome-untrusted://ami-chat/
   };
   ```

2. **WebUI content:** Svelte or vanilla TypeScript app served from `chrome-untrusted://ami-chat/`
   - Chat history
   - Agent avatar + name
   - Message input with "Thinking" toggle (🧠 icon)
   - Attachment button (📎) for files, screenshots
   - Bottom navigation: Chat | Hub | History | Settings

3. **Toolbar button:** AMI logo icon next to the address bar. Single click toggles sidebar.
   - Keyboard shortcut: `Ctrl+Shift+A`

4. **Cross-tab persistence:** Sidebar stays open when switching tabs. Chat context is global (not per-tab).

5. **Agent communication:** WebUI communicates with the OpenClaw gateway via local HTTP/WebSocket (same as current hub, but now as native WebUI).

**Files to modify:**
- New: `chrome/browser/ui/views/side_panel/ami_chat/` — entire side panel module
- New: `chrome/browser/ui/webui/ami_chat/` — WebUI handler
- `chrome/browser/ui/views/toolbar/toolbar_view.cc` — add AMI Chat toolbar button
- `chrome/browser/ui/views/side_panel/side_panel_coordinator.cc` — register AMI Chat

**Effort:** 8-12 hours

---

## 5. Chat-First New Tab Page (WebUI)

> **Inspired by:** Strawberry Browser's NTP which opens with just the AI companion centered, chat input below, and recent conversations.

### What it is
Two NTP modes selectable in settings:

**Mode 1: Chat-First NTP (default for new users)**
```
┌──────────────────────────────────────────────┐
│                                              │
│              [AMI Agent Avatar]               │
│           "What can I do for you?"           │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Ask anything, search, or give a task...│  │
│  └────────────────────────────────────────┘  │
│  [🧠 Thinking ON]   [📎 Attach]   [🎤 Voice] │
│                                              │
│  Recent:                                     │
│  💬 "Find trending GitHub repos" — 2h ago    │
│  💬 "Summarize this PDF" — yesterday         │
│  💬 "Monitor competitor pricing" — 3d ago    │
│                                              │
│  ──────────────────────────────────          │
│  [🔗 Quick Links]  [Shortcuts Grid Below]    │
│                                              │
└──────────────────────────────────────────────┘
```

**Mode 2: Full Hub NTP (default for existing v2 users)**
- Current Hub dashboard: shortcuts, integrations slider, skills, stats, chat
- Same as current `hub.html` but loaded as native WebUI

### Why Binary-Level
- **No white flash** — native WebUI loads instantly (C++ serves the page, no extension roundtrip)
- **No `chrome-extension://` URL leak** in the address bar
- **Proper chrome://newtab/ URL** — looks professional
- Loads before any extensions finish initializing

### Implementation

1. **Register custom NTP WebUI:**
   ```cpp
   // chrome/browser/ui/webui/new_tab_page/ami_new_tab_page_ui.cc
   AMINewTabPageUI::AMINewTabPageUI(content::WebUI* web_ui)
       : WebUIController(web_ui) {
     // Serve HTML/CSS/JS from grd resources
     auto* source = CreateAndAddWebUIDataSource(web_ui, "newtab");
     source->AddResourcePath("", IDR_AMI_NTP_HTML);
     source->AddResourcePath("app.js", IDR_AMI_NTP_JS);
     source->AddResourcePath("style.css", IDR_AMI_NTP_CSS);
   }
   ```

2. **Mode toggle:** Setting at `chrome://settings/appearance` → "New tab page style" → "Chat-First" or "Full Hub"

3. **Content:**
   - Chat-First: Agent avatar, chat input, recent conversations, quick links
   - Full Hub: Port current `hub.html` + `hub.js` as WebUI resources

4. **Gateway integration:** NTP WebUI communicates with OpenClaw gateway via `chrome.send()` → C++ handler → HTTP to `127.0.0.1:18789`, or directly via fetch from the WebUI if permissions allow.

**Files to modify:**
- New: `chrome/browser/ui/webui/new_tab_page/ami_new_tab_page_ui.h/.cc`
- New: `chrome/browser/resources/new_tab_page/ami/` — HTML/CSS/JS assets
- `chrome/browser/ui/webui/chrome_web_ui_configs.cc` — register AMI NTP
- `chrome/browser/ui/browser_tab_strip_model_delegate.cc` — use AMI NTP

**Effort:** 6-8 hours

---

## 6. Vertical Tabs with Tree View

> **Inspired by:** Edge's Vertical Tabs (very popular) + Vivaldi's tree-style tab stacking + Arc's sidebar tab list.

### What it is
Option to show tabs vertically on the left side of the browser window instead of the horizontal tab strip. Includes tree-style grouping where child tabs (opened from a parent) are nested under their parent with visual indentation.

### Implementation

1. **Toggle:** Settings → Appearance → "Tab position" → "Top" (default) or "Side"
   - Quick toggle: right-click tab bar → "Use vertical tabs"

2. **Vertical tab strip layout:**
   ```
   ┌──────────┬────────────────────────────────┐
   │ 📌 Pinned │                                │
   │ ─────────│                                │
   │ ▶ GitHub  │                                │
   │   ├ PR #42│         Web Content            │
   │   └ Issue │                                │
   │ ▶ YouTube │                                │
   │   Gmail   │                                │
   │   Docs    │                                │
   │           │                                │
   │ [+ New]   │                                │
   │──────────│                                │
   │ [≡] [🔍]  │                                │
   └──────────┴────────────────────────────────┘
   ```

3. **Tree structure:** When a link opens in a new tab from a parent page, the child tab is nested under the parent. Collapsible with ▶/▼ toggles.

4. **Features:**
   - Collapsible sidebar (double-click edge or button)
   - Search/filter tabs (🔍 at bottom)
   - Drag to reorder/nest
   - Right-click → "Flatten tree" / "Auto-group by domain"
   - Pinned tabs section at top (compact icon-only view)
   - Tab count badge when collapsed
   - Resize handle to adjust width

5. **AI-Powered Tab Management:**
   - Right-click tab group → "AI: Name this group" → agent suggests name based on page content
   - "AI: Group similar tabs" → agent scans all open tabs and suggests groupings
   - "AI: Close duplicates" → agent identifies and offers to close duplicate/similar tabs

**Files to modify:**
- `chrome/browser/ui/views/tabs/tab_strip.cc` — add vertical layout mode
- New: `chrome/browser/ui/views/tabs/vertical_tab_strip.h/.cc`
- `chrome/browser/ui/views/frame/browser_view.cc` — layout switching
- `chrome/browser/ui/views/tabs/tab.cc` — tree indentation rendering
- `chrome/browser/ui/tabs/tab_strip_model.cc` — parent-child relationships

**Effort:** 12-16 hours

---

## 7. Smart History — Semantic Search

> **Inspired by:** Strawberry Browser's natural language history search ("Find the article about AI I read this week").
> **AMI's advantage:** 100% local. Strawberry sends data through CloudFlare. AMI indexes and searches entirely on device.

### What it is
Natural language search of browsing history. Instead of searching by URL or exact title match, the user can type "that article about machine learning I read on Tuesday" and the system finds it.

### Why Binary-Level
- Chrome's history system stores URLs and titles in a SQLite database (`chrome/browser/history/`)
- To add semantic search, we need to:
  1. Capture page metadata (title, description, key sentences) at visit time → requires hooking into the history system
  2. Generate embeddings for the captured text → can use the connected AI provider or a small local model
  3. Store embeddings in a vector index alongside history entries
  4. At query time, embed the user's NL query and find nearest neighbors

### Implementation

1. **Metadata capture (C++ hook):**
   ```cpp
   // chrome/browser/history/history_service.cc
   void HistoryService::AddPage(const HistoryAddPageArgs& args) {
     // Existing: save URL, title, visit time
     // NEW: extract first 500 chars of visible text + meta description
     // Store as 'page_summary' in history_embeddings table
   }
   ```

2. **Embedding generation:**
   - On-device: Use a small sentence transformer (all-MiniLM-L6-v2, ~80MB) compiled to ONNX, run via Chromium's existing ML service (`chrome/browser/ml_model_service/`)
   - Fallback: If user has an API key connected, use OpenAI/Gemini embeddings API
   - Generate embedding async after page load (doesn't block browsing)

3. **Vector storage:**
   - New SQLite table `history_embeddings`:
     ```sql
     CREATE TABLE history_embeddings (
       url_id INTEGER PRIMARY KEY REFERENCES urls(id),
       summary TEXT,
       embedding BLOB,  -- float32 vector, ~384 dimensions
       created_at INTEGER
     );
     ```
   - Use SQLite's built-in vector search (via `sqlite-vec` extension) or simple cosine similarity scan for small collections

4. **Search UI:**
   - `chrome://history` gets a new "Smart Search" toggle
   - When enabled, the search bar accepts natural language queries
   - Results ranked by semantic similarity + recency
   - Each result shows: title, URL, visit date, relevance score, and a snippet of the matched content
   - Also accessible from omnibox: type `@history` then your query

5. **Privacy guarantees:**
   - All embeddings generated and stored locally
   - No data sent to any server (unless user explicitly chooses cloud embedding API)
   - User can clear smart history separately from regular history
   - Settings toggle: "Enable Smart History" (on by default)

**Files to modify:**
- `chrome/browser/history/history_service.cc` — metadata capture hook
- `chrome/browser/history/history_database.cc` — new embeddings table
- New: `chrome/browser/history/smart_history_service.h/.cc` — embedding + search logic
- New: `chrome/browser/ml_model_service/sentence_transformer.h/.cc` — local embedding model
- `chrome/browser/ui/webui/history/history_ui.cc` — Smart Search UI
- `chrome/browser/ui/omnibox/` — `@history` keyword provider

**Effort:** 20-30 hours (largest single feature)

---

## 8. 5-Second Link Previews

> **Inspired by:** Arc Max's "5 Second Previews" — hover over any link + hold Shift to get an instant AI summary of the page without clicking.

### What it is
When the user hovers over a hyperlink and holds `Shift`, a floating tooltip appears with:
- Page title
- AI-generated 2-3 sentence summary of the page content
- Key image (if any)
- "Open" button to navigate

### Implementation

1. **Hover detection:** Modified link hover handler in `blink/renderer/core/html/html_anchor_element.cc` — when `Shift` is held during hover, fire a `LinkPreviewRequest` event.

2. **Preview fetching:** Background prefetch of the hovered URL (Chromium already has speculative prefetch infrastructure). Extract text content from prefetched page.

3. **AI summarization:** Send extracted text (first 2000 chars) to connected AI provider via gateway:
   ```
   POST http://127.0.0.1:18789/v1/chat/completions
   {
     "model": "user_default",
     "messages": [{"role": "system", "content": "Summarize in 2-3 sentences"},
                  {"role": "user", "content": "<page_text>"}]
   }
   ```

4. **Tooltip UI:** Native `views::BubbleDialogDelegateView` positioned near the cursor:
   ```
   ┌──────────────────────────────┐
   │ 📄 How Svelte 5 Runes Work  │
   │                              │
   │ Svelte 5 introduces runes   │
   │ for fine-grained reactivity  │
   │ without a virtual DOM...     │
   │                              │
   │ [Open]        preview ⚡     │
   └──────────────────────────────┘
   ```

5. **Caching:** Cache previews by URL for 1 hour. Don't re-summarize the same link.

6. **Settings:** Toggle at Settings → AMI Features → "Link Previews" (on by default)

**Files to modify:**
- New: `chrome/browser/ui/views/link_preview/link_preview_bubble.h/.cc`
- `chrome/browser/ui/views/frame/browser_root_view.cc` — hover event handling
- `content/browser/preloading/` — prefetch integration

**Effort:** 8-12 hours

---

## 9. Tidy Tab Titles & Tidy Downloads

> **Inspired by:** Arc Max's "Tidy Tab Titles" (AI-renames pinned tabs shorter) and "Tidy Downloads" (AI-renames downloaded files meaningfully).

### 9.1 Tidy Tab Titles
When a tab is pinned, the AI automatically renames it to a shorter, cleaner title.

**Example:** "Dashboard - Analytics - MyCompany Admin Panel - Google Chrome" → "Analytics"

**Implementation:**
- Hook into `TabStripModel::SetTabPinned()` — when a tab is pinned, send title to AI for shortening
- AI prompt: "Shorten this browser tab title to 1-3 words, keeping the most important information: '<title>'"
- Store the "tidy title" alongside the original — hovering shows original, display shows tidy
- Rate limit: max 5 AI calls per minute for tab titles

### 9.2 Tidy Downloads
When a file is downloaded, AI renames it from cryptic names to meaningful ones.

**Example:** "IMG_20250714_134522.jpg" → "AI-Browser-Architecture-Diagram.jpg"
**Example:** "document (3).pdf" → "Q2-Revenue-Report.pdf"

**Implementation:**
- Hook into `download::DownloadItem::OnDownloadUpdated()` — when download completes, analyze filename + source URL + page title
- AI prompt: "Suggest a better filename for a file downloaded from '<url>' with page title '<title>' and original name '<filename>'. Keep the extension. Return only the new filename."
- Show rename suggestion as a toast notification: "Rename to 'Q2-Revenue-Report.pdf'? [Yes] [No]"
- Don't auto-rename without confirmation (avoid confusion)

**Files to modify:**
- `chrome/browser/ui/tabs/tab_strip_model.cc` — tidy title hook on pin
- `chrome/browser/download/download_item_model.cc` — tidy download hook
- New: `chrome/browser/ami/tidy_service.h/.cc` — shared AI naming service

**Effort:** 4-6 hours

---

## 10. Native AMI Shield Toolbar Button

> **Better than:** Brave Shields (AMI shows richer per-site breakdown), Edge (has no ad blocker)

### What it is
A native toolbar button (shield icon) with a blocked content counter badge. Click opens a dropdown panel showing per-site blocking stats.

### Implementation

1. **Toolbar button:**
   ```cpp
   // chrome/browser/ui/views/toolbar/ami_shield_toolbar_button.h
   class AMIShieldToolbarButton : public ToolbarButton {
     void UpdateBadge(int blocked_count);  // red number badge
     void ShowDropdown();                  // panel with details
   };
   ```

2. **Dropdown panel (WebUI popup):**
   ```
   ┌──────────────────────────┐
   │ 🛡️ AMI Shield    [ON/OFF]│
   │──────────────────────────│
   │ This page:               │
   │  Ads blocked:      12    │
   │  Trackers blocked: 8     │
   │  Fingerprint:      3     │
   │  Cookies blocked:  5     │
   │──────────────────────────│
   │ Total (all time):        │
   │  184,329 items blocked   │
   │──────────────────────────│
   │ [Manage per-site rules]  │
   └──────────────────────────┘
   ```

3. **Communication:** Shield button communicates with the `ami-adblocker` extension via Chrome's internal messaging to get block counts.

**Files to modify:**
- New: `chrome/browser/ui/views/toolbar/ami_shield_toolbar_button.h/.cc`
- `chrome/browser/ui/views/toolbar/toolbar_view.cc` — add to toolbar layout
- New: `chrome/browser/ui/webui/ami_shield/` — dropdown WebUI

**Effort:** 6-8 hours

---

## 11. AMI Rewards Toolbar Button

> **Modeled after Brave Rewards:** A single "AMI Rewards" feature that combines browsing rewards **and** a built-in multi-chain wallet. Users earn rewards into the same wallet they use for transactions — no separate "wallet" product.

### What it is
Toolbar button showing rewards balance. One click opens a compact panel showing earned rewards, wallet balances, and agent transaction history. Like Brave Rewards is also Brave Wallet — AMI Rewards **is** the wallet.

### Implementation

1. **Toolbar button:** Shows AMI Rewards balance (e.g., "$142.50")
2. **Dropdown panel:**
   ```
   ┌───────────────────────────┐
   │ 🎁 AMI Rewards            │
   │ Total: $142.50            │
   │─────────────────────────│
   │ Rewards earned: 12.5 AMI  │
   │ ETH: 0.05  ($190)        │
   │ SOL: 2.1   ($320)        │
   │ USDC: 142.50             │
   │─────────────────────────│
   │ Recent Activity:          │
   │ 🎁 +0.5 AMI (browsing)   │
   │ ✅ Swap completed         │
   │ ⏳ Pending: Buy order     │
   │─────────────────────────│
   │ [Deposit] [Withdraw]      │
   │ [Rewards Settings]        │
   └───────────────────────────┘
   ```

3. **Rewards + wallet engine:** Fork Backpack (Apache 2.0) for multi-chain EVM + Solana support. Add rewards accumulation on top. Expose a local API:
   ```
   GET  /rewards/balance       → earned rewards + wallet balances per chain
   GET  /rewards/history       → reward earnings history
   POST /rewards/approve-tx    → queues transaction, waits for user approval
   POST /rewards/execute-tx    → executes approved transaction
   POST /rewards/swap          → token swap aggregator
   GET  /rewards/positions     → open positions
   ```

4. **Security:**
   - AES-256 encrypted keystore
   - Agent NEVER has raw private keys — all transactions go through an approval queue
   - Default: ALL transactions require manual approval
   - Optional: auto-approve rules with spending limits (off by default)

**Files to modify:**
- New: `chrome/browser/ui/views/toolbar/ami_rewards_toolbar_button.h/.cc`
- `chrome/browser/ui/views/toolbar/toolbar_view.cc` — add to toolbar layout
- New: `chrome/browser/ui/webui/ami_rewards/` — dropdown WebUI
- New: `components/ami_rewards/` — rewards + wallet engine (Backpack fork integration)

**Effort:** 20-30 hours (wallet + rewards engine is complex)

---

## 12. Web Capture / Screenshot Tool

> **Inspired by:** Edge's Web Capture (Ctrl+Shift+S). Brave doesn't have this.

### What it is
Built-in screenshot tool: capture full page, visible area, or custom selection. Annotate with arrows, highlights, text. Copy or save.

### Implementation

1. **Trigger:** `Ctrl+Shift+S` or toolbar menu → "Web Capture"
2. **Overlay:** Full-page dimmed overlay with crosshair cursor for selection
3. **Modes:**
   - Selection: drag to select area
   - Visible area: capture current viewport
   - Full page: scroll-stitch entire page
4. **Annotation toolbar:** Draw, highlight, arrow, text, crop
5. **Actions:** Copy to clipboard, save as PNG, share via AMI Sync, send to AI chat ("Analyze this screenshot")

**Files to modify:**
- New: `chrome/browser/ui/views/web_capture/web_capture_overlay.h/.cc`
- `chrome/browser/ui/browser_commands.cc` — register shortcut
- `content/browser/renderer_host/` — compositor screenshot integration

**Effort:** 6-8 hours

---

## 13. Smart Reader Mode with AI

> **Better than:** Brave Speed Reader (basic text extraction), Edge Immersive Reader (no AI)

### What it is
Reader mode that strips page clutter and shows clean text. Enhanced with AI summarization, text-to-speech via connected providers, and translation.

### Implementation

1. **Reader icon** in address bar for article-type pages (detected via `dom_distiller` heuristics)
2. **Reader view features:**
   - Clean text with customizable fonts (serif/sans/mono)
   - Dark/light/sepia/custom theme
   - Font size slider + line spacing
   - **AI Summary button:** "Summarize this article" → 3-5 sentence summary via connected AI
   - **AI Q&A:** "Ask about this article" → opens chat sidebar with article context pre-loaded
   - **TTS button:** Read aloud using connected TTS provider (ElevenLabs, OpenAI TTS, browser built-in)
   - **Translate button:** Translate article using AI (full article, not just snippets)
   - **Estimated reading time** displayed at top

**Files to modify:**
- `components/dom_distiller/` — enhance reader UI
- New: `chrome/browser/ui/webui/reader_mode/ami_reader_ui.h/.cc` — custom reader WebUI
- `chrome/browser/ui/views/location_bar/` — reader mode icon

**Effort:** 8-10 hours

---

## 14. Tab Indicators & Working Badges

> **Inspired by:** Strawberry's live progress indicators when AI is working in a tab.

### What it is
Visual indicators on tabs showing what's happening:

- **🔄 AI Working** — animated spinner on tab favicon when the AI agent is actively working in that tab
- **✅ AI Done** — brief green checkmark when automation completes
- **🔇 Muted** — speaker icon with line through it for muted audio tabs (Chromium has this, just style it better)
- **🔒 HTTPS** — padlock indicator in tab for secure connections
- **📌 Pinned** — compact pin icon
- **💤 Sleeping** — dim/gray treatment for discarded/sleeping tabs

### Implementation

1. **AI Working indicator:** When the OpenClaw gateway has an active automation for a tab, communicate via extension messaging to set a custom favicon overlay.
   ```cpp
   // Tab favicon overlay system
   void TabIcon::SetOverlayIcon(OverlayType type) {
     // WORKING: animated dots/spinner
     // DONE: green checkmark (auto-clears after 3 seconds)
     // ERROR: red exclamation
   }
   ```

2. **Tab tooltip enhancement:** Hovering over a tab with AI running shows: "AMI Agent: Extracting data from 3 pages... (2 min remaining)"

**Files to modify:**
- `chrome/browser/ui/views/tabs/tab_icon.cc` — overlay rendering
- `chrome/browser/ui/views/tabs/tab.cc` — tooltip enhancement
- `chrome/browser/ui/tabs/tab_utils.cc` — state tracking

**Effort:** 4-6 hours

---

## 15. Network-Level Ad Blocking

> **Matching:** Brave's network-level Shields (fastest ad blocking in any browser)

### What it is
Move ad/tracker blocking from extension-based (declarativeNetRequest) to Chromium's network stack. This is faster because it blocks requests BEFORE they create a network connection, rather than intercepting them at the extension layer.

### Implementation

1. **Ad block engine:** Integrate Brave's `adblock-rust` (MPL 2.0) as a native component:
   - Compiled Rust library linked as a Chromium component
   - Loads EasyList, EasyPrivacy, AMI custom lists at startup
   - Filters applied in `net::URLRequest` before connection

2. **Cosmetic filtering:** CSS-based element hiding applied via content injection (similar to current extension approach but faster startup)

3. **Filter list updates:** Background update every 24 hours from `https://lists.ami.exchange/` (or use existing EasyList CDN)

4. **Integration with Shield UI:** Block counts flow from native engine to Shield toolbar button

**Files to modify:**
- New: `components/ami_adblock/` — native ad blocking engine
- `net/url_request/url_request.cc` — request interception hook
- `chrome/browser/profiles/profile_impl.cc` — initialize ad block on profile load

**Effort:** 16-20 hours (significant but Brave's code can be referenced)

---

## 16. Connected Apps / OAuth System

> **Inspired by:** Strawberry Browser's "Connected Apps" — native OAuth integrations with Gmail, Slack, Notion, CRMs, LinkedIn

### What it is
A browser-native system for connecting third-party services via OAuth. Once connected, the AI agent can interact with these services directly (read emails, send Slack messages, update CRM records) without the user needing to navigate to each app.

### Supported Integrations (Priority Order)

| Tier | Service | API | Auth |
|------|---------|-----|------|
| P0 | Google Workspace (Gmail, Calendar, Drive, Sheets) | Google APIs | OAuth 2.0 |
| P0 | Slack | Slack Web API | OAuth 2.0 |
| P0 | Notion | Notion API | OAuth 2.0 |
| P1 | Microsoft 365 (Outlook, OneDrive, Teams) | Microsoft Graph | OAuth 2.0 |
| P1 | GitHub | GitHub REST + GraphQL | OAuth App |
| P1 | Salesforce | Salesforce REST API | OAuth 2.0 |
| P1 | HubSpot | HubSpot API | OAuth 2.0 |
| P2 | Linear | Linear GraphQL | OAuth 2.0 |
| P2 | Jira | Atlassian REST API | OAuth 2.0 |
| P2 | Discord | Discord API | OAuth 2.0 |
| P2 | Telegram | Telegram Bot API | Bot token |
| P3 | Airtable, ClickUp, Monday, Asana | REST APIs | OAuth/API key |

### Implementation

1. **OAuth Manager (C++ native):**
   ```cpp
   // chrome/browser/ami/oauth/ami_oauth_manager.h
   class AMIOAuthManager {
     void StartOAuthFlow(const std::string& provider);
     void StoreToken(const std::string& provider, const OAuthToken& token);
     OAuthToken GetToken(const std::string& provider);
     std::vector<ConnectedApp> GetConnectedApps();
   };
   ```
   - Tokens stored encrypted in browser profile database (AES-256, same key as passwords)
   - Token refresh handled automatically

2. **Connection UI:** Settings → AMI → Connected Apps
   ```
   ┌──────────────────────────────────────┐
   │ Connected Apps                        │
   │                                       │
   │ [G] Gmail         ✅ Connected        │
   │ [S] Slack         ✅ Connected        │
   │ [N] Notion        ⬜ Connect →        │
   │ [GH] GitHub       ✅ Connected        │
   │ [SF] Salesforce   ⬜ Connect →        │
   │                                       │
   │ [+ Add Custom API]                    │
   └──────────────────────────────────────┘
   ```

3. **Agent integration:** Once connected, the AI agent can call these APIs through the gateway:
   ```
   POST /connected-apps/gmail/send     → Send email via connected Gmail
   POST /connected-apps/slack/message  → Send Slack message
   POST /connected-apps/notion/create  → Create Notion page
   GET  /connected-apps/gmail/inbox    → Read recent emails
   ```

4. **Permission model:** Agent must request approval before accessing connected apps (ties into §17 Approval System)

**Files to modify:**
- New: `chrome/browser/ami/oauth/` — OAuth manager + token storage
- New: `chrome/browser/ui/webui/settings/ami_connected_apps_handler.h/.cc`
- `chrome/browser/resources/settings/` — Connected Apps settings page

**Effort:** 16-24 hours

---

## 17. Approval System — Native UI

> **Inspired by:** Strawberry's "APPROVAL NEEDED" dialog. **AMI's is better:** granular categories, auto-approve rules, spending limits, audit log.

### What it is
When the AI agent wants to perform a sensitive action (send email, make a purchase, execute a transaction), a native dialog appears asking for user approval.

### Implementation

1. **Native approval dialog (not a web popup):**
   ```
   ┌──────────────────────────────────────────┐
   │ ⚠️  AMI Agent — Approval Needed          │
   │                                          │
   │ Send this email to sam@company.com?      │
   │                                          │
   │ Subject: Follow-up on our meeting        │
   │ Body: Hi Sam, great meeting today...     │
   │                                          │
   │ [ ] Remember for this action type        │
   │                                          │
   │    [Cancel]          [✅ Approve]          │
   └──────────────────────────────────────────┘
   ```

2. **Categories with per-category approval settings:**
   ```
   Settings → AMI Agent → Permissions
   
   📧 Email: [Always ask ▾]
   💬 Messaging (Slack/Discord): [Ask first time ▾]
   📝 Form submissions: [Always ask ▾]
   💰 Wallet transactions: [Always ask ▾]
   🔍 Web search/navigation: [Auto-approve ▾]
   📊 Data extraction: [Auto-approve ▾]
   📁 File operations: [Ask first time ▾]
   ```

3. **Spending limits for wallet:**
   - "Auto-approve transactions under $___"
   - "Daily auto-approve limit: $___"
   - "Require approval for any transaction over $___"

4. **Audit log:**
   - Every approval/rejection logged with timestamp, action type, details
   - Viewable at `chrome://ami-audit/` or Settings → AMI Agent → Activity Log
   - Exportable as CSV/JSON

5. **Bulk approval:** When agent has multiple pending actions: "Approve all 5 pending (3 emails, 2 CRM updates)"

**Files to modify:**
- New: `chrome/browser/ui/views/ami_approval/approval_dialog.h/.cc` — native dialog
- New: `chrome/browser/ami/approval/approval_service.h/.cc` — approval logic + audit log
- New: `chrome/browser/ui/webui/settings/ami_permissions_handler.h/.cc`
- `chrome/browser/resources/settings/` — permissions settings page

**Effort:** 8-12 hours

---

## 18. Parallel Browser Automations & Mission Control

> **No other browser has this.** The user asks the AI to perform tasks — each task opens its own tab and runs browser automation autonomously via OpenClaw. Multiple automations run simultaneously. A dedicated **Mission Control** tab shows a live grid view of every running automation in real-time, like a security-camera dashboard for your AI agents.

### 18.1 The User Experience

```
User: "Buy me 3 packs of AA batteries on Amazon, cheapest with Prime shipping"
  → AMI opens Tab 5: Amazon.com — agent starts searching, comparing, adding to cart

User: "Post this month's accounting entries on SAP Cloud ERP"
  → AMI opens Tab 6: SAP ERP — agent logs in, navigates to journal entries, starts posting

User: "Find 20 machine learning engineers in Berlin on LinkedIn Recruiter"
  → AMI opens Tab 7: LinkedIn — agent opens Recruiter search, filters, starts saving profiles

User: "Schedule team standup for next week on Google Calendar"
  → AMI opens Tab 8: Google Calendar — agent creates recurring event

All 4 tasks run SIMULTANEOUSLY. The user opens Mission Control to watch them all.
```

### 18.2 Mission Control — Live Automation Dashboard

A dedicated `chrome-untrusted://mission-control/` WebUI page that opens as a tab. Shows a responsive grid of live thumbnails for every active automation tab — like a CCTV monitoring screen.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ◀ ▶ 🔄  ┃  🎯 Mission Control                                     ─ □ ✕     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  AMI Mission Control                              4 running · 1 done · 0 failed│
│                                                                                 │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐             │
│  │ 🔄 Amazon — Buy batteries │  │ 🔄 SAP ERP — Post accounting  │             │
│  │ ┌────────────────────────┐ │  │ ┌──────────────────────────┐  │             │
│  │ │                        │ │  │ │                          │  │             │
│  │ │   [LIVE VIEW of tab]   │ │  │ │   [LIVE VIEW of tab]    │  │             │
│  │ │   Amazon search page   │ │  │ │   SAP journal entry     │  │             │
│  │ │   showing results      │ │  │ │   form being filled     │  │             │
│  │ │                        │ │  │ │                          │  │             │
│  │ └────────────────────────┘ │  │ └──────────────────────────┘  │             │
│  │ Step 3/7: Comparing prices │  │ Step 5/12: Entering line 3   │             │
│  │ ██████░░░░ 43%  ⏱ 2:15    │  │ ████████░░ 42%  ⏱ 4:30      │             │
│  │ [Pause] [Stop] [Jump to]   │  │ [Pause] [Stop] [Jump to]     │             │
│  └────────────────────────────┘  └────────────────────────────────┘             │
│                                                                                 │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐             │
│  │ 🔄 LinkedIn — Find MLEs   │  │ ✅ Google Cal — Standup done  │             │
│  │ ┌────────────────────────┐ │  │ ┌──────────────────────────┐  │             │
│  │ │                        │ │  │ │                          │  │             │
│  │ │   [LIVE VIEW of tab]   │ │  │ │   [FINAL SCREENSHOT]    │  │             │
│  │ │   LinkedIn Recruiter   │ │  │ │   Calendar event         │  │             │
│  │ │   search running       │ │  │ │   created successfully   │  │             │
│  │ │                        │ │  │ │                          │  │             │
│  │ └────────────────────────┘ │  │ └──────────────────────────┘  │             │
│  │ Step 2/5: Saving profile 8 │  │ Completed in 1:42            │             │
│  │ ████░░░░░░ 40%  ⏱ 3:10    │  │ Created: "Team Standup"      │             │
│  │ [Pause] [Stop] [Jump to]   │  │ [View result] [Dismiss]      │             │
│  └────────────────────────────┘  └────────────────────────────────┘             │
│                                                                                 │
│  ─── Activity Feed ──────────────────────────────────────────────────────────── │
│  12:04:32  Amazon     Added "Duracell AA 48-pack" to cart ($12.99)             │
│  12:04:28  SAP ERP    Posted debit entry: Account 4200 — $3,400.00             │
│  12:04:25  LinkedIn   Saved profile #8: "Sara M. — ML Engineer @ Zalando"     │
│  12:04:20  Google Cal ✅ Created event "Team Standup" Mon-Fri 9:00 AM          │
│  12:04:15  Amazon     Comparing 3 Prime-eligible results...                    │
│  12:04:10  SAP ERP    Navigated to Journal Entries > New Entry                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 18.3 Architecture — How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                        AMI Browser Process                       │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Tab 5   │  │  Tab 6   │  │  Tab 7   │  │  Tab 8   │        │
│  │ Amazon   │  │ SAP ERP  │  │ LinkedIn │  │ Calendar │        │
│  │ Renderer │  │ Renderer │  │ Renderer │  │ Renderer │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │              │              │              │              │
│  ┌────▼──────────────▼──────────────▼──────────────▼────┐        │
│  │              AutomationTabManager (C++)               │        │
│  │  - Tracks which tabs are automation tabs              │        │
│  │  - Manages tab lifecycle (create, pause, stop, done)  │        │
│  │  - Captures tab screenshots at configurable FPS       │        │
│  │  - Forwards frames to Mission Control WebUI           │        │
│  │  - Prevents automation tabs from throttling            │        │
│  └────────────────────┬─────────────────────────────────┘        │
│                       │                                          │
│  ┌────────────────────▼─────────────────────────────────┐        │
│  │          Mission Control WebUI (Tab 9)                │        │
│  │  chrome-untrusted://mission-control/                  │        │
│  │  - Grid layout of live tab thumbnails                 │        │
│  │  - WebSocket to AutomationTabManager for frames       │        │
│  │  - Progress bars, step counters, timers               │        │
│  │  - Pause / Stop / Jump-to controls                    │        │
│  │  - Live activity feed (scrolling log)                 │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐        │
│  │         OpenClaw Gateway (localhost:18789)             │        │
│  │  - Receives user commands from AI Sidebar chat        │        │
│  │  - Spawns one automation session per task             │        │
│  │  - Each session drives its own tab via CDP/MCP        │        │
│  │  - Reports progress, steps, errors back to browser    │        │
│  └──────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

### 18.4 Implementation Details

#### A. Automation Tab Type & Lifecycle

```cpp
// New enum in chrome/browser/ui/tabs/tab_enums.h
enum class TabAutomationState {
  kNone,        // Normal user tab
  kPending,     // Automation requested, tab loading
  kRunning,     // Automation actively executing steps
  kPaused,      // User paused the automation
  kCompleted,   // Automation finished successfully
  kFailed,      // Automation hit an error
  kCancelled    // User cancelled
};

// New class: AutomationTabManager — singleton per BrowserWindow
class AutomationTabManager : public TabStripModelObserver {
 public:
  // Create a new automation tab and start the task
  content::WebContents* CreateAutomationTab(
      const std::string& task_description,
      const GURL& start_url,
      const std::string& openclaw_session_id);

  // Lifecycle controls
  void PauseAutomation(int tab_id);
  void ResumeAutomation(int tab_id);
  void StopAutomation(int tab_id);

  // State queries
  TabAutomationState GetState(int tab_id) const;
  int GetActiveAutomationCount() const;
  std::vector<AutomationInfo> GetAllAutomations() const;

  // Screenshot capture for Mission Control
  void StartFrameCapture(int tab_id, int fps = 2);
  void StopFrameCapture(int tab_id);

  // Observers (Mission Control WebUI subscribes)
  void AddObserver(AutomationObserver* observer);

 private:
  static constexpr int kMaxConcurrentAutomations = 8;
  base::flat_map<int, std::unique_ptr<AutomationSession>> sessions_;
};
```

#### B. Live Tab Capture — Frame Streaming

The key technical challenge: showing live views of automation tabs on the Mission Control page. Three approaches, in order of preference:

**Approach 1: Tab Capture API (recommended)**
```cpp
// Use Chromium's built-in tab capture (same API used by screen sharing)
// AutomationTabManager captures each automation tab as a MediaStream
void AutomationTabManager::StartFrameCapture(int tab_id, int fps) {
  auto* contents = GetWebContentsForTab(tab_id);

  // Create a capture handle — low-FPS, low-resolution for thumbnails
  media::VideoCaptureParams params;
  params.requested_format.frame_size = gfx::Size(640, 360);  // 360p
  params.requested_format.frame_rate = fps;  // 2 FPS for grid, 15 FPS for focus

  // Start capture — frames are forwarded to Mission Control via IPC
  auto stream = contents->GetMainFrame()->CreateMediaStreamForTab(params);
  frame_streams_[tab_id] = std::move(stream);
}
```

Each card in the Mission Control grid receives a `MediaStream` and renders it in a `<video>` element — true live video, not screenshots.

**Approach 2: Periodic screenshot fallback**
```cpp
// Fallback: capture bitmap snapshots every 500ms
void AutomationTabManager::CaptureScreenshot(int tab_id) {
  auto* contents = GetWebContentsForTab(tab_id);
  contents->GetMainFrame()->CopyFromCompositingSurface(
      gfx::Rect(), gfx::Size(640, 360),
      base::BindOnce(&AutomationTabManager::OnScreenshotCaptured,
                     weak_factory_.GetWeakPtr(), tab_id));
}

// Encode as JPEG and push to Mission Control WebUI via Mojo IPC
void AutomationTabManager::OnScreenshotCaptured(
    int tab_id, const SkBitmap& bitmap) {
  auto jpeg = gfx::JPEGCodec::Encode(bitmap, 60);  // 60% quality
  for (auto* observer : observers_)
    observer->OnFrameReceived(tab_id, jpeg);
}
```

**Approach 3: Offscreen rendering for background tabs**

Chromium normally throttles background tabs — they don't render. For automation tabs, we need to keep rendering active:

```cpp
// Prevent background throttling for automation tabs
void AutomationTabManager::PreventThrottling(int tab_id) {
  auto* contents = GetWebContentsForTab(tab_id);

  // Mark as "visible" to the compositor even when backgrounded
  contents->WasShown();

  // Set a minimum frame rate to keep rendering active
  auto* rfh = contents->GetPrimaryMainFrame();
  rfh->GetRenderWidgetHost()->SetFrameSinkMinimumFrameRate(2.0f);
}
```

#### C. Mission Control WebUI

```
chrome-untrusted://mission-control/
├── index.html         — grid layout shell
├── mission_control.ts — main controller
├── automation_card.ts — individual task card component
├── activity_feed.ts   — scrolling live log
├── mission_control.css
└── mission_control_ui.h/.cc — C++ WebUI controller
```

**Grid layout:**
```css
/* Responsive grid — 1 col on narrow, 2 on medium, 3 on wide */
.automation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
  padding: 24px;
}

.automation-card {
  background: var(--ami-surface);     /* #1e1e3a */
  border: 1px solid var(--ami-border); /* #2a2a4a */
  border-radius: 16px;
  overflow: hidden;
}

.automation-card.running {
  border-color: var(--ami-purple);    /* #7c3aed */
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.15);
}

.automation-card.completed {
  border-color: var(--ami-green);     /* #22c55e */
}

.automation-card.failed {
  border-color: var(--ami-red);       /* #ef4444 */
}

/* Live video feed */
.card-video {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
  border-radius: 12px 12px 0 0;
}

/* Click to expand — full-screen single-tab view */
.automation-card.expanded {
  position: fixed;
  inset: 24px;
  z-index: 1000;
  grid-column: 1 / -1;
}
.automation-card.expanded .card-video {
  height: 70vh;
}
```

**Mojo IPC interface:**
```cpp
// mojom interface for Mission Control ↔ browser communication
interface MissionControlPageHandler {
  // Get all current automations
  GetAutomations() => (array<AutomationInfo> automations);

  // Subscribe to live updates
  ObserveAutomations(pending_remote<MissionControlObserver> observer);

  // User controls
  PauseAutomation(int32 tab_id);
  ResumeAutomation(int32 tab_id);
  StopAutomation(int32 tab_id);
  JumpToTab(int32 tab_id);  // Switch to the automation tab

  // Frame control
  SetFrameRate(int32 tab_id, int32 fps);  // 2 FPS grid → 15 FPS focus
};

interface MissionControlObserver {
  // Called when automation state changes
  OnAutomationUpdated(AutomationInfo info);

  // Called on each captured frame (JPEG bytes)
  OnFrameReceived(int32 tab_id, array<uint8> jpeg_data);

  // Called for each agent action (for activity feed)
  OnActivityEvent(ActivityEvent event);
};
```

#### D. Automation Card — Per-Task UI

Each card in the grid shows:

```
┌───────────────────────────────────────┐
│         [LIVE VIDEO FEED 16:9]        │  ← MediaStream from tab capture
│                                       │
│  Agent clicking "Add to Cart" button  │  ← Real-time action narration
│                                       │
├───────────────────────────────────────┤
│ 🔄 Amazon — Buy AA batteries         │  ← Task title
│                                       │
│ Step 3 of 7: Comparing prices         │  ← Current step description
│ ████████████░░░░░░░░ 43%              │  ← Progress bar (AMI purple)
│ ⏱ 2:15 elapsed · ~3:00 remaining     │  ← Timer
│                                       │
│ Recent actions:                       │
│  • Searched "AA batteries Prime"      │  ← Last 3 actions
│  • Filtered by Prime shipping         │
│  • Comparing 3 results by price       │
│                                       │
│ [⏸ Pause]  [⏹ Stop]  [↗ Jump to tab] │  ← Controls
└───────────────────────────────────────┘
```

**Click to expand:** Clicking a card expands it to fill the Mission Control page, showing the live feed at full resolution (bumps FPS from 2→15) with a detailed step-by-step log.

**Click "Jump to tab":** Switches to the actual automation tab so the user can watch or intervene directly.

#### E. Preventing Background Tab Throttling

Chromium aggressively throttles background tabs (reduces timer resolution, pauses `requestAnimationFrame`, delays network requests). This breaks browser automation. AMI must exempt automation tabs:

```cpp
// In content/browser/renderer_host/render_widget_host_impl.cc
bool RenderWidgetHostImpl::ShouldThrottleRendering() const {
  // Never throttle automation tabs — they need to keep rendering
  // for Mission Control live view and for automation scripts
  if (GetWebContents() &&
      AutomationTabManager::IsAutomationTab(GetWebContents())) {
    return false;
  }
  return !is_hidden_ ? false : true;
}

// In content/browser/scheduler/browser_task_priority.cc
// Don't reduce timer resolution for automation tabs
base::TimeDelta GetTimerResolution(content::WebContents* contents) {
  if (AutomationTabManager::IsAutomationTab(contents))
    return base::Milliseconds(4);  // Full resolution
  return is_background ? base::Milliseconds(1000) : base::Milliseconds(4);
}
```

#### F. OpenClaw Gateway — Parallel Session Management

The OpenClaw gateway (localhost:18789) manages multiple simultaneous automation sessions:

```
┌──────────────────────────────────────────────────┐
│             OpenClaw Gateway Process              │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐                │
│  │  Session 1   │  │  Session 2   │               │
│  │  Amazon task │  │  SAP task    │               │
│  │  CDP → Tab 5 │  │  CDP → Tab 6 │               │
│  └─────────────┘  └─────────────┘                │
│  ┌─────────────┐  ┌─────────────┐                │
│  │  Session 3   │  │  Session 4   │               │
│  │  LinkedIn    │  │  Calendar    │               │
│  │  CDP → Tab 7 │  │  CDP → Tab 8 │               │
│  └─────────────┘  └─────────────┘                │
│                                                   │
│  Each session:                                    │
│  - Has its own CDP (Chrome DevTools Protocol)     │
│    connection to its dedicated tab                │
│  - Runs its own LLM context/conversation          │
│  - Reports progress via WebSocket to browser      │
│  - Can be paused/resumed/cancelled independently  │
│                                                   │
│  Progress WebSocket (localhost:18792):             │
│  {                                                │
│    "session_id": "sess_abc123",                   │
│    "tab_id": 5,                                   │
│    "type": "step_update",                         │
│    "step": 3,                                     │
│    "total_steps": 7,                              │
│    "description": "Comparing prices",             │
│    "action": "Clicked sort-by-price dropdown",    │
│    "screenshot_url": null                         │
│  }                                                │
└──────────────────────────────────────────────────┘
```

#### G. User Flow — Start to Finish

1. **User types in AI Sidebar chat:** "Buy AA batteries on Amazon and post this month's accounting on SAP"
2. **LLM decomposes** into 2 independent tasks (or user sends them one at a time)
3. **For each task,** the gateway requests a new automation tab via the `AutomationTabManager`:
   - Browser creates a new tab, marks it as `kRunning`
   - Tab gets a special AMI badge overlay (animated purple ring)
   - Mission Control (if open) immediately shows a new card
4. **Gateway opens a CDP session** to each tab and starts executing automation steps
5. **AutomationTabManager captures frames** from each tab (2 FPS by default)
6. **Mission Control renders** live grid — user can watch all tasks simultaneously
7. **On completion:** Tab state changes to `kCompleted`, card turns green, results summary shown
8. **User reviews results** — can click "Jump to tab" to inspect, or dismiss

#### H. Sidebar Integration — Quick Status

Even without Mission Control open, the AI Sidebar shows a compact automation status:

```
┌──────────────────────────────────────┐
│ AMI Chat                      ≡      │
│──────────────────────────────────────│
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🎯 4 automations running         │ │
│ │ Amazon (43%) · SAP (42%)         │ │
│ │ LinkedIn (40%) · Calendar ✅     │ │
│ │ [Open Mission Control]           │ │
│ └──────────────────────────────────┘ │
│                                      │
│ You: Buy AA batteries on Amazon     │
│                                      │
│ AMI: On it! I've opened a new tab   │
│ and started shopping. You can watch  │
│ the progress in Mission Control or   │
│ keep chatting — I'll let you know    │
│ when it's done.                      │
│                                      │
│ [────────────────────────] Send      │
└──────────────────────────────────────┘
```

#### I. Resource Management & Limits

| Setting | Default | Range | Location |
|---------|---------|-------|----------|
| Max concurrent automations | 8 | 1-16 | `chrome://settings/ami/automations` |
| Live capture FPS (grid) | 2 | 1-5 | Auto-adjusted |
| Live capture FPS (focused) | 15 | 5-30 | Auto-adjusted |
| Capture resolution | 640×360 | 320×180 – 1920×1080 | Auto based on grid size |
| Auto-discard completed tabs after | 10 min | Never – 30 min | Settings |
| Background tab memory limit | 512 MB per tab | 256-1024 MB | Settings |
| CPU priority for automation tabs | Below Normal | Low – Normal | Hardcoded |
| Pause all on battery saver | Yes | Yes/No | Settings |

```cpp
// Resource governor — prevents automation tabs from starving the user
class AutomationResourceGovernor {
 public:
  void OnUserTabActivated() {
    // When user switches to a normal tab, drop automation FPS
    for (auto& [tab_id, session] : sessions_) {
      if (session->state == kRunning)
        SetFrameRate(tab_id, 1);  // Minimum FPS to save CPU
    }
  }

  void OnMissionControlFocused() {
    // Mission Control is active — bump FPS for all cards
    for (auto& [tab_id, session] : sessions_) {
      if (session->state == kRunning)
        SetFrameRate(tab_id, 2);  // Grid FPS
    }
  }

  void OnCardExpanded(int tab_id) {
    // User expanded one card — give it high FPS, reduce others
    SetFrameRate(tab_id, 15);
    for (auto& [other_id, session] : sessions_) {
      if (other_id != tab_id && session->state == kRunning)
        SetFrameRate(other_id, 1);
    }
  }
};
```

#### J. Error Handling & User Intervention

When an automation hits an obstacle (CAPTCHA, 2FA, unexpected page layout):

```
┌───────────────────────────────────────┐
│         [LIVE VIDEO — PAUSED]         │
│                                       │
│      ⚠️ CAPTCHA DETECTED              │
│                                       │
├───────────────────────────────────────┤
│ ⚠️ Amazon — Needs your help           │
│                                       │
│ The agent encountered a CAPTCHA on    │
│ Amazon's checkout page. Please solve  │
│ it to continue the automation.        │
│                                       │
│ [🔗 Jump to tab & solve]              │
│ [❌ Cancel automation]                │
│ [⏭ Skip this step]                   │
└───────────────────────────────────────┘
```

States that trigger intervention:
- **CAPTCHA:** Pause + notify user to solve
- **2FA / MFA prompt:** Pause + notify user to authenticate
- **Login expired:** Pause + notify user to re-login
- **Permission denied:** Report error, suggest different approach
- **Element not found after retries:** Pause + ask user for guidance

A native notification (`chrome.notifications`) is also shown if the user is in a different tab.

### 18.7 Vision AI Element Interaction

> **Inspired by Skyvern's approach:** Instead of brittle CSS selectors or XPath expressions, AMI uses Vision LLMs to understand page layout and identify interactive elements visually — just like a human would. This makes automations resistant to website redesigns and capable of operating on never-seen-before websites without any pre-built selectors.

**How it works:**

```
Traditional Automation (Selenium/Playwright):
  driver.find_element(By.CSS_SELECTOR, "#add-to-cart-btn")
  → BREAKS when the site redesigns and the ID changes

AMI Vision AI Automation:
  agent.act("Click the Add to Cart button")
  → WORKS regardless of page layout changes — the AI sees the button visually
```

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vision AI Element Pipeline                    │
│                                                                  │
│  1. Capture viewport screenshot (PNG)                            │
│     ↓                                                            │
│  2. Run DOM accessibility tree extraction (parallel)             │
│     ↓                                                            │
│  3. Send screenshot + accessibility tree + user prompt to LLM    │
│     ↓                                                            │
│  4. LLM returns: { element_id, action, coordinates, confidence } │
│     ↓                                                            │
│  5. Execute action via CDP on the identified element             │
│     ↓                                                            │
│  6. Capture post-action screenshot for verification              │
│     ↓                                                            │
│  7. LLM verifies action succeeded → next step or retry          │
└─────────────────────────────────────────────────────────────────┘
```

**Three interaction modes (configurable per automation):**

| Mode | Description | Use Case |
|------|-------------|----------|
| **Vision-First** | Always use Vision LLM to locate elements | Unknown/dynamic sites |
| **Selector-First + AI Fallback** | Try CSS/XPath first, fall back to Vision AI if selector fails | Known sites with stable selectors |
| **Hybrid** | Use accessibility tree + Vision LLM together for maximum accuracy | Complex SPAs, shadow DOM |

**Implementation:**

```cpp
// New class: VisionElementLocator
// chrome/browser/automation/vision_element_locator.h
class VisionElementLocator {
 public:
  struct ElementTarget {
    int dom_node_id;
    gfx::Rect bounding_box;
    std::string element_role;        // "button", "input", "link", etc.
    std::string accessible_name;
    float confidence;                // 0.0 - 1.0
  };

  // Locate an element using natural language description
  // Captures screenshot + accessibility tree, sends to LLM
  void LocateElement(
      content::WebContents* contents,
      const std::string& natural_language_description,
      base::OnceCallback<void(ElementTarget)> callback);

  // Verify an action was performed correctly
  // Captures post-action screenshot, asks LLM to confirm
  void VerifyAction(
      content::WebContents* contents,
      const std::string& expected_outcome,
      base::OnceCallback<void(bool success, std::string reason)> callback);

 private:
  // Screenshot capture at optimal resolution for LLM
  void CaptureViewport(content::WebContents* contents, int max_width = 1280);

  // Extract accessibility tree with element positions
  void ExtractAccessibilityTree(content::WebContents* contents);

  // Build the LLM prompt with screenshot + tree + instruction
  std::string BuildVisionPrompt(
      const std::string& screenshot_base64,
      const std::string& accessibility_tree_json,
      const std::string& user_instruction);
};
```

**LLM Provider Configuration:**

```json
// In chrome://settings/ami/automations → Vision AI
{
  "vision_llm": {
    "provider": "openai",           // or "anthropic", "gemini", "ollama", "openrouter"
    "model": "gpt-4o",             // or "claude-sonnet-4-20250514", "gemini-2.5-flash", etc.
    "api_key_source": "ami_vault",  // Uses AMI's secure key storage
    "max_tokens": 4096,
    "temperature": 0.1,             // Low temp for deterministic element selection
    "timeout_ms": 10000
  },
  "fallback_llm": {
    "provider": "ollama",           // Local fallback if cloud is down
    "model": "llava:13b",
    "endpoint": "http://localhost:11434"
  }
}
```

### 18.8 AI Page Commands API

A high-level natural language API for browser automation — every automation uses these primitives internally. Exposed to the OpenClaw gateway, the Workflow Builder, and advanced users via the DevTools console.

**Core Commands:**

| Command | Description | Example |
|---------|-------------|---------|
| `act(prompt)` | Perform an action on the page | `act("Click the checkout button")` |
| `extract(prompt, schema)` | Extract structured data from the page | `extract("Get all product prices", {name: str, price: float})` |
| `validate(prompt)` | Check if a condition is true on the page | `validate("The order confirmation number is visible")` |
| `prompt(question, schema)` | Ask the LLM a question about the current page | `prompt("What shipping options are available?", {options: str[]})` |
| `fill(prompt)` | Fill a form using natural language | `fill("First name: John, Last name: Doe, Email: john@example.com")` |
| `navigate(prompt)` | Navigate to a page described in natural language | `navigate("Go to the returns page")` |
| `wait_for(prompt)` | Wait until a condition is visible on the page | `wait_for("The loading spinner has disappeared")` |
| `download(prompt)` | Find and download a file | `download("Download the latest invoice PDF")` |

**Gateway API (OpenClaw → Browser):**

```json
// POST http://localhost:18789/v1/automation/{session_id}/command
{
  "command": "act",
  "prompt": "Click the 'Add to Cart' button for the first search result",
  "options": {
    "interaction_mode": "vision_first",
    "screenshot_before": true,
    "screenshot_after": true,
    "max_retries": 3,
    "timeout_ms": 15000
  }
}

// Response
{
  "success": true,
  "action_performed": "Clicked button element #product-1-add-to-cart",
  "confidence": 0.94,
  "screenshot_after": "data:image/jpeg;base64,...",
  "duration_ms": 2340
}
```

**Extract command with JSON schema:**

```json
// POST http://localhost:18789/v1/automation/{session_id}/command
{
  "command": "extract",
  "prompt": "Extract all products from the search results",
  "schema": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "price": { "type": "number" },
        "rating": { "type": "number" },
        "prime": { "type": "boolean" },
        "url": { "type": "string" }
      }
    }
  }
}

// Response
{
  "success": true,
  "data": [
    { "name": "Duracell AA 48-pack", "price": 12.99, "rating": 4.7, "prime": true, "url": "..." },
    { "name": "Amazon Basics AA 72-pack", "price": 18.49, "rating": 4.5, "prime": true, "url": "..." },
    { "name": "Energizer AA 24-pack", "price": 8.99, "rating": 4.6, "prime": true, "url": "..." }
  ],
  "confidence": 0.91,
  "elements_found": 3
}
```

### 18.9 Workflow Builder — Visual Block System

> A drag-and-drop workflow builder at `chrome-untrusted://workflow-builder/` that lets users chain automation steps into reusable, schedulable workflows — without writing code. Similar to Skyvern's workflow system but with a visual editor native to the browser.

**Block Types:**

| Block | Icon | Description |
|-------|------|-------------|
| **Browser Action** | 🖱️ | Execute an `act()` command — click, type, scroll, hover |
| **Data Extraction** | 📊 | Extract structured data from a page using `extract()` + JSON schema |
| **Validation** | ✅ | Assert a condition is true using `validate()` — branch on result |
| **Navigation** | 🧭 | Navigate to a URL or use `navigate(prompt)` for AI-driven navigation |
| **Form Fill** | 📝 | Fill a form using `fill(prompt)` with structured input data |
| **File Download** | 📥 | Download files from a page, auto-upload to cloud storage |
| **For Loop** | 🔁 | Iterate over a list (from extraction, CSV, or parameter) |
| **Conditional** | 🔀 | If/else branching based on validation result or extracted data |
| **HTTP Request** | 🌐 | Make an API call (GET/POST/PUT/DELETE) — chain with other blocks |
| **Code Block** | 💻 | Run custom JavaScript in a sandboxed V8 isolate |
| **Wait / Delay** | ⏳ | Wait for a condition, a fixed time, or a page load |
| **Email / Notify** | 📧 | Send an email or browser notification with results |
| **Text Prompt** | 💬 | Pause workflow and ask the user a question via sidebar chat |
| **File Parse** | 📄 | Parse CSV, JSON, or Excel file as input data for the workflow |
| **Upload to Storage** | ☁️ | Upload files/data to S3, GCS, or local filesystem |

**Visual Workflow Editor:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ◀ ▶ 🔄  ┃  🔧 Workflow Builder — "Weekly Shopify Export"          ─ □ ✕       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─── Block Palette ──┐  ┌─── Workflow Canvas ──────────────────────────────┐   │
│  │                    │  │                                                   │   │
│  │  🖱️ Browser Action │  │  ┌─────────────────────┐                         │   │
│  │  📊 Data Extract   │  │  │ 🧭 Navigate          │                         │   │
│  │  ✅ Validation     │  │  │ URL: shopify.com/     │                         │   │
│  │  🧭 Navigation     │  │  │ admin/orders          │                         │   │
│  │  📝 Form Fill      │  │  └──────────┬────────────┘                         │   │
│  │  📥 File Download  │  │             │                                      │   │
│  │  🔁 For Loop       │  │  ┌──────────▼────────────┐                         │   │
│  │  🔀 Conditional    │  │  │ 📊 Extract Orders     │                         │   │
│  │  🌐 HTTP Request   │  │  │ Schema: {order_id,    │                         │   │
│  │  💻 Code Block     │  │  │  customer, total,     │                         │   │
│  │  ⏳ Wait / Delay   │  │  │  status, date}        │                         │   │
│  │  📧 Email/Notify   │  │  └──────────┬────────────┘                         │   │
│  │  💬 Text Prompt    │  │             │                                      │   │
│  │  📄 File Parse     │  │  ┌──────────▼────────────┐                         │   │
│  │  ☁️ Upload Storage │  │  │ 🔀 Conditional        │                         │   │
│  │                    │  │  │ IF orders.length > 0   │                         │   │
│  │  ─── Variables ──  │  │  └───┬──────────────┬─────┘                         │   │
│  │  $orders (array)   │  │      │ YES          │ NO                            │   │
│  │  $today (string)   │  │  ┌───▼──────────┐ ┌─▼──────────┐                   │   │
│  │  $export_path      │  │  │ 💻 Code      │ │ 📧 Notify  │                   │   │
│  │                    │  │  │ Convert to   │ │ "No orders │                   │   │
│  └────────────────────┘  │  │ CSV format   │ │  today"    │                   │   │
│                          │  └──────┬───────┘ └────────────┘                   │   │
│                          │         │                                           │   │
│                          │  ┌──────▼───────────┐                               │   │
│                          │  │ ☁️ Upload to S3   │                               │   │
│                          │  │ Path: exports/    │                               │   │
│                          │  │ {$today}.csv      │                               │   │
│                          │  └──────┬───────────┘                               │   │
│                          │         │                                           │   │
│                          │  ┌──────▼───────────┐                               │   │
│                          │  │ 📧 Email Report  │                               │   │
│                          │  │ To: team@co.com  │                               │   │
│                          │  │ "Export complete" │                               │   │
│                          │  └──────────────────┘                               │   │
│                          └──────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─── Properties Panel ─────────────────────────────────────────────────────┐   │
│  │  Block: Data Extraction          Block ID: extract_orders                │   │
│  │  Prompt: "Extract all orders from today's order list page"               │   │
│  │  Output Variable: $orders                                                │   │
│  │  Schema: { order_id: string, customer: string, total: number, ... }      │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  [💾 Save] [▶️ Run Now] [⏰ Schedule] [📤 Export JSON] [📥 Import]              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Workflow Data Model:**

```json
// Stored in IndexedDB (browser-local) and optionally synced
{
  "workflow_id": "wf_shopify_export",
  "name": "Weekly Shopify Export",
  "description": "Extract this week's orders and upload CSV to S3",
  "version": 3,
  "created": "2025-01-15T10:00:00Z",
  "schedule": { "cron": "0 18 * * 5", "timezone": "Europe/Berlin" },
  "parameters": [
    { "name": "date_range", "type": "string", "default": "this_week" }
  ],
  "blocks": [
    {
      "id": "nav_1",
      "type": "navigation",
      "config": { "url": "https://admin.shopify.com/orders" }
    },
    {
      "id": "extract_orders",
      "type": "data_extraction",
      "config": {
        "prompt": "Extract all orders from today's order list",
        "schema": { "type": "array", "items": { "..." : "..." } },
        "output_variable": "$orders"
      }
    },
    {
      "id": "check_orders",
      "type": "conditional",
      "config": {
        "condition": "$orders.length > 0",
        "true_branch": "convert_csv",
        "false_branch": "notify_empty"
      }
    }
  ]
}
```

**Implementation:**

```cpp
// chrome/browser/automation/workflow_engine.h
class WorkflowEngine {
 public:
  // Load and execute a saved workflow
  void RunWorkflow(
      const std::string& workflow_id,
      const base::Value::Dict& parameters,
      base::OnceCallback<void(WorkflowResult)> on_complete);

  // Pause/resume/cancel a running workflow
  void PauseWorkflow(const std::string& run_id);
  void ResumeWorkflow(const std::string& run_id);
  void CancelWorkflow(const std::string& run_id);

  // Get execution state for Mission Control
  WorkflowRunState GetRunState(const std::string& run_id) const;

 private:
  // Execute a single block and advance to the next
  void ExecuteBlock(WorkflowRunContext* ctx, const WorkflowBlock& block);

  // Block executors — one per block type
  void ExecuteNavigationBlock(WorkflowRunContext* ctx, const NavigationConfig& config);
  void ExecuteExtractionBlock(WorkflowRunContext* ctx, const ExtractionConfig& config);
  void ExecuteConditionalBlock(WorkflowRunContext* ctx, const ConditionalConfig& config);
  void ExecuteForLoopBlock(WorkflowRunContext* ctx, const LoopConfig& config);
  void ExecuteCodeBlock(WorkflowRunContext* ctx, const CodeConfig& config);
  void ExecuteHttpBlock(WorkflowRunContext* ctx, const HttpConfig& config);
  // ... one for each block type

  base::flat_map<std::string, std::unique_ptr<WorkflowRunContext>> active_runs_;
};
```

### 18.10 Structured Data Extraction

> Extract structured, typed data from any web page using a JSON schema definition. The Vision AI reads the page and returns clean, validated data — ready for export, API calls, or piping into the next workflow block.

**Use cases:**
- Scrape product listings from e-commerce sites → JSON/CSV
- Extract invoice line items from billing portals → accounting software
- Pull job postings from career pages → applicant tracking system
- Gather competitor pricing → spreadsheet

**Extraction flow:**

```
User defines schema:
{
  "products": [{
    "name": "string",
    "price": "number",
    "in_stock": "boolean",
    "url": "string"
  }]
}

                    ┌──────────────────┐
  Screenshot +      │   Vision LLM     │      Structured JSON
  Accessibility  →  │  (GPT-4o /       │  →  matching the schema
  Tree + Schema     │   Claude Sonnet)  │      + confidence scores
                    └──────────────────┘

Output:
{
  "products": [
    { "name": "Widget A", "price": 29.99, "in_stock": true, "url": "/products/a" },
    { "name": "Widget B", "price": 19.99, "in_stock": false, "url": "/products/b" }
  ],
  "_meta": {
    "confidence": 0.93,
    "elements_scanned": 47,
    "extraction_time_ms": 1820
  }
}
```

**Pagination support:**

The extraction engine automatically detects and follows pagination:

```json
// Extraction config with pagination
{
  "command": "extract",
  "prompt": "Extract all job postings",
  "schema": { "..." : "..." },
  "pagination": {
    "strategy": "auto",              // AI detects "Next" button
    "max_pages": 10,                 // Safety limit
    "delay_between_pages_ms": 2000   // Polite crawling
  }
}
```

**Export formats:**
- JSON (default)
- CSV
- Excel (.xlsx)
- Clipboard (paste into any app)
- Direct to Connected App (Google Sheets, Notion, Airtable via §16 OAuth)

### 18.11 Cron Scheduling — Recurring Automations

> Schedule any automation or workflow to run on a repeating schedule. Natural language scheduling ("Every Monday at 9 AM") or cron expressions for power users.

**User Experience:**

```
User: "Every Friday at 6 PM, export this week's Shopify orders to a CSV and email it to me"

AMI: Got it! I've created a scheduled workflow:
  📋 Weekly Shopify Export
  ⏰ Every Friday at 18:00 (Europe/Berlin)
  📧 Results emailed to you@company.com

  [View in Scheduler] [Edit Workflow] [Run Now]
```

**Scheduler UI** at `chrome://settings/ami/scheduler`:

```
┌───────────────────────────────────────────────────────────────────┐
│ AMI Scheduler                                    [+ New Schedule] │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Active Schedules ─────────────────────────────────────────┐   │
│  │                                                             │   │
│  │  📋 Weekly Shopify Export              Every Fri 18:00      │   │
│  │     Last run: Jan 10, 2025 — ✅ Success (47 orders)        │   │
│  │     Next run: Jan 17, 2025 at 18:00                        │   │
│  │     [Edit] [Run Now] [Pause] [Delete]                      │   │
│  │                                                             │   │
│  │  📋 Daily SAP Inbox Check              Every day 09:00      │   │
│  │     Last run: Today 09:00 — ✅ Success (3 new messages)    │   │
│  │     Next run: Tomorrow 09:00                               │   │
│  │     [Edit] [Run Now] [Pause] [Delete]                      │   │
│  │                                                             │   │
│  │  📋 LinkedIn Job Alert Scrape          Mon/Wed/Fri 12:00   │   │
│  │     Last run: Jan 13, 2025 — ⚠️ Partial (CAPTCHA on p3)   │   │
│  │     Next run: Jan 15, 2025 at 12:00                        │   │
│  │     [Edit] [Run Now] [Pause] [Delete]                      │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Run History ──────────────────────────────────────────────┐   │
│  │  Jan 13 12:00  LinkedIn Scrape     ⚠️ Partial  23 jobs     │   │
│  │  Jan 13 09:00  SAP Inbox Check     ✅ Success  3 msgs      │   │
│  │  Jan 10 18:00  Shopify Export      ✅ Success  47 orders   │   │
│  │  Jan 10 12:00  LinkedIn Scrape     ✅ Success  31 jobs     │   │
│  │  Jan 10 09:00  SAP Inbox Check     ✅ Success  0 msgs      │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

**Architecture:**

```cpp
// chrome/browser/automation/automation_scheduler.h
class AutomationScheduler {
 public:
  struct ScheduleEntry {
    std::string schedule_id;
    std::string workflow_id;         // Which workflow to run
    std::string cron_expression;     // "0 18 * * 5" = Fridays at 18:00
    std::string timezone;            // IANA timezone
    bool enabled;
    base::Time next_run;
    base::Time last_run;
    ScheduleRunResult last_result;
  };

  // Create a new scheduled automation
  std::string CreateSchedule(
      const std::string& workflow_id,
      const std::string& cron_expression,
      const std::string& timezone);

  // Natural language → cron conversion (via LLM)
  std::string ParseNaturalLanguageSchedule(
      const std::string& natural_language);
  // "Every weekday at 9 AM" → "0 9 * * 1-5"

  // Lifecycle
  void EnableSchedule(const std::string& schedule_id);
  void DisableSchedule(const std::string& schedule_id);
  void DeleteSchedule(const std::string& schedule_id);
  void TriggerNow(const std::string& schedule_id);

 private:
  // Timer that fires at the next scheduled time
  void OnScheduleTimerFired();
  void ComputeNextRunTimes();

  // Persisted to Preferences (survives browser restart)
  std::vector<ScheduleEntry> schedules_;
  base::OneShotTimer next_fire_timer_;
};
```

**Behavior rules:**
- Schedules persist across browser restarts (stored in Preferences)
- If the browser is closed when a schedule fires, it runs on next launch with a "missed schedule" flag
- Scheduled automations show in Mission Control with a 🕐 badge
- `chrome://settings/ami/scheduler` shows all schedules, run history, and next-run times
- Natural language scheduling powered by the same LLM used for chat — "every other Tuesday at 3 PM" just works

### 18.12 AI-Powered Form Filling

> Fill any web form from a natural language description or structured data. The Vision AI identifies form fields, understands their purpose, and fills them intelligently — handling dropdowns, date pickers, checkboxes, radio buttons, and multi-step forms.

**Examples:**

```
act("Fill the job application form with: Name: John Doe, Email: john@example.com,
     Phone: +1-555-0123, Position: Senior Engineer, Start date: Next Monday,
     Salary expectation: $150,000, Cover letter: I'm excited about this role
     because of my 8 years of experience in distributed systems...")

→ AI identifies each field by looking at the form
→ Fills text inputs, selects dropdowns, picks dates, writes multiline text
→ Handles validation errors (re-fills if the form shows an error)
→ Supports multi-page forms (clicks "Next" and continues filling)
```

**How field matching works:**

```
┌─────────────────────────────────────────────────────────┐
│              Form Field Matching Pipeline                 │
│                                                          │
│  1. Screenshot form area                                 │
│  2. Extract DOM form elements + labels + placeholders    │
│  3. Build field inventory:                               │
│     [                                                    │
│       { "field": "input#email", "label": "Email",        │
│         "type": "email", "placeholder": "you@..." },     │
│       { "field": "select#country", "label": "Country",   │
│         "type": "select", "options": ["US","UK",...] },   │
│       { "field": "input#start_date", "label": "Start",   │
│         "type": "date" }                                  │
│     ]                                                    │
│  4. Send field inventory + user's data to LLM            │
│  5. LLM returns mapping:                                 │
│     { "input#email": "john@example.com",                 │
│       "select#country": "US",                            │
│       "input#start_date": "2025-01-20" }                 │
│  6. Execute fills via CDP (type, select, datepicker)     │
│  7. Verify filled values match expected                  │
└─────────────────────────────────────────────────────────┘
```

### 18.13 Authentication & 2FA Automation

> Automate login flows including two-factor authentication. AMI can handle TOTP codes, integrate with password managers, and manage session cookies — so scheduled automations can log into sites unattended.

**Supported auth methods:**

| Method | How AMI Handles It |
|--------|-------------------|
| **Username/Password** | Stored in AMI's encrypted credential vault or pulled from password manager |
| **TOTP (Authenticator)** | Built-in TOTP generator — stores the secret key, generates codes automatically |
| **Email 2FA** | Connects to user's email (via Connected Apps §16), reads the code, enters it |
| **SMS 2FA** | Reads from Android Messages for Web or prompts user via notification |
| **QR Code 2FA** | Captures QR, decodes, processes — or prompts user to scan on phone |
| **Security Questions** | Stored answers in credential vault, matched to questions by LLM |

**Password Manager Integrations:**

```
┌──────────────────────────────────────────────────────┐
│         AMI Credential Resolution Pipeline            │
│                                                       │
│  Automation needs to log into: shopify.com            │
│                                                       │
│  1. Check AMI Credential Vault (built-in, encrypted)  │
│     → Found? Use it.                                  │
│                                                       │
│  2. Check password manager integration:               │
│     ├── Bitwarden (via CLI / API)                     │
│     ├── 1Password (via CLI / Connect API)             │
│     ├── LastPass (via CLI)                             │
│     └── Custom HTTP API (user-defined endpoint)       │
│     → Found? Use it.                                  │
│                                                       │
│  3. Check browser's built-in password manager         │
│     (chrome://password-manager/)                      │
│     → Found? Use it.                                  │
│                                                       │
│  4. None found → Pause automation, ask user to log in │
│     manually via "Jump to tab" (§18.4J)               │
└──────────────────────────────────────────────────────┘
```

**Built-in TOTP Generator:**

```cpp
// chrome/browser/automation/totp_generator.h
class TotpGenerator {
 public:
  // Store a TOTP secret for a site (encrypted at rest)
  void StoreSecret(const std::string& site_domain,
                   const std::string& secret_base32,
                   int period_seconds = 30,
                   int digits = 6);

  // Generate current TOTP code
  std::string GenerateCode(const std::string& site_domain) const;

  // Import from QR code image (otpauth:// URI)
  bool ImportFromQrImage(const SkBitmap& qr_image);

  // Import from otpauth:// URI directly
  bool ImportFromUri(const std::string& otpauth_uri);
};
```

**Session persistence:**

Automation sessions can reuse existing login sessions (cookies) so the agent doesn't need to log in every time:

```cpp
// chrome/browser/automation/session_manager.h
class AutomationSessionManager {
 public:
  // Check if we have a valid session for a domain
  bool HasValidSession(const std::string& domain) const;

  // Save session cookies after successful login
  void PersistSession(const std::string& domain,
                      const net::CookieList& cookies);

  // Restore session cookies before automation starts
  void RestoreSession(const std::string& domain,
                      content::WebContents* contents);

  // Clear sessions (user privacy control)
  void ClearAllSessions();
  void ClearSession(const std::string& domain);
};
```

### 18.14 Observer Mode — Watch & Learn

> The user performs a task manually while AMI watches, records every action, and auto-generates a reusable workflow. Like a macro recorder, but intelligent — it understands intent, not just clicks.

**User Experience:**

```
User: "Watch me do this export process, then repeat it every week"

AMI: 🔴 Recording... I'm watching your actions. Do the export as you normally would.

[User navigates to Shopify → Orders → filters by date → clicks Export → selects CSV → downloads]

AMI: ✅ Got it! I recorded 6 steps. Here's the workflow I generated:

  1. 🧭 Navigate to shopify.com/admin/orders
  2. 🖱️ Click "Date range" filter, select "This week"
  3. 🖱️ Click "Export" button
  4. 🖱️ Select "CSV for Excel" format
  5. 🖱️ Click "Export orders"
  6. 📥 Download the CSV file

  [▶️ Run Now] [✏️ Edit Workflow] [⏰ Schedule Weekly] [💾 Save]
```

**Architecture:**

```
┌────────────────────────────────────────────────────────────┐
│               Observer Mode Pipeline                        │
│                                                             │
│  1. Content script injects action listeners:                │
│     - Click, input, select, scroll, navigation events       │
│     - Form submissions, file uploads/downloads              │
│     - Page load events with URL changes                     │
│                                                             │
│  2. Each action is recorded with context:                   │
│     {                                                       │
│       "action": "click",                                    │
│       "timestamp": "2025-01-15T10:05:23Z",                  │
│       "url": "https://admin.shopify.com/orders",            │
│       "element": {                                          │
│         "tag": "button",                                    │
│         "text": "Export",                                   │
│         "selector": "#export-btn",                          │
│         "accessible_name": "Export orders",                 │
│         "bounding_box": { "x": 450, "y": 120, "w": 80 }   │
│       },                                                    │
│       "screenshot": "base64..."                             │
│     }                                                       │
│                                                             │
│  3. LLM analyzes the action sequence:                       │
│     - Identifies intent (not just raw clicks)               │
│     - Generalizes selectors (uses accessible names,         │
│       not brittle CSS IDs)                                  │
│     - Detects patterns (loops, conditionals)                │
│     - Generates a Workflow (§18.9 block format)             │
│                                                             │
│  4. User reviews, edits, and saves the workflow             │
└────────────────────────────────────────────────────────────┘
```

**Key intelligence features:**
- **Intent detection:** If the user clicks 3 similar items in a list, the AI understands "iterate over all items" — not "click these 3 specific elements"
- **Generalized selectors:** Uses accessible names and semantic roles instead of brittle `#id` or `.class` selectors
- **Smart wait insertion:** Detects when the user paused (waiting for a page to load) and inserts appropriate `wait_for()` blocks
- **Variable extraction:** If the user copies a value from one page and pastes it on another, the AI creates a variable to pass data between steps

### 18.15 Prompt Caching & Action Memory

> Cache LLM responses for repeated page patterns to reduce cost and increase speed. When the agent visits the same type of page again, it recalls what worked before instead of re-analyzing from scratch.

**How it works:**

```
First visit to Amazon search results page:
  → Full Vision LLM analysis: 2.1s, 4096 tokens, ~$0.03
  → Agent learns: "Add to Cart" button location pattern, price element structure,
    product card layout, pagination controls

Subsequent visits to Amazon search results:
  → Cache hit! Reuse element mapping: 0.1s, 0 tokens, $0.00
  → Only re-analyze if confidence drops below threshold (layout changed)
```

**Cache architecture:**

```cpp
// chrome/browser/automation/action_memory.h
class ActionMemory {
 public:
  struct PagePattern {
    std::string domain;
    std::string page_type_hash;        // Hash of page structure (DOM shape)
    std::string accessibility_tree_hash;
    base::Time last_used;
    int use_count;

    // Cached element mappings
    base::flat_map<std::string, ElementMapping> element_cache;
    // "Add to Cart button" → { selector: "...", bbox: {...}, confidence: 0.95 }
  };

  // Look up cached element mapping for a page + intent
  std::optional<ElementMapping> LookupElement(
      const std::string& domain,
      const std::string& page_structure_hash,
      const std::string& element_description) const;

  // Store a successful mapping for future reuse
  void CacheElement(
      const std::string& domain,
      const std::string& page_structure_hash,
      const std::string& element_description,
      const ElementMapping& mapping);

  // Invalidate cache for a domain (e.g., after site redesign detected)
  void InvalidateCache(const std::string& domain);

  // Stats for user transparency
  ActionMemoryStats GetStats() const;
  // { cache_hits: 1247, cache_misses: 89, tokens_saved: 421000, cost_saved: $12.63 }

 private:
  // Persisted to LevelDB — survives browser restarts
  std::unique_ptr<leveldb::DB> cache_db_;

  // Max cache entries per domain (LRU eviction)
  static constexpr int kMaxEntriesPerDomain = 500;
};
```

**Cost savings display in Mission Control:**

```
┌───────────────────────────────────────────┐
│ 🧠 Action Memory                          │
│                                           │
│ Cache hits today: 142                     │
│ Tokens saved: 58,400 (~$1.75)            │
│ Time saved: ~4.7 minutes                  │
│                                           │
│ Top cached sites:                         │
│  amazon.com — 47 hits                     │
│  shopify.com — 31 hits                    │
│  linkedin.com — 28 hits                   │
│                                           │
│ [Clear Cache] [View Details]              │
└───────────────────────────────────────────┘
```

### 18.5 Files to Create / Modify

| File | Purpose |
|------|---------|
| **New:** `chrome/browser/automation/automation_tab_manager.h/.cc` | Singleton managing all automation tabs |
| **New:** `chrome/browser/automation/automation_session.h/.cc` | Per-task session state, progress, lifecycle |
| **New:** `chrome/browser/automation/automation_resource_governor.h/.cc` | CPU/memory/FPS resource management |
| **New:** `chrome/browser/automation/vision_element_locator.h/.cc` | Vision LLM-based element identification |
| **New:** `chrome/browser/automation/page_commands.h/.cc` | AI page commands API (act, extract, validate, fill, etc.) |
| **New:** `chrome/browser/automation/workflow_engine.h/.cc` | Workflow execution engine — block runner + state machine |
| **New:** `chrome/browser/automation/automation_scheduler.h/.cc` | Cron scheduling service — recurring automations |
| **New:** `chrome/browser/automation/totp_generator.h/.cc` | Built-in TOTP code generator for 2FA automation |
| **New:** `chrome/browser/automation/session_manager.h/.cc` | Login session persistence — cookie save/restore |
| **New:** `chrome/browser/automation/action_memory.h/.cc` | Prompt cache — LevelDB store for page pattern memory |
| **New:** `chrome/browser/automation/observer_recorder.h/.cc` | Observer mode — action recording + workflow generation |
| **New:** `chrome/browser/automation/form_filler.h/.cc` | AI form filling — field matching + multi-step forms |
| **New:** `chrome/browser/automation/data_extractor.h/.cc` | Structured data extraction with pagination + schema |
| **New:** `chrome/browser/ui/webui/mission_control/mission_control_ui.h/.cc` | WebUI controller for Mission Control |
| **New:** `chrome/browser/ui/webui/mission_control/mission_control.mojom` | Mojo IPC for frame streaming + controls |
| **New:** `chrome/browser/ui/webui/workflow_builder/workflow_builder_ui.h/.cc` | WebUI controller for Workflow Builder |
| **New:** `chrome/browser/resources/mission_control/` | HTML/TS/CSS for Mission Control page |
| **New:** `chrome/browser/resources/workflow_builder/` | HTML/TS/CSS for Workflow Builder drag-and-drop editor |
| **Modify:** `chrome/browser/ui/tabs/tab_strip_model.cc` | Automation tab type tracking |
| **Modify:** `chrome/browser/ui/views/tabs/tab.cc` | Automation indicator badge/ring |
| **Modify:** `content/browser/renderer_host/render_widget_host_impl.cc` | Prevent throttling for automation tabs |
| **Modify:** `chrome/browser/ui/webui/chrome_web_ui_configs.cc` | Register `mission-control` + `workflow-builder` WebUIs |
| **Modify:** `chrome/browser/preferences/` | Scheduler persistence + credential vault storage |
| **Modify:** Sidebar WebUI | Compact automation status widget + Observer mode toggle |
| **Modify:** OpenClaw Gateway | Parallel session management, progress WebSocket, page commands API |

### 18.6 Effort Estimate

| Sub-task | Hours |
|----------|-------|
| AutomationTabManager + session lifecycle | 6-8h |
| Tab capture / frame streaming to WebUI | 8-12h |
| Mission Control WebUI (grid, cards, feed) | 10-14h |
| Mojo IPC (frame + progress + controls) | 4-6h |
| Background throttling exemption | 3-4h |
| Resource governor (FPS, memory, CPU) | 4-6h |
| Error handling / intervention flow | 4-6h |
| Sidebar compact status widget | 3-4h |
| Gateway parallel session management | 6-8h |
| Vision AI Element Locator + LLM integration | 10-14h |
| AI Page Commands API (act, extract, validate, fill, etc.) | 8-12h |
| Workflow Builder WebUI (drag-and-drop editor + canvas) | 16-24h |
| Workflow Engine (block executor + state machine) | 10-14h |
| Structured Data Extraction + pagination + export | 6-8h |
| Cron Scheduler service + Settings UI | 8-10h |
| AI Form Filler (field matching + multi-step) | 6-8h |
| Authentication & 2FA (TOTP generator + password manager integrations) | 8-12h |
| Observer Mode (action recorder + workflow generator) | 10-14h |
| Prompt Cache / Action Memory (LevelDB + cache logic) | 4-6h |
| **Total** | **135-192h** |

---

## 19. Session Replay & Activity Audit

> **Inspired by:** Strawberry's "activity history of every action the AI companions make"

### What it is
A complete timeline of everything the AI agent did during a session — pages visited, data extracted, forms filled, messages sent, transactions executed. The user can review, search, and export this log.

### Implementation

1. **Activity log service:**
   ```cpp
   struct AgentAction {
     base::Time timestamp;
     ActionType type;       // NAVIGATE, CLICK, FILL, EXTRACT, SEND_MESSAGE, TRANSACTION
     std::string tab_url;
     std::string description;  // "Clicked 'Submit' button on form"
     std::string result;       // "Form submitted, confirmation #12345"
     std::string screenshot;   // base64 screenshot at time of action
     ApprovalStatus approval;  // APPROVED, REJECTED, AUTO_APPROVED, NOT_REQUIRED
   };
   ```

2. **Timeline UI** at `chrome://ami-activity/`:
   ```
   ┌──────────────────────────────────────────┐
   │ Agent Activity — Today                    │
   │ [Search...] [Export CSV] [Export JSON]     │
   │                                           │
   │ 14:32 🔍 Searched LinkedIn for "VP Sales" │
   │ 14:33 📄 Opened linkedin.com/in/john-doe  │
   │ 14:33 📊 Extracted: name, title, company  │
   │ 14:34 ✅ Added to CRM (auto-approved)     │
   │ 14:35 📧 Drafted email to john@... (⏳)   │
   │ 14:35 ⚠️ Approval needed: Send email      │
   │        [Approve] [Reject] [Edit]          │
   │ 14:36 ✅ Email sent (approved by user)     │
   │                                           │
   │ [← Yesterday] [Today] [Filter by type ▾] │
   └──────────────────────────────────────────┘
   ```

3. **Retention:** Keep 30 days of activity log by default. User can change in settings.

4. **Search:** Full-text search across activity log + filter by action type, date, approval status.

**Files to modify:**
- New: `chrome/browser/ami/activity/activity_log_service.h/.cc`
- New: `chrome/browser/ui/webui/ami_activity/` — timeline WebUI
- `chrome/browser/ami/approval/approval_service.cc` — log approval outcomes

**Effort:** 10-14 hours

---

## 20. Embedded Core Extensions — Non-Removable

> **Carried from V2:** Eliminates `--load-extension` startup flags, "Developer mode" warnings, and extension URL leaks.
> **V3 upgrade:** Extensions are **deeply embedded into the binary** — users cannot remove, disable, or uninstall them. They are part of AMI Browser itself, not optional add-ons.

### What it is
AMI's core extensions (Shield, Hub, Rewards, TeachAnAgent, DevTools MCP, WebStore) must be **embedded into the Chromium binary** so they behave like built-in browser features, not removable extensions. Standard component extensions (like Chrome PDF Viewer) can still be disabled by users via `chrome://extensions`. That's not acceptable for AMI's core — if a user can remove AMI Hub or AMI Shield, the browser loses its identity and becomes a plain Chromium fork.

### Strategy: Force-Installed + Hidden from Extension Management

**Level 1 — Component Extension registration (baseline):**
Register via `ComponentLoader::Add()` so they auto-load, have no CRX packaging, and live inside the binary's resource bundle.

**Level 2 — Force-install & block uninstall:**
Hook into `ExtensionManagement` to mark AMI core extensions as `INSTALLATION_FORCED`. This prevents disable/uninstall from the UI and from `chrome.management.uninstall()` API calls.

**Level 3 — Hide from chrome://extensions UI:**
Filter AMI core extensions out of the extensions page listing entirely. Users don't need to see them — they're part of the browser, like the built-in PDF viewer or DevTools. Show them only in a dedicated "AMI Features" section in `chrome://settings` with on/off toggles for individual features (e.g. toggle ad blocking strength, but NOT a full remove/uninstall).

### Extensions to Embed

| Extension | ID | Purpose | User-Facing Control |
|-----------|----|---------|---------------------|
| AMI Shield | `ami_shield` | Ad/tracker blocking | Shield strength toggle in settings |
| AMI Hub | `ami_hub` | AI chat, integrations, skills, automations | Always on (core feature) |
| AMI WebStore | `ami_webstore` | CWS rebranding | Always on |
| AMI Rewards | `ami_rewards` | Browsing rewards + built-in wallet | Opt-in/out in settings |
| TeachAnAgent | `teachanagent` | Action recording/replay | Always on (core feature) |
| DevTools MCP | `devtools_mcp` | Browser debugging for VS Code | Toggle in Developer settings |

### Implementation

```cpp
// chrome/browser/extensions/component_loader.cc
void ComponentLoader::AddAMIExtensions() {
  Add(IDR_AMI_SHIELD_MANIFEST, base::FilePath("ami_shield"));
  Add(IDR_AMI_HUB_MANIFEST, base::FilePath("ami_hub"));
  Add(IDR_AMI_WEBSTORE_MANIFEST, base::FilePath("ami_webstore"));
  Add(IDR_AMI_REWARDS_MANIFEST, base::FilePath("ami_rewards"));
  Add(IDR_TEACHANAGENT_MANIFEST, base::FilePath("teachanagent"));
  Add(IDR_DEVTOOLS_MCP_MANIFEST, base::FilePath("devtools_mcp"));
}
```

```cpp
// chrome/browser/extensions/ami_extension_management.cc
// Block disable/uninstall for AMI core extensions
static const char* kAMICoreExtensionIds[] = {
  "ami_shield", "ami_hub", "ami_webstore",
  "ami_rewards", "teachanagent", "devtools_mcp"
};

bool IsAMICoreExtension(const std::string& extension_id) {
  for (const auto* id : kAMICoreExtensionIds) {
    if (extension_id == id) return true;
  }
  return false;
}

// Hook into ExtensionManagement::GetInstallationType()
InstallationType GetInstallationType(const std::string& id) {
  if (IsAMICoreExtension(id))
    return INSTALLATION_FORCED;  // Cannot be disabled or uninstalled
  return INSTALLATION_ALLOWED;   // Normal user extensions
}
```

```cpp
// chrome/browser/ui/webui/extensions/extensions_ui.cc
// Filter AMI core extensions from the extensions page listing
void ExtensionsUI::GetExtensionsList(/* ... */) {
  for (const auto& ext : all_extensions) {
    if (IsAMICoreExtension(ext->id()))
      continue;  // Don't show in chrome://extensions
    visible_extensions.push_back(ext);
  }
}
```

**Files to modify:**
- `chrome/browser/extensions/component_loader.cc` — register all AMI extensions
- New: `chrome/browser/extensions/ami_extension_management.cc/.h` — force-install logic + core extension ID list
- `chrome/browser/extensions/extension_management.cc` — hook `IsAMICoreExtension()` into installation type checks
- `chrome/browser/ui/webui/extensions/extensions_ui.cc` — hide AMI core from extensions page
- `chrome/browser/resources/` — place extension source in `ami_*/` subdirs
- `chrome/browser/resources/component_extension_resources.grd` — register resources
- `chrome/browser/extensions/extension_install_prompt.cc` — suppress warnings for component extensions

**Effort:** 6-10 hours

---

## 21. Default Settings & Privacy Hardening

### GN Build Args
```gn
# args.gn for AMI Browser V3
enable_reporting = false
safe_browsing_mode = 0
enable_hangout_services_extension = false
enable_gcm_driver = false
google_api_key = ""
google_default_client_id = ""
google_default_client_secret = ""
proprietary_codecs = true
ffmpeg_branding = "Chrome"
enable_nacl = false
enable_widevine = true
use_official_google_api_keys = false
is_official_build = true
is_debug = false
symbol_level = 0
```

### Privacy Defaults (Compile-Time)

| Setting | AMI V3 Default | Chrome | Brave | Edge |
|---------|---------------|--------|-------|------|
| Third-party cookies | **Blocked** | Allowed | Blocked | Allowed |
| Do Not Track | **Enabled** | Disabled | Disabled | Disabled |
| WebRTC IP leak | **Prevented** | Exposed | Prevented | Exposed |
| Fingerprinting | **Aggressive** | None | Standard | None |
| Idle Detection API | **Disabled** | Enabled | Disabled | Enabled |
| Battery Status API | **Disabled** | Enabled | Enabled | Enabled |
| navigator.connection | **Disabled** | Enabled | Enabled | Enabled |
| Bounce tracking | **Blocked** | Partial | Blocked | Allowed |
| Safe Browsing | **Local lists** | Google | Local | Google |
| UMA/UKM telemetry | **Disabled** | Enabled | Disabled | Enabled |
| Prediction service | **Disabled** | Enabled | Disabled | Enabled |
| Spelling service | **Local only** | Google | Local | Google |
| Translation | **Local only** | Google | N/A | Google |

### Default Search Engine
- **DuckDuckGo** as default in omnibox (not just Hub)
- Modify `components/search_engines/template_url_prepopulate_data.cc`

**Files to modify:**
- `chrome/browser/prefs/browser_prefs.cc` — set all privacy defaults
- `components/search_engines/template_url_prepopulate_data.cc` — DuckDuckGo first
- `chrome/browser/metrics/` — disable telemetry
- `out/Release/args.gn` — build args

**Effort:** 2-3 hours

---

## 22. AMI Visual Identity — UI/UX Hardcoded Overhaul

> **Goal:** Make AMI Browser instantly recognizable — it should feel like its own product, not a Chrome reskin. Strawberry achieves this by rewriting 100% of their chrome UI in Svelte. AMI achieves it by modifying Chromium's native C++ views layer + custom WebUI pages + CSS overrides across all internal chrome:// pages.

### 22.1 Color Palette & Theme System

```
Toolbar background:     #1a1a2e (dark navy)
Active tab:             #16213e (slightly lighter navy)
Inactive tab:           #0f0f23 (darker)
Accent color:           #7c3aed (AMI purple)
Accent hover:           #6d28d9
Text primary:           #e2e8f0
Text secondary:         #94a3b8
Border/divider:         #2d2d4a
URL bar background:     #0f0f23
URL bar focus ring:     #7c3aed
NTP background:         linear-gradient(135deg, #0f0f23, #1a1a2e)
Tab indicator (active): #7c3aed (purple underline)
Shield badge:           #ef4444 (red for block count)
Notification dot:       #7c3aed
Success:                #22c55e
Warning:                #f59e0b
Error:                  #ef4444
Surface elevated:       #1e1e3a (cards, dropdowns, modals)
Scrollbar track:        transparent
Scrollbar thumb:        rgba(124, 58, 237, 0.3) → rgba(124, 58, 237, 0.6) on hover
```

**Light mode variant** (user toggle):
```
Toolbar background:     #f8f7ff
Active tab:             #ffffff
Inactive tab:           #f0eef5
Accent color:           #7c3aed (same purple)
Text primary:           #1a1a2e
Text secondary:         #64748b
Border/divider:         #e2e0ee
URL bar background:     #ffffff
Surface elevated:       #ffffff
```

**Files:**
- `chrome/browser/themes/theme_properties.cc` — default colors
- `chrome/browser/ui/color/chrome_color_id.h` — register AMI color tokens
- New: `chrome/browser/resources/theme/ami/` — theme assets (icons, gradients)

---

### 22.2 Tab Strip — Rounded, Pill-Shaped Tabs

Chrome's default tabs have angled trapezoid shapes. AMI tabs should be **rounded pill shapes** with a slight gap between them — closer to Arc/Strawberry's cleaner aesthetic.

**Visual:**
```
Chrome default:    /‾‾‾‾‾‾‾\     /‾‾‾‾‾‾‾\
                  /         \   /         \
AMI V3:           ╭─────────╮  ╭─────────╮  ╭─────────╮
                  │ Tab One │  │ Tab Two │  │  Tab 3  │
                  ╰─────────╯  ╰─────────╯  ╰─────────╯
```

**Implementation:**
- Override `TabStyle::GetContentsRect()` + `TabStyle::PaintTab()` in `chrome/browser/ui/views/tabs/tab_style_views.cc`
- Set corner radius to `8px` for all tab shapes
- Add `2px` gap between tabs instead of Chrome's overlapping tabs
- Active tab: slightly elevated with subtle shadow (`0 1px 4px rgba(0,0,0,0.2)`)
- Active tab underline: `2px` purple bar at bottom

**Files:**
- `chrome/browser/ui/views/tabs/tab_style_views.cc` — tab painting, corner radius
- `chrome/browser/ui/views/tabs/tab_strip.cc` — tab spacing, gap logic
- `chrome/browser/ui/views/tabs/tab.cc` — shadow, elevation on active

**Effort:** 4-6 hours

---

### 22.3 Tab Strip — Close Button & Hover Effects

- **Close button:** only appears on hover (not permanently visible like Chrome). Uses a subtle `×` that fades in with `150ms` ease-in
- **Hover state:** tab background lightens slightly (`#1e1e3a`), smooth `120ms` transition
- **Tab loading indicator:** replace Chrome's spinning circle with a smooth purple gradient bar at the bottom of the tab (similar to Strawberry's sleek loading)
- **Tab audio indicator:** custom purple speaker icon (not Chrome's default gray)
- **Favicon scaling:** on hover, favicon scales up slightly (`1.05x`) with a `100ms` ease

**Files:**
- `chrome/browser/ui/views/tabs/tab.cc` — hover paint, close button visibility
- `chrome/browser/ui/views/tabs/tab_close_button.cc` — fade-in animation
- `chrome/browser/ui/views/tabs/tab_icon.cc` — loading bar, audio icon, favicon hover

---

### 22.4 Omnibox / URL Bar — Floating & Rounded

Chrome's URL bar is flush with the toolbar. AMI's should feel **floating** — like a search input on a modern web app.

**Visual:**
```
Chrome:   ┌──────────────────────────────────────────────┐
          │ https://example.com                           │
          └──────────────────────────────────────────────┘

AMI V3:       ╭──────────────────────────────────────╮
              │  🔒 example.com                       │
              ╰──────────────────────────────────────╯
```

**Changes:**
- Corner radius: `12px` (fully rounded pill shape)
- Add `4px` vertical margin top/bottom to separate from toolbar edges
- Add `8px` horizontal margin left/right
- Background: `#0f0f23` (darker than toolbar)
- On focus: border glows purple with `box-shadow: 0 0 0 2px #7c3aed`
- URL display: domain in **white**, path in **muted gray** (no full URL clutter until clicked)
- Slim down URL bar height by `4px` to feel more compact
- Lock icon: custom AMI padlock (purple tinted) instead of Chrome's gray one
- Omnibox dropdown (autocomplete): dark themed with rounded corners (`8px`), subtle shadow, no harsh borders

**Files:**
- `chrome/browser/ui/views/location_bar/location_bar_view.cc` — border radius, margins, background
- `chrome/browser/ui/views/omnibox/omnibox_view_views.cc` — text styling, URL display
- `chrome/browser/ui/views/omnibox/omnibox_popup_view_webui.cc` — dropdown styling
- `chrome/browser/ui/views/location_bar/icon_label_bubble_view.cc` — padlock icon

**Effort:** 4-6 hours

---

### 22.5 Toolbar — Compact & Minimal

Chrome's toolbar is tall and has lots of visual noise. AMI should feel minimal and compact.

**Changes:**
- Reduce toolbar height from `34px` to `30px`
- Remove the border/line between toolbar and content area — use a subtle shadow instead
- Navigation buttons (back, forward, reload): use thin-line icons instead of Chrome's chunky filled icons
- Custom icon set: all toolbar icons use consistent `1.5px` stroke-weight line style (like Lucide/Feather icons)
- Hover state on all toolbar buttons: `4px` rounded background highlight with purple tint
- Add subtle `1px` separator between groups (nav buttons | URL bar | extension buttons | menu)
- Menu button (⋮): replace with AMI logo icon (opens same menu)
- Downloads button: custom design (see §22.10)

**Files:**
- `chrome/browser/ui/views/toolbar/toolbar_view.cc` — height, spacing, separators
- `chrome/browser/ui/views/toolbar/toolbar_button.cc` — hover states, icon style
- `chrome/browser/ui/views/toolbar/browser_app_menu_button.cc` — AMI logo icon
- Resources: `chrome/browser/resources/toolbar/` — custom SVG icon set

**Effort:** 3-4 hours

---

### 22.6 Custom Context Menus (Right-Click)

Chrome's right-click menu looks like a system native menu — visually outdated and inconsistent with a modern browser. Strawberry/Arc use custom-rendered menus.

**Visual:**
```
Chrome:    ┌──────────────────┐         AMI V3:  ╭──────────────────────╮
           │ Back             │                  │  ← Back              │
           │ Forward          │                  │  → Forward           │
           │ Reload           │                  │  ↻ Reload            │
           │──────────────────│                  │─────────────────────│
           │ Save as...       │                  │  💾 Save as...       │
           │ Print...         │                  │  🖨️ Print...         │
           │ Translate to...  │                  │  🌐 Translate        │
           │──────────────────│                  │─────────────────────│
           │ Inspect          │                  │  🔧 Inspect          │
           └──────────────────┘                  │─────────────────────│
                                                 │  🤖 Ask AMI about    │
                                                 │     this...          │
                                                 ╰──────────────────────╯
```

**Changes:**
- Render menus as custom `views::MenuRunnerImplCocoa`-overridden or custom `views::Widget` (non-native)
- Corner radius: `8px`
- Background: `#1e1e3a` (elevated surface)
- Items: `28px` height (slightly taller than default for breathing room)
- Each item gets a left-aligned icon (subtle gray, 16px)
- Separators: thin `1px` line with `8px` horizontal padding
- Hover state: `#2d2d5a` background with smooth `100ms` transition
- Drop shadow: `0 4px 16px rgba(0,0,0,0.3)`
- **AMI-specific items at bottom:**
  - "Ask AMI about this..." (opens AI chat with selected text or page context)
  - "Summarize this page" (sends to AI)
  - "Add to automation" (opens TeachAnAgent recorder)

**Files:**
- `chrome/browser/ui/views/renderer_context_menu/render_view_context_menu_views.cc` — custom rendering
- `ui/views/controls/menu/menu_item_view.cc` — item height, icon, hover
- `ui/views/controls/menu/menu_runner_impl.cc` — corner radius, shadow
- `chrome/browser/renderer_context_menu/render_view_context_menu.cc` — AMI menu items

**Effort:** 6-8 hours

---

### 22.7 Custom Tooltips

Chrome uses OS-native tooltips (small, ugly, inconsistent). AMI uses custom-rendered tooltips.

**Changes:**
- Background: `#1e1e3a` with `6px` corner radius
- Text: `13px`, `#e2e8f0`
- Padding: `6px 10px`
- Shadow: `0 2px 8px rgba(0,0,0,0.3)`
- Appear delay: `400ms` (less aggressive than Chrome's)
- Fade-in animation: `100ms` ease

**Files:**
- `ui/views/controls/label.cc` — tooltip rendering
- `ui/views/widget/tooltip_manager_aura.cc` — custom tooltip widget styling
- New: `ui/views/controls/ami_tooltip_view.h/.cc` — custom tooltip view

**Effort:** 2-3 hours

---

### 22.8 Custom Scrollbars

Chrome's default scrollbars are thick system scrollbars (Linux) or thin overlay scrollbars (macOS). AMI should have thin, styled overlay scrollbars everywhere — content area AND internal pages.

**Changes:**
- Width: `6px` (collapsed), `8px` on hover
- Track: transparent (invisible)
- Thumb: `rgba(124, 58, 237, 0.3)` (purple-tinted) → `rgba(124, 58, 237, 0.6)` on hover
- Thumb corner radius: `4px`
- Auto-hide after `1.5s` of inactivity (fade out `300ms`)
- Applied to ALL scrollable areas: web content viewport, chrome:// pages, side panel, dropdown menus

**Implementation — two layers:**
1. **Web content scrollbars:** Inject default CSS via `blink::WebDocument`:
   ```css
   ::-webkit-scrollbar { width: 6px; }
   ::-webkit-scrollbar-track { background: transparent; }
   ::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.3); border-radius: 4px; }
   ::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.6); }
   ```
   Allow web pages to override with their own scrollbar styles.

2. **Chrome UI scrollbars:** Override `ui/views/controls/scroll_view.cc` and `cc/layers/painted_scrollbar_layer.cc`

**Files:**
- `third_party/blink/renderer/core/css/resolver/style_resolver.cc` — inject default scrollbar CSS
- `ui/views/controls/scroll_view.cc` — native views scrollbar style
- `cc/layers/painted_scrollbar_layer.cc` — compositor-level scrollbar

**Effort:** 3-4 hours

---

### 22.9 Download Shelf → Download Toast Notifications

Chrome shows a download bar at the bottom of the window (or a new download bubble). Both look dated. AMI uses floating **toast notifications** (like Slack/Discord).

**Visual:**
```
Chrome:    ┌──────────────────────────────────────────────────┐
           │ document.pdf  ████████░░░░░░  45%  [Cancel]      │
           └──────────────────────────────────────────────────┘

AMI V3:         ╭───────────────────────────────╮
                │ 📥 document.pdf               │
                │ ████████████░░░░  45% · 12s   │
                │ [Open] [Show in folder]        │
                ╰───────────────────────────────╯
                        ↑ Bottom-right toast
```

**Changes:**
- Kill the bottom download shelf entirely
- Replace with a floating card toast at bottom-right of window
- Corner radius: `12px`
- Background: `#1e1e3a` with `1px` border `#2d2d4a`
- Shadow: `0 8px 24px rgba(0,0,0,0.3)`
- Progress bar: thin purple gradient line
- Auto-dismiss after 5 seconds (stays if downloading)
- Multiple downloads stack vertically
- Click toast → opens download manager
- AI integration: show "Rename to X? [Yes]" suggestion when Tidy Downloads (§9) kicks in

**Files:**
- `chrome/browser/ui/views/download/download_shelf_view.cc` — disable/remove
- New: `chrome/browser/ui/views/download/download_toast_view.h/.cc` — toast UI
- `chrome/browser/download/download_item_notification.cc` — toast trigger

**Effort:** 6-8 hours

---

### 22.10 Notification Toasts (Global)

All browser notifications (permission requests, extension messages, sync status) should use the same toast style — replacing Chrome's inconsistent infobar/bubble system.

**Toast types:**
- **Info** (blue-tinted icon): "Extension installed", "Data imported"
- **Success** (green): "File saved", "Settings exported"
- **Warning** (yellow): "Tab crashed", "Mixed content"
- **Error** (red): "Download failed", "Connection lost"
- **Action** (purple): "Update available — Restart now"

**Implementation:**
- New: `chrome/browser/ui/views/ami_toast/ami_toast_manager.h/.cc`
- Toast queue: max 3 visible, stack from bottom-right
- Each toast: title, message, optional action buttons, dismiss button
- Auto-dismiss: 5s (info), 8s (warning), manual (error/action)
- Animation: slide-in from right, `200ms` ease-out

**Effort:** 4-6 hours

---

### 22.11 Settings Page — Dark, Custom Layout

Chrome's `chrome://settings` is a white material-design page that looks nothing like a dark browser. AMI's should match the browser theme.

**Changes:**
- **Dark-themed by default** — same color palette as browser
- **Custom header:** AMI logo + "AMI Browser Settings" + search bar
- **Sidebar navigation:** left sidebar with icon + label sections (not Chrome's awkward sliding panels)
- **Section layout:**
  ```
  ┌─────────────┬──────────────────────────────────────┐
  │             │                                      │
  │  🏠 General  │  General Settings                    │
  │  🎨 Theme    │                                      │
  │  🔒 Privacy  │  Search engine:  [DuckDuckGo ▾]     │
  │  🛡️ Shield   │  Homepage:       [New Tab ▾]         │
  │  🤖 Agent    │  Downloads:      ~/Downloads [...]   │
  │  💰 Wallet   │                                      │
  │  🔗 Apps     │  [Startup]                           │
  │  🧩 Ext.     │  ○ New Tab page                      │
  │  📊 Activity │  ○ Continue where I left off         │
  │  ⚙️ System   │  ○ Open specific pages               │
  │  ℹ️ About    │                                      │
  └─────────────┴──────────────────────────────────────┘
  ```
- **AMI-specific sections:**
  - "AMI Agent" — AI provider, model, thinking mode, connected apps
  - "AMI Shield" — ad block lists, filter settings
  - "AMI Wallet" — wallet management, approval rules
  - "Spaces" — space management
- **Toggle switches:** custom purple toggles (not Chrome's blue)

**Implementation:** Override Chrome settings WebUI CSS + add custom sections:
- `chrome/browser/resources/settings/settings_shared.css` — dark theme override
- `chrome/browser/resources/settings/` — custom AMI settings sections (polymer/lit components)
- `chrome/browser/ui/webui/settings/settings_ui.cc` — register AMI settings handlers

**Effort:** 8-12 hours

---

### 22.12 Window Frame & Title Bar

**Linux (X11/Wayland):**
- Custom title bar using client-side decoration (CSD)
- Title bar background blends with toolbar (same color, no visible line)
- Window controls (close/min/max) use custom icons: thin-line style, purple accent on hover
- Title bar shows: `AMI Browser — [Space Name]` in small muted text (left-aligned)
- Draggable area: entire toolbar area (not just title bar strip)

**Changes:**
- `chrome/browser/ui/views/frame/browser_frame_view_linux.cc` — CSD rendering
- `chrome/browser/ui/views/frame/browser_non_client_frame_view.cc` — title, window controls
- `chrome/browser/ui/views/frame/opaque_browser_frame_view.cc` — merge title bar + toolbar

**Effort:** 3-4 hours

---

### 22.13 Bookmarks Bar — Compact & Icons-Only Option

Chrome's bookmark bar is thick and text-heavy. AMI offers two modes.

**Mode 1: Compact (default)** — smaller height, tighter spacing:
- Height: `28px` (vs Chrome's `34px`)
- Font size: `12px`
- Padding: `4px 8px`
- Rounded pill backgrounds on hover (like tab style)

**Mode 2: Icons-only** — show only favicons (no text), ultra-compact:
```
🌐 📧 📊 🐙 📝 💬 📁 🎵 | ≡ Other Bookmarks
```
- Each item: `24px × 24px` with `4px` gap
- Tooltip on hover shows full bookmark name
- Folders show dropdown with full names

**Files:**
- `chrome/browser/ui/views/bookmarks/bookmark_bar_view.cc` — compact layout
- `chrome/browser/ui/views/bookmarks/bookmark_button.cc` — icon-only mode
- Settings toggle: Appearance → "Bookmarks bar style" → "Compact" / "Icons only" / "Full"

**Effort:** 3-4 hours

---

### 22.14 Animations & Micro-Interactions

Chrome feels static. Strawberry feels alive. AMI needs smooth micro-interactions throughout.

**Animations to add:**

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Tab open | Scale from 0.8 → 1.0 + fade in | `150ms` | ease-out |
| Tab close | Scale 1.0 → 0.8 + fade out, tabs slide to fill | `150ms` | ease-in |
| Tab reorder (drag) | Other tabs slide smoothly | `200ms` | ease-in-out |
| Tab switch | Slight crossfade on content area | `80ms` | ease |
| Sidebar open | Slide from right, `250ms` | `250ms` | ease-out |
| Sidebar close | Slide to right + fade | `200ms` | ease-in |
| Dropdown/menu open | Scale from 0.95 + fade in | `120ms` | ease-out |
| Dropdown/menu close | Fade out | `80ms` | ease-in |
| Toast appear | Slide up + fade in | `200ms` | ease-out |
| Toast dismiss | Slide right + fade out | `150ms` | ease-in |
| URL bar focus | Border glow + slight expand | `150ms` | ease |
| Page loading | Purple gradient bar under URL bar (not bouncing dots) | continuous | linear |
| Approval dialog | Scale 0.95 → 1.0 + backdrop blur | `200ms` | spring |
| Space switch | Crossfade tab strip | `150ms` | ease |
| Split view divider drag | Smooth resize, no jank | continuous | — |

**Implementation:**
- Most animations use `gfx::Animation` / `views::AnimationBuilder` (Chromium's existing animation framework)
- Tab animations: `chrome/browser/ui/views/tabs/tab_strip.cc` + `tab_animation.cc`
- Menu animations: `ui/views/controls/menu/menu_runner_impl.cc`
- Page loading bar: `chrome/browser/ui/views/frame/browser_view.cc` — replace bouncing dots with gradient bar

**Effort:** 6-8 hours

---

### 22.15 Page Loading Indicator

Chrome uses a thin blue/green line at the top of the tab. AMI uses a **purple gradient progress bar under the URL bar** that pulses subtly.

**Visual:**
```
AMI V3:   ╭──────────────────────────────────╮
          │  🔒 loading-page.com              │
          ╰──────────────────────────────────╯
          ███████████████░░░░░░░░░░░░░░░░░░░░   ← thin purple gradient bar
```

- Color: animated gradient `#7c3aed` → `#a855f7` → `#7c3aed` (shimmer effect)
- Height: `2px`
- Position: directly under the URL bar
- On complete: fade out over `300ms`
- On slow load: gentle pulse animation so user knows it's still working

**Files:**
- `chrome/browser/ui/views/frame/browser_view.cc` — draw progress bar below toolbar
- `chrome/browser/ui/views/frame/contents_web_view.cc` — hook into WebContents loading state

**Effort:** 2-3 hours

---

### 22.16 Find-in-Page Bar

Chrome's find bar is a plain white box stuck to the top-right. AMI's is styled to match.

**Changes:**
- Background: `#1e1e3a`
- Corner radius: `8px`
- Text input: dark background with purple focus ring
- Match highlights in page: purple background instead of yellow
- Counter text: `"3 of 12"` in muted gray
- Close button: fade-in `×` on hover (same style as tab close)
- Float: `8px` from top and right edges (detached from toolbar)

**Files:**
- `chrome/browser/ui/views/find_bar_view.cc` — styling
- `chrome/browser/ui/find_bar/find_bar_controller.cc` — positioning

**Effort:** 1-2 hours

---

### 22.17 Permission Prompts (Camera, Mic, Location, Notifications)

Chrome shows a plain bubble attached to the URL bar. AMI shows a **styled dialog** that matches the browser identity.

**Visual:**
```
AMI V3:    ╭──────────────────────────────────────╮
           │  📍 example.com wants your location  │
           │                                      │
           │  This site will be able to see your   │
           │  approximate location.                │
           │                                      │
           │  ☐ Remember this choice              │
           │                                      │
           │     [Block]        [Allow]            │
           ╰──────────────────────────────────────╯
```

**Changes:**
- Dark background (`#1e1e3a`), rounded corners (`12px`)
- Icon: large permission-type icon (camera, mic, location, notification)
- Allow button: purple accent background
- Block button: transparent with border
- "Remember" checkbox styled with purple checkmark

**Files:**
- `chrome/browser/ui/views/permission_bubble/permission_prompt_bubble_base_view.cc`
- `components/permissions/` — prompt content

**Effort:** 2-3 hours

---

### 22.18 Crash Page & Error Pages

Chrome shows a sad tab (T-Rex for offline, sad face for crashes). AMI should show branded error pages.

**Pages to customize:**
- **Offline page:** AMI-themed page with embedded mini-game (purple themed, not T-Rex)
- **Crash page:** AMI mascot/logo + "This tab has crashed" + [Reload] button, dark themed
- **DNS error:** Dark themed "Can't reach this page" with AMI branding
- **SSL error:** Dark themed warning with AMI styling (keep the security warnings strong)

**Implementation:** Replace Chromium's error page HTML/CSS:
- `components/neterror/resources/` — offline + DNS error pages
- `chrome/browser/ui/sad_tab.cc` — crash page
- `components/security_interstitials/content/resources/` — SSL pages

**Effort:** 3-4 hours

---

### 22.19 Internal Pages Styling (chrome:// pages)

All `chrome://` pages should match the dark theme. Currently they're white material design.

**Pages to restyle:**
| Page | Priority |
|------|----------|
| `chrome://settings` | P0 (see §22.11) |
| `chrome://history` | P0 — dark theme + Smart Search UI |
| `chrome://downloads` | P0 — dark theme + Tidy Downloads integration |
| `chrome://extensions` | P0 — dark theme + AMI branding + hide core AMI extensions + hide Chrome Web Store promo |
| `chrome://bookmarks` | P1 — dark theme |
| `chrome://flags` | P2 — dark theme |
| `chrome://about` | P2 — AMI branding |
| `chrome://version` | P2 — AMI branding |

**Implementation:** Each page's WebUI has CSS that can be overridden:
- Inject a shared `ami-theme.css` into all chrome:// pages via `ChromeWebUIControllerFactory`
- The shared CSS sets background colors, text colors, button styles, input styles, scrollbars

**chrome://extensions specific changes:**
- **Hide "Discover more extensions and themes on the Chrome Web Store" promo banner** — remove or hide the `#cws-widget` / promo element in `chrome/browser/resources/extensions/extensions.html` and the CWS promo logic in `chrome/browser/ui/webui/extensions/`
- **Hide "Developing extensions? Stay up to date on What's New with Chrome Extension developer documentation." banner** — remove the developer callout from the extensions page footer
- **Hide AMI core extensions** from listing (handled in §20 via `extensions_ui.cc` filtering)
- **Replace Chrome Web Store link** with AMI WebStore link in any remaining references

**Files:**
- New: `chrome/browser/resources/ami_theme/ami_chrome_pages.css`
- `chrome/browser/ui/webui/chrome_web_ui_controller_factory.cc` — inject shared CSS
- `chrome/browser/resources/extensions/extensions.html` — remove CWS promo banner + dev docs banner
- `chrome/browser/ui/webui/extensions/extensions_ui.cc` — remove CWS promo data source + dev docs

**Effort:** 5-8 hours

---

### 22.20 Favicon & Product Icon

- **Application icon:** Professional AMI logo — not Chromium blue, not Chrome red. AMI purple with distinctive shape
- **Sizes:** 16, 24, 32, 48, 64, 128, 256, 512px PNG + SVG source
- **Taskbar/dock identity:** must be instantly recognizable — purple is the key differentiator
- **Internal page favicons:** use a mini AMI logo for all `chrome://` pages (not the default Chromium blue)
- **Replace `chrome://resources/images/chrome_logo_dark.svg`** with AMI logo SVG — this is the Chrome logo shown on internal pages (NTP, chrome://settings, error pages). Must be replaced with AMI's logo to eliminate all Chrome branding from internal surfaces.
- **Replace `chrome://resources/images/chrome_logo.svg`** (light variant) with AMI logo as well
- **File type association icons:** AMI-branded icons for `.html`, `.htm`, `.pdf` (registered via `.desktop` file)

**Files:**
- `chrome/app/theme/chromium/` — replace all product icons
- `chrome/browser/resources/images/chrome_logo_dark.svg` → replace with `ami_logo_dark.svg`
- `chrome/browser/resources/images/chrome_logo.svg` → replace with `ami_logo.svg`
- `ui/webui/resources/images/` — any additional Chrome logo references
- `chrome/installer/linux/` — desktop file, MIME types

**Effort:** 2-3 hours (design asset dependent)

---

### 22.21 Font & Typography

Chrome uses system fonts. AMI should ship a custom default font for UI chrome (not web content — that stays as-is).

**Recommendation:** Ship **Inter** (open source, SIL OFL license) as the browser UI font.
- Clean, modern, designed for screens
- Excellent readability at small sizes (tab titles, URL bar, menus)
- Used by many modern apps (Discord, Figma, Linear)

**Implementation:**
- Bundle Inter woff2 in browser resources
- Set as default font for all `views::Label`, `views::Textfield`, and WebUI pages
- Web content still uses `system-ui` or the page's own fonts (this only affects browser chrome)

**Font sizes (standardized):**
| Element | Size | Weight |
|---------|------|--------|
| Tab title | `12px` | Regular (400) |
| URL bar text | `14px` | Regular (400) |
| Menu item | `13px` | Regular (400) |
| Settings heading | `16px` | Medium (500) |
| Settings body | `14px` | Regular (400) |
| Toast title | `13px` | Medium (500) |
| Toast body | `12px` | Regular (400) |
| Button text | `13px` | Medium (500) |

**Files:**
- `ui/gfx/platform_font_linux.cc` — set default UI font
- `chrome/browser/resources/` — bundle Inter font files
- All WebUI pages: set `font-family: 'Inter', system-ui, sans-serif`

**Effort:** 2-3 hours

---

### 22.22 Cursor & Selection Styles

Small touches that reinforce the custom feel.

- **Text selection color:** purple highlight (`rgba(124, 58, 237, 0.3)`) instead of blue
- **Cursor caret:** purple caret in all text inputs (URL bar, find bar, settings inputs)
- **Link hover cursor:** standard pointer (no change needed), but link focus outlines use purple

**Files:**
- `ui/gfx/render_text.cc` — selection color override
- `chrome/browser/resources/` — CSS overrides for WebUI caret/selection

**Effort:** 1 hour

---

### Summary — UI/UX Files to Modify

| Area | Key Files | Effort |
|------|-----------|--------|
| Color system | `theme_properties.cc`, `chrome_color_id.h` | 2-3h |
| Tab strip (shape, close, hover) | `tab_style_views.cc`, `tab_strip.cc`, `tab.cc`, `tab_close_button.cc` | 4-6h |
| Omnibox (floating, rounded) | `location_bar_view.cc`, `omnibox_view_views.cc` | 4-6h |
| Toolbar (compact, icons) | `toolbar_view.cc`, `toolbar_button.cc` | 3-4h |
| Context menus | `render_view_context_menu_views.cc`, `menu_item_view.cc` | 6-8h |
| Tooltips | `tooltip_manager_aura.cc` | 2-3h |
| Scrollbars | `style_resolver.cc`, `scroll_view.cc` | 3-4h |
| Download toast | `download_toast_view.h/.cc` (new) | 6-8h |
| Notification toasts | `ami_toast_manager.h/.cc` (new) | 4-6h |
| Settings page | `settings_shared.css`, settings WebUI | 8-12h |
| Window frame | `browser_frame_view_linux.cc` | 3-4h |
| Bookmarks bar | `bookmark_bar_view.cc` | 3-4h |
| Animations | Multiple tab/menu/sidebar files | 6-8h |
| Loading indicator | `browser_view.cc` | 2-3h |
| Find bar | `find_bar_view.cc` | 1-2h |
| Permission prompts | `permission_prompt_bubble_base_view.cc` | 2-3h |
| Error pages | `neterror/resources/`, `sad_tab.cc` | 3-4h |
| chrome:// pages | `ami_chrome_pages.css` (new) | 4-6h |
| Product icon + logo SVG replacements | `chrome/app/theme/chromium/`, `chrome/browser/resources/images/` | 2-3h |
| Typography (Inter font) | `platform_font_linux.cc` | 2-3h |
| Selection/cursor | `render_text.cc` | 1h |
| **Total UI/UX** | | **66-97h** |

---

## 23. Custom Omnibox Commands & Actions

> **Inspired by:** Arc's Command Bar and Chromium's `@` keywords

### What it is
Type special keywords in the omnibox to trigger AMI-specific actions.

### Commands

| Command | Action | Example |
|---------|--------|---------|
| `@ami` | Open AMI Chat sidebar | `@ami summarize this page` |
| `@history` | Smart History search | `@history article about AI I read Tuesday` |
| `@rewards` | Rewards & wallet quick actions | `@rewards balance` |
| `@shield` | Shield controls | `@shield disable for this site` |
| `@auto` | Run automation | `@auto extract all emails from this page` |
| `@space` | Switch space | `@space Work` or `@space Personal` |
| `@split` | Split current tab | `@split youtube.com` (splits with YouTube) |

### Implementation
- Register custom `AutocompleteProvider` for each `@` keyword
- `chrome/browser/autocomplete/ami_omnibox_provider.h/.cc`
- Show rich suggestions with icons and descriptions
- Commands execute via gateway or browser internal APIs

**Effort:** 6-8 hours

---

## 24. Packaging & Distribution

### Linux Packages to Build

| Format | Target | Tool |
|--------|--------|------|
| `.deb` | Ubuntu, Debian, Pop!_OS, Mint | `dpkg-deb` |
| `.rpm` | Fedora, RHEL, openSUSE | `rpmbuild` |
| AppImage | Universal Linux | `appimagetool` |
| Snap | Ubuntu Software Center | `snapcraft` |
| Flatpak | Flathub | `flatpak-builder` |

### .deb Package Structure
```
/usr/lib/ami-browser/
├── ami-browser           (main binary)
├── chrome-sandbox         (SUID 4755)
├── locales/               (language packs)
├── resources/             (component extensions, themes)
├── *.pak                  (resource packs)
├── *.so                   (shared libraries)
├── icudtl.dat
├── v8_context_snapshot.bin
└── MEIPreload/

/usr/bin/ami-browser       (symlink → /usr/lib/ami-browser/ami-browser)
/usr/share/applications/ami-browser.desktop
/usr/share/icons/hicolor/*/apps/ami-browser.png
/usr/share/appdata/ami-browser.appdata.xml
/etc/apparmor.d/ami-browser
```

### Auto-Updater

#### Architecture Decision: GitHub Releases vs. Dedicated Backend

| Approach | Pros | Cons |
|----------|------|------|
| **GitHub Releases (Recommended for Phase 1)** | Free hosting, CDN-backed, no server maintenance, public/private repos both work, built-in versioning via tags | No differential/delta updates (full binary re-download), no telemetry/metrics, rate limits on private repos (60 req/hr unauthenticated) |
| **Dedicated Update Server** | Differential updates (binary patch), subscription validation, metrics/telemetry, custom update policies (staged rollouts, A/B), forced updates for critical security fixes | Requires backend infrastructure, hosting costs, server maintenance |
| **Hybrid (Recommended for Phase 2)** | GitHub hosts the binaries (free CDN), lightweight API server handles version checks + subscription validation + delta manifest | Best of both worlds, backend is minimal (a single endpoint) |

#### Phase 1: GitHub-Based Updates (MVP)

**How it works:**
1. Each release is a GitHub Release with tagged version (e.g., `v3.0.1`)
2. Binaries (`.deb`, AppImage, `.rpm`, etc.) attached as release assets
3. Browser checks `https://api.github.com/repos/{owner}/{repo}/releases/latest` on startup
4. Compares `tag_name` against current version in `chrome://version`
5. If newer version found → shows **Update button next to the search bar (omnibox)** for all users + notification in `chrome://settings/help`
6. User clicks "Update" → downloads the asset matching their OS/arch → applies update

**Search bar update button (V3 requirement):**
- Location: right side of omnibox (always visible when update is available)
- Label format: `Update vX.Y.Z`
- Visibility rule: hidden by default, shown only when `latest_version > current_version`
- Audience: all users on that release channel (`stable`, `beta`, or `dev`)
- States:
  - `available`: button visible, clickable
  - `downloading`: shows progress `%`
  - `ready_to_restart`: shows `Restart to Update`
  - `error`: fallback to `Try Again`
- Polling:
  - On app launch
  - Every 4 hours in background
  - Manual check via `chrome://settings/help`

**Version target for first V3 rollout with omnibox button:**
- Public rollout version: **`v3.1.0`**
- UI text example: `Update v3.1.0`

**Update check endpoint (no backend needed):**
```
GET https://api.github.com/repos/yassirboudda/AMIBrowser/releases/latest
→ { "tag_name": "v3.1.0", "assets": [{ "name": "ami-browser-3.1.0-linux-x64.deb", "browser_download_url": "..." }] }
```

**Works with private repos** using a bundled GitHub token (read-only, scoped to releases). For public repos, no token needed (5000 req/hr with token, 60/hr without).

**Update UI:**
- Omnibox button: `Update v3.1.0` shown next to search bar when update is available
- Toolbar badge: small green dot on AMI logo when update available
- `chrome://settings/help` → "AMI Browser is up to date" or "Update available: v3.1.0 — [Update Now]"
- Settings toggle: "Check for updates automatically" (default: ON)
- Update progress bar during download

**Implementation files:**
| File | Purpose |
|------|---------|
| `browser/ami_update_checker.cc` | Background update check service (runs every 4 hours) |
| `browser/ami_update_checker.h` | Header |
| `browser/ami_update_ui.cc` | Omnibox update button + notification bar + toolbar badge |
| `browser/resources/ami_update_page.html` | The `chrome://settings/help` update panel |

#### Release Trigger Contract (What You Need So Button Appears For Everyone)

For each new build, publish metadata that every client can compare against its installed version.

**Minimum required fields:**
- `latest_version` (e.g., `3.1.0`)
- `channel` (`stable`, `beta`, `dev`)
- `min_supported_version` (optional for forced updates)
- `download_url` (per platform/arch)
- `checksum_sha256`
- `published_at`

**Client-side decision logic:**
1. Read current installed version
2. Fetch latest metadata for user's channel
3. If `latest_version > current_version` → show omnibox Update button
4. If `latest_version <= current_version` → hide button

**Example metadata (GitHub-only or backend response):**
```json
{
  "channel": "stable",
  "latest_version": "3.1.0",
  "min_supported_version": "3.0.0",
  "assets": {
    "linux-x64-deb": {
      "download_url": "https://github.com/yassirboudda/AMIBrowser/releases/download/v3.1.0/ami-browser-3.1.0-linux-x64.deb",
      "checksum_sha256": "<sha256>"
    },
    "linux-x64-appimage": {
      "download_url": "https://github.com/yassirboudda/AMIBrowser/releases/download/v3.1.0/ami-browser-3.1.0-linux-x64.AppImage",
      "checksum_sha256": "<sha256>"
    }
  },
  "published_at": "2026-05-10T00:00:00Z"
}
```

#### Build/Release Workflow (Operator Checklist)

When you build a new V3 version, do this in order:
1. Build binaries (`.deb`, `.rpm`, AppImage, tar.gz)
2. Compute SHA-256 checksums
3. Create release tag (example: `v3.1.0`)
4. Publish GitHub Release and upload assets
5. Publish/update machine-readable version metadata (`latest_version`, URLs, checksums)
6. Clients poll, detect newer version, and automatically display omnibox Update button

#### GitHub vs Backend: What Is Enough?

**If your goal is only "show update button for all users when new build is out":**
- GitHub Releases + version metadata is enough
- No mandatory backend server required

**If you also need subscription control, staged rollout, analytics, or forced update policy:**
- Add lightweight backend version API
- Keep binaries on GitHub CDN (recommended)

**Recommended architecture for V3 launch:**
- Store binaries on GitHub Releases (fast, cheap, simple)
- Optional backend only for policy/entitlement logic

#### Phase 2: Hybrid Backend (Subscription + Delta Updates)

**When needed:** Once AMI Browser has paid tiers or needs delta updates to reduce download sizes.

**Lightweight backend API (single endpoint):**
```
GET https://api.ami.exchange/api/check?version=3.0.1&os=linux&arch=x64&channel=stable&license=xxx
→ {
    "update_available": true,
    "version": "3.1.0",
    "download_url": "https://github.com/.../releases/download/v3.1.0/ami-browser-3.1.0-linux-x64.deb",
    "delta_url": "https://api.ami.exchange/deltas/3.0.1-to-3.1.0.bsdiff",  // optional
    "delta_size": 12400000,
    "full_size": 148000000,
    "mandatory": false,
    "release_notes": "Bug fixes and performance improvements",
    "checksum_sha256": "abc123..."
  }
```

**The backend validates:**
- Subscription status (free tier always gets updates; paid features gated)
- Whether the update is mandatory (critical security fix)
- Staged rollout percentage (e.g., 10% of users get it first)

**NOTE:** The backend is NOT required for updates to work — it only adds subscription gating and delta patches. Phase 1 (GitHub-only) is fully functional for all users.

#### Update Channels
| Channel | Purpose | Source |
|---------|---------|--------|
| `stable` | Production releases | GitHub Releases (tagged) |
| `beta` | Pre-release testing | GitHub Pre-releases |
| `dev` | Nightly/canary builds | GitHub Actions artifacts |

#### Security
- All downloads verified via SHA-256 checksum
- Release assets signed with GPG key
- Update check uses HTTPS only
- No auto-install without user consent (user clicks "Update Now")

**Effort:** 8-12 hours (Phase 1), +6-10 hours (Phase 2 backend)

### Installer Improvements
- Silent install mode: `./install.sh --silent`
- Uninstaller: `ami-browser --uninstall` or `dpkg -r ami-browser`
- First-run wizard: import from Chrome/Firefox/Brave/Edge/Arc

**Effort:** 4-6 hours

---

## 25. Competitive Feature Matrix

### AMI Browser V3 vs. All Competitors

| Feature | AMI V3 | Strawberry | Arc | Brave | Edge | Chrome |
|---------|--------|------------|-----|-------|------|--------|
| **AI Chat Sidebar** | ✅ 50+ providers, BYO keys | ✅ Proprietary AI | ✅ ChatGPT only | ✅ Leo (limited) | ✅ Copilot (Microsoft) | ❌ |
| **Split View** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Spaces/Profiles** | ✅ | ❌ | ✅ | ❌ | Workspaces | Profiles |
| **Vertical Tabs** | ✅ Tree view | ❌ | ✅ Sidebar tabs | ✅ Recent | ✅ | ❌ |
| **Smart History** | ✅ Local, private | ✅ CloudFlare | ❌ | ❌ | ❌ | ❌ |
| **Link Previews** | ✅ AI summary | ❌ | ✅ 5-sec preview | ❌ | ❌ | ❌ |
| **Tidy Titles** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Tidy Downloads** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Ad Blocker** | ✅ Network-level | ❌ | ❌ | ✅ Network-level | ❌ | ❌ |
| **Web Capture** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Reader Mode + AI** | ✅ Summary + TTS | ❌ | ❌ | ✅ Basic | ✅ Basic | ❌ |
| **Browser Automation** | ✅ Parallel, multi-tab, Mission Control live view | ✅ Companions | ❌ | ❌ | ❌ | ❌ |
| **Vision AI Element Interaction** | ✅ Native, multi-LLM | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI Page Commands (act/extract/fill)** | ✅ Full API | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Visual Workflow Builder** | ✅ Drag-and-drop, 15 block types | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cron Scheduling** | ✅ Natural language + cron | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Structured Data Extraction** | ✅ JSON schema + pagination | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI Form Filling** | ✅ Natural language | ❌ | ❌ | ❌ | ❌ | ❌ |
| **2FA / Auth Automation** | ✅ TOTP + password managers | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Observer Mode (Watch & Learn)** | ✅ Record → workflow | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Prompt Caching / Action Memory** | ✅ LevelDB, per-domain | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Approval System** | ✅ Granular + auto-approve | ✅ Basic | ❌ | ❌ | ❌ | ❌ |
| **Connected Apps** | ✅ Gmail, Slack, Notion, CRMs | ✅ | ❌ | ❌ | M365 only | ❌ |
| **Built-in Rewards + Wallet** | ✅ Multi-chain | ❌ | ❌ | ✅ Basic wallet | ❌ | ❌ |
| **Activity Audit** | ✅ Full timeline | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Session Replay** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Smart Tab Switcher** | ✅ Visual carousel + AI search | ❌ | ❌ | ❌ | ❌ | ✅ New (basic) |
| **Multi-Row Tabs** | ✅ Zen-style, configurable | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Compact Mode** | ✅ One-line toolbar | ❌ | ✅ Minimal | ❌ | ❌ | ❌ |
| **Tab Glance (Peek)** | ✅ Hover preview | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Privacy/Telemetry** | ✅ Zero telemetry | ⚠️ CloudFlare | ⚠️ | ✅ | ❌ Heavy | ❌ Heavy |
| **Local AI Models** | ✅ Ollama, LM Studio | ❌ Cloud only | ❌ | ❌ | ❌ | ❌ |
| **Runs Locally (No Server)** | ✅ Everything in-browser | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Open Source** | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ (Chromium) |
| **Linux** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Price** | **Free** | $0-250/mo | Free | Free | Free | Free |
| **API Key Cost** | ~$5-20/mo | Included (limited) | N/A | N/A | N/A | N/A |

### Key Competitive Messaging

**vs. Strawberry:**
> "Like Strawberry, but free. Your keys, your models, your data. No $250/month subscription. No credit limits. No vendor lock-in. Plus: ad blocking, built-in rewards, Linux support, open source, and offline capability with local AI models."

**vs. Arc:**
> "Arc's design philosophy (Spaces, Split View, sidebar tabs) plus full AI agent automation, built-in rewards, ad blocking, and 50+ AI providers. Everything Arc does well, plus everything Arc can't do."

**vs. Brave:**
> "Brave's privacy DNA (network-level ad blocking, fingerprinting protection, zero telemetry) plus AI that actually does things — not just chat. Browser automations, connected apps, AMI Rewards, and parallel task execution."

**vs. Edge:**
> "Edge's productivity features (vertical tabs, web capture, reader mode) without Microsoft's telemetry. Plus AI that works with any provider — not locked to Copilot. Free, open source, and private by default."

---

## 26. Build Priority & Effort Estimates

### Phase 1: Foundation (Day 1-3) — Ship V3-alpha

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|--------------|
| 1 | V2 critical bug fixes (9 items) | 4-6h | P0 | None |
| 2 | Embedded core extensions — non-removable (§20) | 6-10h | P0 | #1 |
| 3 | Default settings & privacy (§21) | 2-3h | P0 | #1 |
| 4 | Color system + product icon + logo SVG replacements (§22.1, 22.20) | 4-6h | P0 | #1 |
| 5 | Tab strip overhaul — pill tabs, close, hover (§22.2, 22.3) | 4-6h | P0 | #4 |
| 6 | Omnibox — floating, rounded (§22.4) | 4-6h | P0 | #4 |
| 7 | Toolbar — compact, custom icons (§22.5) | 3-4h | P0 | #4 |
| 8 | Window frame + title bar (§22.12) | 3-4h | P1 | #4 |
| 9 | Typography — bundle Inter font (§22.21) | 2-3h | P1 | #4 |
| 10 | Chat-First NTP (§5) | 6-8h | P0 | #2 |

**Day 1-3 total: ~38-57 hours**
**Outcome:** Bug-free, visually distinct browser that looks nothing like Chrome. Custom tab shapes, floating URL bar, compact toolbar, proper font, native NTP. Core extensions embedded and non-removable. Chrome logos replaced with AMI.

### Phase 2: UI Polish + Core Features (Day 4-7) — Ship V3-beta

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|--------------|
| 11 | Context menus — custom rendered (§22.6) | 6-8h | P0 | #4 |
| 12 | Download toasts (§22.9) | 6-8h | P0 | #4 |
| 13 | Notification toasts (§22.10) | 4-6h | P1 | #4 |
| 14 | Custom tooltips (§22.7) | 2-3h | P1 | #4 |
| 15 | Custom scrollbars (§22.8) | 3-4h | P1 | #4 |
| 16 | Animations & micro-interactions (§22.14) | 6-8h | P1 | #5, #6, #11 |
| 17 | Loading indicator (§22.15) | 2-3h | P1 | #6 |
| 18 | Native AI Sidebar (§4) | 8-12h | P0 | #10 |
| 19 | Vertical Tabs (§6) | 12-16h | P1 | #1 |
| 20 | Tab Indicators (§14) | 4-6h | P1 | #18 |

**Day 4-7 total: ~53-74 hours**
**Outcome:** Every touch point is custom — menus, downloads, scrollbars, tooltips, animations. Plus AI sidebar and vertical tabs.

### Phase 3: Remaining UI + AI Features (Day 8-11) — Ship V3-rc

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|--------------|
| 21 | Settings page — dark, custom layout (§22.11) | 8-12h | P0 | #4 |
| 22 | chrome:// pages dark theme + hide CWS promo (§22.19) | 5-8h | P1 | #4 |
| 23 | Find bar + permission prompts (§22.16, 22.17) | 3-5h | P2 | #4 |
| 24 | Bookmarks bar — compact/icons-only (§22.13) | 3-4h | P2 | #4 |
| 25 | Error pages + crash pages (§22.18) | 3-4h | P2 | #4 |
| 26 | Selection/cursor styles (§22.22) | 1h | P2 | #4 |
| 27 | Split View (§2) | 12-16h | P1 | #1 |
| 28 | Spaces & Profiles (§3) | 16-24h | P2 | #19 |
| 29 | Smart History (§7) | 20-30h | P0 | #1 |
| 30 | Approval System (§17) | 8-12h | P0 | #18 |

**Day 8-11 total: ~78-113 hours**
**Outcome:** Every internal page is dark-themed and branded. Full Arc feature parity (Split View, Spaces). Smart History + approval system ready.

### Phase 4: Power Features + Mission Control (Day 12-25) — Ship V3.0 Stable

| # | Task | Effort | Priority | Dependencies |
|---|------|--------|----------|--------------|
| 31 | AutomationTabManager + session lifecycle (§18.4A) | 6-8h | P0 | #18, #20 |
| 32 | Tab capture / frame streaming (§18.4B) | 8-12h | P0 | #31 |
| 33 | Mission Control WebUI — grid, cards, feed (§18.2-18.4D) | 10-14h | P0 | #32 |
| 34 | Mission Control Mojo IPC (§18.4C) | 4-6h | P0 | #33 |
| 35 | Background throttling exemption (§18.4E) | 3-4h | P1 | #31 |
| 36 | Resource governor — FPS/memory/CPU (§18.4I) | 4-6h | P1 | #32 |
| 37 | Error handling & intervention flow (§18.4J) | 4-6h | P1 | #31 |
| 38 | Sidebar compact automation status (§18.4H) | 3-4h | P1 | #31 |
| 39 | Gateway parallel session management (§18.3) | 6-8h | P0 | #31 |
| 40 | Vision AI Element Locator + LLM integration (§18.7) | 10-14h | P0 | #31, #39 |
| 41 | AI Page Commands API — act/extract/validate/fill (§18.8) | 8-12h | P0 | #40 |
| 42 | Workflow Builder WebUI — drag-and-drop editor (§18.9) | 16-24h | P1 | #41 |
| 43 | Workflow Engine — block executor + state machine (§18.9) | 10-14h | P0 | #41 |
| 44 | Structured Data Extraction + pagination + export (§18.10) | 6-8h | P1 | #41 |
| 45 | Cron Scheduler service + Settings UI (§18.11) | 8-10h | P1 | #43 |
| 46 | AI Form Filler — field matching + multi-step (§18.12) | 6-8h | P1 | #40 |
| 47 | Auth & 2FA — TOTP generator + password manager (§18.13) | 8-12h | P1 | #31 |
| 48 | Observer Mode — action recorder + workflow gen (§18.14) | 10-14h | P2 | #42, #43 |
| 49 | Prompt Cache / Action Memory — LevelDB (§18.15) | 4-6h | P2 | #40 |
| 50 | Link Previews (§8) | 8-12h | P2 | #1 |
| 51 | Tidy Titles/Downloads (§9) | 4-6h | P2 | #1 |
| 52 | Network-Level Ad Block (§15) | 16-20h | P1 | #1 |
| 53 | Connected Apps / OAuth (§16) | 16-24h | P1 | #18 |
| 54 | AMI Rewards (§11) | 20-30h | P1 | #30 |
| 55 | Web Capture (§12) | 6-8h | P2 | #1 |
| 56 | Smart Reader (§13) | 8-10h | P2 | #1 |
| 57 | Activity Audit (§19) | 10-14h | P2 | #30 |
| 58 | Omnibox Commands (§23) | 6-8h | P2 | #18 |
| 59 | Smart Tab Switcher — Visual Carousel (§27) | 10-14h | P1 | #5, #19 |
| 60 | Zen-Style Multi-Row Tabs & Compact Mode (§28) | 14-20h | P1 | #5, #19 |
| 61 | Packaging & Auto-Updater (§24) | 18-28h | P0 | All |

**Day 12-25 total: ~233-330 hours**
**Outcome:** Complete AMI Browser V3 with Vision AI automation engine, Workflow Builder, Mission Control live dashboard, cron scheduling, and every planned feature.

### Total Estimated Build Time

| Phase | Hours | Calendar (1 person) | Calendar (2-3 people) |
|-------|-------|--------------------|-----------------------|
| Phase 1: Foundation + Visual Identity | 38-57h | 3-5 days | 2-3 days |
| Phase 2: UI Polish + Core Features | 53-74h | 5-7 days | 2-3 days |
| Phase 3: Remaining UI + AI Features | 79-115h | 8-11 days | 3-5 days |
| Phase 4: Power Features + Mission Control | 257-364h | 22-33 days | 9-13 days |
| **Total** | **441-632h** | **40-58 days** | **19-28 days** |

*Estimates assume Chromium source is already checked out and the build environment is ready (from V2).*

---

## Quick Reference — New Files to Create

| Path | Purpose |
|------|---------|
| **UI/UX Visual Identity (§22)** | |
| `chrome/browser/ui/views/tabs/ami_tab_style.h/.cc` | Pill-shaped tab renderer |
| `chrome/browser/ui/views/location_bar/ami_omnibox_view_decoration.cc` | Floating rounded omnibox |
| `chrome/browser/ui/views/ami_context_menu/ami_menu_runner.h/.cc` | Custom context menu renderer |
| `chrome/browser/ui/views/ami_tooltip_view.h/.cc` | Custom tooltip bubble |
| `chrome/browser/ui/views/download/download_toast_view.h/.cc` | Download toast (replaces shelf) |
| `chrome/browser/ui/views/ami_toast/ami_toast_manager.h/.cc` | Notification toast system |
| `chrome/browser/ui/webui/settings/ami_settings_overrides.cc` | Dark settings page overrides |
| `chrome/browser/resources/theme/ami/ami_chrome_pages.css` | Shared dark CSS for chrome:// pages |
| `chrome/browser/resources/theme/ami/inter/` | Bundled Inter font files |
| `chrome/browser/ui/views/frame/ami_window_frame_view.h/.cc` | Custom window frame (CSD) |
| `chrome/app/theme/ami/` | Product icons (16-512px) |
| **Core Features** | |
| `chrome/browser/ui/views/frame/split_view_controller.h/.cc` | Split View |
| `chrome/browser/ui/views/frame/split_view_divider.h/.cc` | Split View divider |
| `chrome/browser/ui/views/spaces/space_strip_view.h/.cc` | Spaces UI |
| `chrome/browser/spaces/space_model.h/.cc` | Space data model |
| `chrome/browser/ui/views/side_panel/ami_chat/` | AI Sidebar |
| `chrome/browser/ui/webui/ami_chat/` | Sidebar WebUI |
| `chrome/browser/ui/webui/new_tab_page/ami_new_tab_page_ui.h/.cc` | Custom NTP |
| `chrome/browser/resources/new_tab_page/ami/` | NTP assets |
| `chrome/browser/ui/views/tabs/vertical_tab_strip.h/.cc` | Vertical Tabs |
| `chrome/browser/history/smart_history_service.h/.cc` | Smart History |
| `chrome/browser/ml_model_service/sentence_transformer.h/.cc` | Local embeddings |
| `chrome/browser/ui/views/link_preview/link_preview_bubble.h/.cc` | Link Previews |
| `chrome/browser/ami/tidy_service.h/.cc` | Tidy Titles/Downloads |
| `chrome/browser/ui/views/toolbar/ami_shield_toolbar_button.h/.cc` | Shield button |
| `chrome/browser/ui/webui/ami_shield/` | Shield dropdown |
| `chrome/browser/ui/views/toolbar/ami_rewards_toolbar_button.h/.cc` | Rewards + Wallet button |
| `chrome/browser/ui/webui/ami_rewards/` | Rewards + Wallet dropdown |
| `components/ami_rewards/` | Rewards + Wallet engine |
| `chrome/browser/ui/views/web_capture/web_capture_overlay.h/.cc` | Web Capture |
| `chrome/browser/ui/webui/reader_mode/ami_reader_ui.h/.cc` | Reader Mode |
| `components/ami_adblock/` | Network ad blocking |
| `chrome/browser/ami/oauth/ami_oauth_manager.h/.cc` | OAuth manager |
| `chrome/browser/ui/views/ami_approval/approval_dialog.h/.cc` | Approval dialog |
| `chrome/browser/ami/approval/approval_service.h/.cc` | Approval service |
| **Parallel Automations & Mission Control (§18)** | |
| `chrome/browser/automation/automation_tab_manager.h/.cc` | Automation tab lifecycle manager |
| `chrome/browser/automation/automation_session.h/.cc` | Per-task session state + progress |
| `chrome/browser/automation/automation_resource_governor.h/.cc` | CPU/memory/FPS resource management |
| `chrome/browser/automation/vision_element_locator.h/.cc` | Vision LLM-based element identification |
| `chrome/browser/automation/page_commands.h/.cc` | AI page commands API (act, extract, validate, fill, etc.) |
| `chrome/browser/automation/workflow_engine.h/.cc` | Workflow execution engine — block runner + state machine |
| `chrome/browser/automation/automation_scheduler.h/.cc` | Cron scheduling service — recurring automations |
| `chrome/browser/automation/totp_generator.h/.cc` | Built-in TOTP code generator for 2FA automation |
| `chrome/browser/automation/session_manager.h/.cc` | Login session persistence — cookie save/restore |
| `chrome/browser/automation/action_memory.h/.cc` | Prompt cache — LevelDB store for page pattern memory |
| `chrome/browser/automation/observer_recorder.h/.cc` | Observer mode — action recording + workflow generation |
| `chrome/browser/automation/form_filler.h/.cc` | AI form filling — field matching + multi-step forms |
| `chrome/browser/automation/data_extractor.h/.cc` | Structured data extraction with pagination + schema |
| `chrome/browser/ui/webui/mission_control/mission_control_ui.h/.cc` | Mission Control WebUI controller |
| `chrome/browser/ui/webui/mission_control/mission_control.mojom` | Mojo IPC for frame streaming |
| `chrome/browser/ui/webui/workflow_builder/workflow_builder_ui.h/.cc` | Workflow Builder WebUI controller |
| `chrome/browser/resources/mission_control/` | Mission Control HTML/TS/CSS assets |
| `chrome/browser/resources/workflow_builder/` | Workflow Builder drag-and-drop editor assets |
| **Other** | |
| `chrome/browser/ami/activity/activity_log_service.h/.cc` | Activity log |
| `chrome/browser/ui/webui/ami_activity/` | Activity timeline |
| `chrome/browser/autocomplete/ami_omnibox_provider.h/.cc` | Omnibox commands |
| `chrome/browser/extensions/ami_extension_management.h/.cc` | Force-install + hide AMI core extensions |
| `chrome/browser/resources/images/ami_logo_dark.svg` | Replaces `chrome_logo_dark.svg` |
| `chrome/browser/resources/images/ami_logo.svg` | Replaces `chrome_logo.svg` |
| **Smart Tab Switcher (§27)** | |
| `chrome/browser/ui/views/tab_switcher/tab_switcher_view.h/.cc` | Main carousel overlay view |
| `chrome/browser/ui/views/tab_switcher/tab_switcher_card.h/.cc` | Individual tab card widget |
| `chrome/browser/ui/views/tab_switcher/tab_switcher_search.h/.cc` | Search bar + AI matching |
| `chrome/browser/ui/views/tab_switcher/tab_switcher_thumbnail.h/.cc` | Live thumbnail capture manager |
| **Zen-Style Compact Browsing (§28)** | |
| `chrome/browser/ui/views/tabs/multi_row_tab_strip.h/.cc` | Multi-row wrapping tab layout |
| `chrome/browser/ui/views/tabs/compact_toolbar_view.h/.cc` | Merged tab + URL bar (one-line) |
| `chrome/browser/ui/views/glance/glance_overlay.h/.cc` | Floating preview WebContents |
| `chrome/browser/ui/views/glance/glance_controller.h/.cc` | Alt+Click handler + lifecycle |
| `chrome/browser/ui/views/web_panel/web_panel_sidebar.h/.cc` | Sidebar panel container |
| `chrome/browser/ui/views/web_panel/web_panel_item.h/.cc` | Individual pinned panel |

---

---

## 27. Smart Tab Switcher — Visual Carousel

> **Inspired by:** Chrome's Tab Switcher (released April 2026) — a visual card-based tab switching interface that replaces the basic `Ctrl+Tab` cycling. AMI takes it further with AI-powered tab search, grouping by context, and live thumbnails.

### What it is
A full-screen or overlay UI that shows **live thumbnail cards** of all open tabs. The user can visually browse tabs, search them by content/title, and switch instantly. Goes beyond Chrome's basic version with AI search and smart grouping.

### Why it requires a binary change
Chrome's new tab switcher is built into `chrome/browser/ui/views/tabs/`. To customize it with AMI's visual identity, add AI-powered search, and integrate with Spaces (§3), we need to modify the native UI layer.

### Implementation Plan

#### 27.1 Visual Carousel UI

```
╭──────────────────────────────────────────────────╮
│  🔍 Search tabs...                    ✕ Close   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ ◉ YouTube │  │ ◉ GitHub │  │ ◉ Gmail  │       │
│  │ ┌──────┐ │  │ ┌──────┐ │  │ ┌──────┐ │       │
│  │ │ live │ │  │ │ live │ │  │ │ live │ │       │
│  │ │thumb │ │  │ │thumb │ │  │ │thumb │ │       │
│  │ └──────┘ │  │ └──────┘ │  │ └──────┘ │       │
│  │ Kings &  │  │ AMI PR   │  │ Inbox    │       │
│  │ Generals │  │ #142     │  │ (3 new)  │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ ◉ Docs   │  │ ◉ Reddit │  │ ◉ Stack  │       │
│  │ ...      │  │ ...      │  │ ...      │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                  │
│  ← Use arrow keys or scroll • Ctrl+Tab to cycle  │
╰──────────────────────────────────────────────────╯
```

**Activation:**
- `Ctrl+Tab` (hold) → opens carousel (release on desired tab)
- `Ctrl+Shift+Tab` → reverse direction
- `Ctrl+Tab` (tap) → cycles to next tab (classic behavior preserved)
- Omnibox: type `@tabs` → inline tab search
- Three-finger swipe up on trackpad

#### 27.2 Live Thumbnails

- Each card shows a **live thumbnail** of the tab's current content (not a stale screenshot)
- Thumbnails update via `chrome.tabCapture` / compositor frame capture at 2 FPS when switcher is open
- Stale tabs (>30 min inactive) show a static screenshot with a "💤" overlay
- Cards show: favicon, title (truncated), domain, and a close button (hover)

#### 27.3 AI Tab Search

- The search bar accepts natural language: "that article about machine learning"
- Matches against tab title, URL, and **page content** (uses Smart History embeddings from §7 if available)
- Results ranked by relevance + recency, highlighted as the user types
- AI-powered grouping suggestions: "Group these 4 tabs into 'Research'?"

#### 27.4 Smart Grouping

- Tabs automatically grouped by context:
  - **By domain** — all YouTube tabs together, all GitHub tabs together
  - **By Space** (§3) — show space labels as section headers
  - **By AI topic** — "Shopping", "Research", "Social", "Work"
- User can toggle grouping: None / Domain / Space / AI Topic
- Drag cards between groups to reorganize

#### 27.5 Tab Actions in Carousel

- Hover → close button (×) appears on card
- Right-click card → context menu: Close, Pin, Mute, Duplicate, Move to Space, Split with...
- Multi-select: `Ctrl+Click` multiple cards → batch close, batch group, batch move
- Keyboard: `Delete` closes highlighted tab, `Enter` switches to it, `P` pins it

**Files to create:**
```
chrome/browser/ui/views/tab_switcher/
├── tab_switcher_view.h / .cc          — main carousel overlay view
├── tab_switcher_card.h / .cc          — individual tab card widget
├── tab_switcher_search.h / .cc        — search bar + AI matching
├── tab_switcher_thumbnail.h / .cc     — live thumbnail capture manager
```

**Files to modify:**
- `chrome/browser/ui/views/frame/browser_view.cc` — overlay switcher on keybinding
- `chrome/browser/ui/browser_command_controller.cc` — remap Ctrl+Tab
- `chrome/browser/ui/tabs/tab_strip_model.cc` — expose tab metadata for cards
- `chrome/browser/ui/views/tabs/tab_strip.cc` — integrate with grouping

**Effort:** 10-14 hours

---

## 28. Zen-Style Compact Browsing — Multi-Row Tabs & Glance

> **Inspired by:** [Zen Browser](https://zen-browser.app/) — a Firefox-based browser loved for its multi-row tab bar, compact mode, split view workspaces, and "Glance" peek feature. AMI adopts the best UX ideas and improves them with AI integration.

### What it is
A set of UX enhancements inspired by Zen Browser's browsing philosophy: **see more tabs without scrolling** (multi-row tab bar), **minimize UI chrome** (compact mode), **peek at links without leaving the page** (Glance), and **workspace-aware tab containers** (enhanced Spaces). These are complementary to existing features in §2, §3, and §6.

### Why it requires a binary change
Chromium's tab strip is hardcoded to a single row. Multi-row tabs, compact toolbar collapsing, and native Glance overlays all require modifying the browser's native views layer.

### Implementation Plan

#### 28.1 Multi-Row Tab Bar

**The problem:** When users have 30+ tabs, single-row tabs become unreadable tiny slivers. Scrolling tab strips (Chrome's approach) hide most tabs. Vertical tabs (§6) solve this but consume horizontal space.

**Zen's solution:** Tabs wrap into multiple rows. AMI adopts this with intelligence.

```
┌─────────────────────────────────────────────────────────────┐
│ Row 1: │ GitHub │ Gmail │ YouTube │ Stack │ Docs │ Reddit │  │
│ Row 2: │ AMI Hub │ Figma │ Notion │ AWS │ Jira │ Slack  │  │
│ Row 3: │ PR #42 │ MDN │ Gemini │ Deploy │ ← overflow row   │
├─────────────────────────────────────────────────────────────┤
│ 🔍 ← 🏠   https://github.com/yassirboudda/AMIBrowser  ☆ ⋯│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Web Content                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Settings:** Settings → Appearance → "Tab Layout":
- **Single row** (Chrome default) — tabs shrink and scroll
- **Multi-row** (Zen-style) — tabs wrap, max 2-4 rows (configurable), then scroll
- **Vertical sidebar** (§6) — tabs on the left
- **Hidden** — no tab bar, use tab switcher (§27) or keyboard only

**Behavior:**
- Max rows configurable: 2, 3, 4, or "auto" (grows as needed up to ¼ of window height)
- Active tab always visible (auto-scrolls to row containing it)
- Drag tabs between rows to reorder
- Tab groups span across rows naturally
- Pinned tabs always on row 1 (compact icon-only)
- When window too narrow, rows adapt — tabs never go below a minimum width (120px)

#### 28.2 Compact Mode — One-Line Toolbar

**What it is:** Collapses the toolbar + tab bar into a single slim line for maximum content area. Ideal for small screens or focused browsing.

```
Normal mode:
┌────────────────────────────────────────────────────┐
│ │ Tab 1 │ Tab 2 │ Tab 3 │ + │                      │  ← Tab bar
├────────────────────────────────────────────────────┤
│ ← → 🏠 │ https://example.com          │ ⋯ ☆ ⬇ │  ← Toolbar
├────────────────────────────────────────────────────┤
│                 Web Content                        │
└────────────────────────────────────────────────────┘

Compact mode:
┌────────────────────────────────────────────────────┐
│ ◉ Tab 1 │ ◉ Tab 2 │ ← → │ example.com    │ ⋯ ☆  │  ← Combined
├────────────────────────────────────────────────────┤
│                 Web Content                        │
│                 (more vertical space!)              │
└────────────────────────────────────────────────────┘
```

**How it works:**
- Toggle: `Ctrl+Shift+B` → compact mode (or Settings → Appearance → "Compact toolbar")
- Tab bar and address bar merge into one row
- Tabs show as compact pills (favicon + short title) on the left
- URL bar occupies remaining space on the right
- Navigation buttons (← → 🏠) show between tabs and URL
- Toolbar buttons (extensions, menu) are icon-only, right side
- Hover over the combined bar to see full tab titles in tooltip
- Full URL shown on hover/focus; shows only domain normally

**Auto-compact rules:**
- Option: "Auto-compact in fullscreen" — enters compact mode when F11 pressed
- Option: "Auto-compact on small screens" — triggers when window width < 800px

#### 28.3 Glance — Peek at Links Without Leaving

**What it is:** Hold `Alt` and click a link to open it in a floating preview panel overlaid on the current page. Read the content, then dismiss or promote to a full tab. No context switching.

```
┌────────────────────────────────────────────────────┐
│                  Current Page                      │
│                                                    │
│    Some article with a [link]...                   │
│                    ┌──────────────────────┐         │
│                    │ ╳  Glance Preview    │         │
│                    │ ─────────────────── │         │
│                    │                     │         │
│                    │  Preview of linked  │         │
│                    │  page content       │         │
│                    │  rendered live       │         │
│                    │                     │         │
│                    │ [Open in Tab] [Close]│         │
│                    └──────────────────────┘         │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Activation:**
- `Alt + Click` on any link → opens Glance preview
- Or right-click link → "Glance at this link"
- Or hover a link for 1.5 seconds (optional, off by default)

**Behavior:**
- Glance panel is a floating WebContents overlay (30-50% of window width)
- Draggable and resizable
- Navigation inside Glance works (click links inside preview, back/forward)
- Dismiss: `Esc`, click outside, or click ✕
- Promote: click "Open in Tab" → becomes a full tab, Glance closes
- Multiple Glances: up to 2 simultaneous (stacked)
- Glance panel inherits the page's ad blocking and shield settings

**AI Enhancement:**
- If the linked page is behind a loading wall, Glance shows AI summary while loading
- For PDF/document links, Glance uses Reader Mode (§13) inside the panel

#### 28.4 Tab Containers — Visual Workspaces

**What it is:** Extends Tab Groups (Chrome's built-in feature) with Zen-style visual containers. Each container gets a colored border area in the tab bar, making groups visually distinct even with many tabs open.

```
┌─────────────────────────────────────────────────────────────────┐
│ ┃ ╭───────╮╭───────╮╭───────╮┃ ╭───────╮╭───────╮┃ ╭───────╮  │
│ ┃ │GitHub ││PR#42 ││Issues │┃ │Gmail  ││Drive  │┃ │Reddit │  │
│ ┃ ╰───────╯╰───────╯╰───────╯┃ ╰───────╯╰───────╯┃ ╰───────╯  │
│ ┃    Work (blue)             ┃   Google (red)     ┃  Ungrouped  │
└─────────────────────────────────────────────────────────────────┘
```

- Each group has a subtle colored left border (2px) running the full height of the tab rows
- Container colors match Tab Group colors
- Dragging tabs between containers auto-assigns the group
- Right-click container border → Rename, Recolor, Collapse, Close All, Move to Space

#### 28.5 Sidebar Web Panels (Zen-Style)

**What it is:** Pin any website as a persistent sidebar panel. Like a split view but one side is a thin, always-visible panel for tools like chat, music, notes.

```
┌─────────┬──────────────────────────────────────────┐
│ 💬 Chat │                                          │
│ ─────── │                                          │
│ Slack   │          Main Web Content                │
│ messages│                                          │
│ ...     │                                          │
│         │                                          │
│ 🎵 ──── │                                          │
│ Spotify │                                          │
│ Now     │                                          │
│ Playing │                                          │
└─────────┴──────────────────────────────────────────┘
```

**How it works:**
- Right-click any tab → "Pin as Side Panel"
- Side panel is always visible (unless collapsed) — survives tab switching
- Multiple panels can be stacked vertically in the sidebar
- Click panel header to expand/collapse individual panels
- Panel width: draggable (100px - 400px), saved per site
- Panels load as mobile-viewport WebContents (responsive layout)
- Pre-configured panels: AMI Chat, Music Player, Notes

**Files to create:**
```
chrome/browser/ui/views/tabs/
├── multi_row_tab_strip.h / .cc          — multi-row wrapping layout
├── compact_toolbar_view.h / .cc         — merged tab+URL bar
chrome/browser/ui/views/glance/
├── glance_overlay.h / .cc               — floating preview WebContents
├── glance_controller.h / .cc            — Alt+Click handler + lifecycle
chrome/browser/ui/views/web_panel/
├── web_panel_sidebar.h / .cc            — sidebar panel container
├── web_panel_item.h / .cc               — individual pinned panel
```

**Files to modify:**
- `chrome/browser/ui/views/tabs/tab_strip.cc` — multi-row layout mode
- `chrome/browser/ui/views/frame/browser_view.cc` — compact mode + glance overlay + sidebar panels
- `chrome/browser/ui/views/toolbar/toolbar_view.cc` — compact merging
- `chrome/browser/ui/views/tabs/tab_group_header.cc` — container visual borders
- `chrome/browser/ui/browser_command_controller.cc` — Ctrl+Shift+B binding
- `chrome/browser/ui/views/frame/contents_layout_manager.cc` — sidebar panel layout

**Edge cases:**
- Multi-row + vertical tabs: mutually exclusive (settings radio)
- Compact mode + multi-row: allowed but defaults to max 2 rows
- Glance + Split View: Glance floats on top of the focused split side
- Sidebar panels persist across restarts (saved in session data)
- Sidebar panels don't count toward the tab count
- Print / DevTools / Find: operate on the main content, not sidebar panels

**Effort:** 14-20 hours (multi-row: 4-6h, compact: 3-4h, glance: 4-6h, containers: 1-2h, sidebar panels: 3-4h)

---

*This document is the complete build plan for AMI Browser V3. Every section requires touching the Chromium binary. Extension-level features (AI chat logic, integration configs, skills library) are handled by the Hub extension outside of this build.*

---

## 29. V3 AI Architecture — Server-Side Proxy (No BYO Keys)

### Problem (V2)
In V2, users must configure their own API keys for each AI provider (OpenAI, Anthropic, Mistral, Ollama, etc.). This creates:
- Friction during onboarding (copy-paste keys, figure out plans)
- Support burden (invalid keys, rate limits, billing confusion)
- Inconsistent experience (free models vary by provider)

### V3 Architecture: All AI Through `ami.exchange`
V3 users **never see or configure AI provider keys**. All chat/completion requests go through the AMI backend at `https://api.ami.exchange/api/ami/chat`.

#### Backend Fallback Chain
```
User → AMI Browser → https://api.ami.exchange/api/ami/chat
                          ↓
                    1. Ollama Cloud (free)
                          ↓ (if fails/rate-limited)
                    2. Mistral (paid key)
                          ↓ (if fails)
                    3. Mistral (free key)
```

#### Endpoints (already deployed)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ami/health` | None | Service status |
| POST | `/api/ami/chat` | Premium | Chat completion (streaming + non-streaming) |
| GET | `/api/ami/models` | Premium | List available models from all providers |
| GET | `/api/ami/providers` | Premium | Provider status & default models |

#### Subscription Gate
- **Free tier**: No AI access (can use the browser, extensions, etc.)
- **Premium (20€/month)**: Unlimited AI through the proxy
- **Discount code `amidev`**: 1 year free premium (early access / developer testing)

#### Extension Changes for V3
1. **Remove** the provider configuration UI (connections panel key inputs)
2. **Remove** client-side API key storage
3. **Replace** direct provider calls in `gateway.js` with a single `fetch("https://api.ami.exchange/api/ami/chat", { ... })` call
4. **Auth**: Extension authenticates via Clerk JWT token in Authorization header
5. **Model selector**: Fetches available models from `/api/ami/models` instead of per-provider model lists

#### Hub Extension Gateway Rewrite (V3)
```javascript
// V3 gateway — single backend call, no client-side keys
async function amiChat(messages, opts = {}) {
  const token = await getAuthToken(); // Clerk JWT
  const res = await fetch("https://api.ami.exchange/api/ami/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      model: opts.model,
      stream: opts.stream || false,
      temperature: opts.temperature,
      max_tokens: opts.max_tokens,
    }),
  });
  if (!res.ok) throw new Error(`AMI API error: ${res.status}`);
  return opts.stream ? res.body : res.json();
}
```

### Benefits
- Zero-config AI for end users
- Backend controls cost, rate limiting, model rotation
- Can add new providers without browser updates
- Subscription revenue covers API costs
- Clean separation: browser = UX, server = AI brains

### Migration Path (V2 → V3)
- V2 continues to work with BYO keys (extension-level, no binary change)
- V3 binary ships with the new Hub extension that uses the proxy
- Users with existing keys can still configure them as "override" (optional)

*Last updated by: AMI Exchange Engineering Team*

---

## 30. Replace Native Chromium "Ask AI" / Side Panel Button with AMI Chat

### Problem
The native Chromium toolbar includes an "Ask" button (and related side panel) that opens the built-in Chromium AI panel. In AMI Browser this button:
- Fails to open or shows an error (incompatible with our patched binary)
- Conflicts with the AMI Chat experience
- Exposes Chromium branding to users

### Goal
Remove the native "Ask AI" toolbar button and suppress the Lens/Gemini side panel. Replace with an AMI Chat trigger that opens the AMI FAB chat overlay or focuses the Hub chat panel.

### Implementation Plan

#### Binary-level (V3 C++ changes)
- **Remove the Ask button entry** from `browser_actions_container.cc` / `chrome/browser/ui/views/toolbar/toolbar_view.cc`
- **Suppress the side panel** for Lens / AI features: patch `SidePanelRegistry` to skip registering `kLens`, `kReadingList`, `kSideSearch`, `kAssistant` panel entries
- **Hide the Side Panel toolbar button** — AMI V3 will use its own sidebar (see Section 6)

#### Extension-level (Hub extension — can ship in V2)
Extend the existing branding hider in `content-inject.js` to also suppress:
```js
const EXTRA_CHROME_HIDE = [
  'cr-button[data-value="side-panel"]',
  'button[aria-label*="Ask"]',
  'button[title*="Ask"]',
  'button[aria-label*="Gemini"]',
  'side-panel-app',
  'lens-side-panel-app',
];
```
If the Ask button click survives, intercept it in a content script and redirect:
1. Fire `window.postMessage({ type: 'AMI_OPEN_CHAT' }, '*')` to open the FAB panel
2. Or navigate to `chrome-extension://[ext-id]/hub.html#chat`

#### UX Replacement
- The AMI FAB (`Ctrl+Shift+A`) already provides Ask AI on every page
- The Hub new-tab chat (centre column) covers in-depth agent interactions
- **V3 toolbar idea**: add a small AMI brain/chat icon where the native Ask button was, wired to open the FAB panel

### Notes
- V2 partial coverage: the NTP footer hider IIFE in `hub.js` already hides `button[title*="Chrome"]` and similar elements
- Full removal requires patching `toolbar_view.cc` — a V3 binary task
- Do NOT surface Gemini / Google AI branding in AMI Browser

---

## 31. Opera-Style Chromium WebUI Takeover — Full Internal Page Redesign

> **Inspired by:** Opera Browser — 100% Chromium-based yet users never feel like they're in Chrome. Opera achieves this by not just reskinning colors but by **relocating, restructuring, and redesigning** every embedded Chromium internal page. UI elements are moved to new positions, whole sections are reordered, and the layout language is entirely their own.
>
> **AMI's goal:** Every `chrome://` page should feel like it was built from scratch by the AMI team. No Chromium-trained muscle memory should work. Users should feel they are in a completely different, purpose-built product.

---

### Why This Is Different From §22 (Visual Identity)

Section 22 applies AMI's color palette and fonts to Chromium's internal pages — like a coat of paint. **Section 31 goes further:** it changes the *structure and layout* of those pages. Elements are moved to different positions, sections are reordered to prioritize AMI-relevant content, and entire layout patterns are replaced (e.g., Chrome's flat list settings become AMI's card-based grouped settings).

The key insight from Opera: **visual restyling alone isn't enough**. If a user opens `chrome://extensions` and the "Developer mode" toggle is in the exact same top-right corner it always was in Chrome, they know they're in a Chromium browser. Move that toggle to the sidebar, reorder the extension cards, change the grid layout — now it feels foreign. Now it feels like AMI.

---

### 31.1 The Opera Principle — Element Displacement

**Rule:** Every internal page must have at least **3 structural differences** from its Chrome equivalent:
1. One major element moved to a different location
2. One section reordered or regrouped
3. One new AMI-specific element added (or one Chrome-specific element removed)

This is not arbitrary — it creates a consistent sense that the user is NOT in Chrome, reinforced across every page they visit.

---

### 31.2 Implementation Strategy — Two Layers

#### Layer 1: CSS Layout Override (Fast — No HTML Changes Needed)
For layout changes achievable with CSS alone (flexbox reordering, grid repositioning, show/hide, padding, border-radius, typography):

```css
/* ami-webui-layout.css — injected into ALL chrome:// pages */
/* Example: move developer mode to top of extensions page */
extensions-manager {
  --developer-mode-position: flex-start; /* was: flex-end */
}
cr-toolbar-search-field {
  order: -1; /* move search before title */
}
```

This CSS is injected via the shared `ami_chrome_pages.css` mechanism from §22.19, but with layout rules in addition to color rules.

#### Layer 2: HTML Template Patching (For Deeper Restructuring)
For changes that require moving elements across DOM boundaries or changing component hierarchy — requires editing the TypeScript/HTML WebUI source files directly:

- `chrome/browser/resources/extensions/` — Extension Manager
- `chrome/browser/resources/settings/` — Settings
- `chrome/browser/resources/history/` — History
- `chrome/browser/resources/downloads/` — Downloads
- `chrome/browser/resources/bookmarks/` — Bookmarks
- `chrome/browser/resources/flags/` — Flags
- `chrome/browser/resources/new_tab_page/` — New Tab Page (also §5)

For each page: edit the Lit/Polymer components directly in the Chromium source tree, then rebuild. These are `.ts` / `.html` files compiled into the binary — changing them requires a full binary rebuild.

---

### 31.3 Page-by-Page Redesign Specifications

#### `chrome://extensions` — Extension Manager

**Chrome's layout:**
```
┌──────────────────────────────────────────────────────┐
│  Extensions                          [Developer mode ○]│ ← toggle top-right
│  Search extensions...                                  │
│                                                        │
│  ╔══════════╗  ╔══════════╗  ╔══════════╗             │
│  ║ Ext Name ║  ║ Ext Name ║  ║ Ext Name ║             │
│  ║ [icon]   ║  ║ [icon]   ║  ║ [icon]   ║             │
│  ║ enabled○ ║  ║ enabled○ ║  ║ enabled○ ║             │
│  ╚══════════╝  ╚══════════╝  ╚══════════╝             │
│                                                        │
│  [ Chrome Web Store ]                                  │
└──────────────────────────────────────────────────────┘
```

**AMI's layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─────────────────┐  ┌──────────────────────────────────────┐│
│ │ AMI Extensions  │  │  Search extensions...           🔍   ││
│ │ ─────────────── │  │                                      ││
│ │ All Extensions  │  │  ╭──────────╮  ╭──────────╮          ││
│ │ Enabled   (12)  │  │  │ Ext Name │  │ Ext Name │          ││
│ │ Disabled   (3)  │  │  │ [icon]   │  │ [icon]   │          ││
│ │ ─────────────── │  │  │ ○ On     │  │ ○ On     │          ││
│ │ 🛠 Dev Tools    │  │  ╰──────────╯  ╰──────────╯          ││
│ │   Dev Mode  ○   │  │                                      ││
│ │   Load unpacked │  │  ╭──────────╮  ╭──────────╮          ││
│ │   Pack ext...   │  │  │ Ext Name │  │ Ext Name │          ││
│ │ ─────────────── │  │  │ [icon]   │  │ [icon]   │          ││
│ │ 🏪 AMI WebStore │  │  │ ● Off    │  │ ○ On     │          ││
│ └─────────────────┘  ╰──────────╯  ╰──────────╯          ││
│                       └──────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **Developer mode** moved from a toggle in the top-right header → into a dedicated **"Dev Tools" sidebar section** with individual action buttons (Load unpacked, Pack extension). No longer a single toggle buried in the corner — it's a feature group
2. **Left sidebar** added with extension filter categories (All / Enabled / Disabled) and Dev Tools section
3. **Chrome Web Store link** removed; replaced with **AMI WebStore** link in sidebar
4. **Extension cards** redesigned: icon larger, toggle more prominent, version/ID shown only on hover
5. **Search bar** moved to top of the content area (not above the heading)

**Files:**
- `chrome/browser/resources/extensions/extensions.html` — add sidebar wrapper
- `chrome/browser/resources/extensions/toolbar.html` / `toolbar.ts` — move dev mode toggle
- `chrome/browser/resources/extensions/extensions_item.html` — redesign card layout
- New CSS: `chrome/browser/resources/extensions/ami_extensions_layout.css`

---

#### `chrome://settings` — Settings

**Chrome's layout:** Long flat sidebar list → single content area. Settings categories are listed vertically in a left nav.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  ⚙ AMI Settings                      🔍 Search settings...    │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🤖 AMI & AI                              [most used]     │  │
│  │  AI Providers · Skills · Automations · Mission Control   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │ 🔒 Privacy          │  │ 🎨 Appearance                   │  │
│  │  Shield · Tracking  │  │  Theme · Fonts · Layout         │  │
│  │  Cookies · Certs    │  │  Sidebar · Compact mode         │  │
│  └─────────────────────┘  └─────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │ 🏦 Rewards & Wallet │  │ 🔌 Connected Apps               │  │
│  │  Balance · History  │  │  Gmail · Slack · Notion · +more │  │
│  │  Auto-approve rules │  │  OAuth tokens · Permissions     │  │
│  └─────────────────────┘  └─────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │ 🌐 Browser          │  │ ⚡ Advanced                     │  │
│  │  Tabs · Downloads   │  │  Languages · Reset · Developer  │  │
│  │  Startup · Search   │  │  Flags · Internals              │  │
│  └─────────────────────┘  └─────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **AMI & AI section added at the TOP** — first thing users see is AMI-specific settings, not "You and Google" (which is removed/renamed)
2. **Card-based grid layout** replaces Chrome's long sidebar list — 2-column grid of category cards (like iOS Settings)
3. **"You and Google" section** removed entirely (or renamed "Account & Sync" with Google references stripped)
4. **Rewards & Wallet and Connected Apps** cards added (AMI-specific, not in Chrome)
5. **Search bar** moved to the page header (same position, but AMI-styled and searches AMI settings too)
6. **"Advanced" section collapsed** — Chrome's advanced settings are less prominent; AMI's are card-accessible

**Files:**
- `chrome/browser/resources/settings/settings_main.html` / `.ts` — rewrite main layout
- `chrome/browser/resources/settings/settings_menu.html` / `.ts` — remove "You and Google" category, add AMI category
- New: `chrome/browser/resources/settings/ami_settings_landing.html` — card grid landing page
- `chrome/browser/ui/webui/settings/settings_ui.cc` — register AMI settings handlers

---

#### `chrome://history` — History

**Chrome's layout:** Simple list with a search bar at the top. Grouped by day.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  History                                                       │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ 🧠 Smart Search   Ask anything: "that ML article I     │   │
│  │                   read on Tuesday"              [→]    │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  [All]  [Today]  [This week]  [Images]  [Videos]  [Docs]      │  ← filter chips
│                                                                │
│  ── Today ──────────────────────────────────────────────────   │
│  🕐 14:32  example.com  · Article: "Understanding LLMs"        │
│  🕐 13:15  github.com   · "my-project" repository              │
│                                                                │
│  ── Yesterday ─────────────────────────────────────────────   │
│  🕐 18:04  youtube.com  · "How neural networks work"           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **Smart Search bar pinned at the top** (hooks into §7 Smart History) — replaces Chrome's basic keyword search
2. **Filter chips row** added below search — "Today", "This week", content type filters (Images, Videos, Docs). Chrome has no quick filters
3. **Visit metadata** shown inline — page description, content type icon, reading time estimate
4. **"Remove from history" button** visible on hover (Chrome buries it in a `⋮` menu)
5. **Grouped visits** to the same domain collapsible (e.g., "12 visits to github.com today → [show all]")

**Files:**
- `chrome/browser/resources/history/history_list.html` / `.ts` — add filter chips, inline metadata
- `chrome/browser/resources/history/history_toolbar.html` / `.ts` — replace search with Smart Search
- `chrome/browser/ui/webui/history/history_ui.cc` — Smart Search data handler (links to §7)

---

#### `chrome://downloads` — Downloads

**Chrome's layout:** Full-width list, each entry has filename, URL, progress bar, and action buttons in a row.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  Downloads                                                     │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  [All]  [In progress (2)]  [Complete]  [Documents]  [Images]  │
│                                                                │
│  ── In Progress ───────────────────────────────────────────   │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ 📄 report-q2.pdf                           [Pause] [✕] │   │
│  │ From: docs.google.com                                  │   │
│  │ ████████████░░░░░░  65%  · 4.2 MB / 6.5 MB · 12s left │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  ── Complete ──────────────────────────────────────────────   │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ 📷 screenshot-2026.png          [Open] [Show] [🤖 Rename]│  │
│  │ 2.1 MB · Downloaded at 13:04 from ami.exchange         │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **Filter chips at top** — "In Progress", "Complete", by file type (Documents, Images, Videos, etc.). Chrome has no filtering
2. **Card layout** instead of flat list — each download is a rounded card (consistent with AMI's design language)
3. **"🤖 Rename" button** on completed downloads — triggers Tidy Downloads AI rename suggestion (§9)
4. **Progress bar redesign** — full-width within the card, purple gradient, shows percentage + speed + ETA
5. **Status sections** — "In Progress" group shown first, then "Complete" (Chrome mixes them with no grouping)

**Files:**
- `chrome/browser/resources/downloads/downloads.html` / `.ts` — card layout, filter chips
- `chrome/browser/resources/downloads/item.html` / `.ts` — card redesign, Rename button
- `chrome/browser/ui/webui/downloads/downloads_ui.cc` — Tidy Rename integration

---

#### `chrome://bookmarks` — Bookmarks Manager

**Chrome's layout:** Left sidebar tree + right panel list. Looks like a file manager from 2012.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  Bookmarks                          🔍 Search    [+ New folder]│
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  [All]  [Work]  [Personal]  [Research]  [To Read]             │  ← folder chips
│                                                                │
│  ── Work ──────────────────────────────────────────────────   │
│  ╭──────────────╮  ╭──────────────╮  ╭──────────────╮        │
│  │ [favicon]    │  │ [favicon]    │  │ [favicon]    │        │
│  │ GitHub Repo  │  │ Jira Board   │  │ Confluence   │        │
│  │ github.com   │  │ jira.com     │  │ atlassian.com│        │
│  ╰──────────────╯  ╰──────────────╯  ╰──────────────╯        │
│                                                                │
│  ── Personal ──────────────────────────────────────────────   │
│  ╭──────────────╮  ╭──────────────╮                          │
│  │ [favicon]    │  │ [favicon]    │                          │
│  │ Recipe Blog  │  │ Travel Plans │                          │
│  │ food.com     │  │ airbnb.com   │                          │
│  ╰──────────────╯  ╰──────────────╯                          │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **Visual card grid** replaces the tree-list file manager look
2. **Folder chips** at the top for one-click folder navigation
3. **Favicons displayed prominently** in cards (Chrome shows them as tiny 16px icons in a list)
4. **Sidebar removed** — navigation is via chips, consistent with AMI's chip-based navigation pattern
5. **Right-click → rename/delete** preserved; also accessible via card hover menu

**Files:**
- `chrome/browser/resources/bookmarks/bookmarks_list.html` / `.ts` — card grid layout
- `chrome/browser/resources/bookmarks/bookmarks_toolbar.html` — folder chip nav

---

#### `chrome://flags` — Experimental Features

**Chrome's layout:** Long searchable list, each flag is a row with a dropdown.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  ⚑ AMI Experimental Features                                  │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  ⚠️  Experimental features may cause instability.             │
│                                                                │
│  🔍 Search flags...                                           │
│                                                                │
│  ── AMI Features ─────────────────────────────────────────    │  ← AMI-specific group
│  ╭────────────────────────────────────────────────────────╮   │
│  │ AMI Mission Control Live Capture FPS         [Default▾]│   │
│  │ Adjust real-time tab capture frame rate                │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  ── Enabled ──────────────────────────────────────────────    │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ GPU Rasterization                              [Enabled]│   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  ── Available ────────────────────────────────────────────    │
│  ...                                                          │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **Title changed** from "Experiments" to "AMI Experimental Features"
2. **AMI-specific flags section** pinned at the top (flags that control AMI V3 features: Mission Control FPS, Smart History, Vision AI mode, etc.)
3. **"Enabled" group** shown before the full list — quickly see what you've changed
4. **Chrome branding references** ("Google Chrome Experiments") replaced with AMI branding
5. **Flag cards** use AMI's card style with rounded corners; dropdowns use AMI's custom dropdown style

**Files:**
- `chrome/browser/resources/flags/flags.html` / `.ts` — AMI section, reordering, branding
- `chrome/browser/ui/webui/flags/flags_ui.cc` — inject AMI feature flags at top

---

#### `chrome://newtab` — New Tab Page

Already covered in §5 (Chat-First NTP). The key layout changes (chat input centered, AMI branding, no Google Search bar) are specified there. Listed here for completeness as part of the full internal pages overhaul.

---

#### `chrome://version` — Version Info

**Chrome's layout:** Plain text dump of version strings, command line, path info.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  [AMI Logo]  AMI Browser  v3.0.2  (Stable)                    │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  🖥️  Build          3.0.2.1 (Official Build) linux/x64        │
│  ⚙️  Chromium Base  146.0.7680.80                              │
│  🔧  Node Version   20.20.2 (bundled)                          │
│  🧩  Revision       [git hash]                                 │
│                                                                │
│  ── Paths ────────────────────────────────────────────────    │
│  Profile:   /home/user/.config/ami-browser/Default            │
│  Binary:    /usr/lib/ami-browser/ami-browser                  │
│                                                                │
│  ── Command Line (click to copy) ────────────────────────    │
│  /usr/lib/ami-browser/ami-browser --flag1 --flag2...          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **AMI logo and branding** at the top — not a plain text dump
2. **Chromium base version** shown but labeled "Chromium Base" (not "Google Chrome")
3. **Card layout** for key info, not a flat text dump
4. **"Copy" button** for the command line (saves manual select-all)

**Files:**
- `chrome/browser/resources/version/version.html` / `.ts` — card layout, AMI logo, copy button
- `chrome/browser/ui/webui/version/version_ui.cc` — AMI branding strings

---

#### `chrome://about` — About Page

Remove entirely or redirect to `chrome://version`. Chrome's about page is a thin wrapper.

**Implementation:** Return a `302` redirect from `chrome://about` to `chrome://version` in `chrome/browser/ui/webui/about_ui.cc`.

---

#### `chrome-devtools://devtools` — Developer Tools

DevTools is complex — a full web app in itself. AMI makes targeted changes rather than a full rewrite:

**Targeted changes:**
1. **DevTools color theme** — ships with an AMI dark theme preset (navy background `#1a1a2e`, accent `#e94560`) available in DevTools Settings → Themes → "AMI Dark"
2. **DevTools header** — subtle AMI logo watermark on the panel header (top-left, very faint)
3. **"Powered by" attribution** — DevTools credits panel updated to reflect AMI Browser
4. **Console welcome message** — change the DevTools console welcome message:
   ```
   // Chrome shows: "Welcome to Chrome DevTools"
   // AMI shows:
   console.log('%cAMI Browser DevTools', 'color: #e94560; font-size: 18px; font-weight: bold;');
   console.log('%cTip: Try window.__ami to access AMI Browser APIs', 'color: #94a3b8;');
   ```
5. **No Google Analytics / error reporting** from DevTools (Chromium already strips these in non-Google builds)

**Files:**
- `third_party/devtools-frontend/src/front_end/core/sdk/` — console welcome message
- `third_party/devtools-frontend/src/front_end/ui/legacy/themes/` — add AMI theme preset

---

#### `chrome://inspect` — Remote Debugging

**Changes:**
- Replace "Chrome" branding in the page title and headings with "AMI Browser"
- Dark theme applied via the shared `ami-webui-layout.css`
- No structural layout changes needed

**Files:**
- `chrome/browser/resources/inspect/inspect.html` — string replacements
- CSS override via shared stylesheet

---

#### `chrome://net-internals` and `chrome://gpu`

**Changes:** Dark theme only via shared stylesheet. No structural changes — these are power-user/diagnostic pages where Chrome-default layout is familiar to the target audience (developers).

---

### 31.4 Shared WebUI Injection System

A single mechanism injects both the color CSS (§22.19) and the layout CSS (§31) into every `chrome://` page. This avoids per-page boilerplate.

```cpp
// In chrome/browser/ui/webui/chrome_web_ui_controller_factory.cc
// During WebUI controller creation, inject shared AMI stylesheets

void InjectAMIStylesheets(content::WebUIDataSource* source) {
  // Layer 1: Colors + fonts (from §22)
  source->AddResourcePath("ami_chrome_pages.css",
      IDR_AMI_CHROME_PAGES_CSS);

  // Layer 2: Layout overrides (from §31)
  source->AddResourcePath("ami_webui_layout.css",
      IDR_AMI_WEBUI_LAYOUT_CSS);

  // Force-inject both into the page's HTML <head>
  source->UseStringsJs();
  source->AddString("amiStylesheets", R"(
    <link rel='stylesheet' href='chrome://resources/ami_chrome_pages.css'>
    <link rel='stylesheet' href='chrome://resources/ami_webui_layout.css'>
  )");
}
```

Each WebUI page's base HTML includes `$i18n{amiStylesheets}` in `<head>` — already a Chromium pattern used for localization strings.

---

### 31.5 Key CSS Layout Primitives

These are the CSS rules that power most of the element displacement across pages without requiring HTML changes:

```css
/* ============================================================
   ami-webui-layout.css
   AMI Browser — WebUI Layout Override Layer (§31)
   Applied to: all chrome:// and chrome-untrusted:// pages
   ============================================================ */

/* --- Global AMI Layout Resets --- */
:root {
  --ami-bg:         #1a1a2e;
  --ami-surface:    #16213e;
  --ami-card:       #0f3460;
  --ami-accent:     #e94560;
  --ami-accent-alt: #7c3aed;  /* purple variant */
  --ami-text:       #e2e8f0;
  --ami-muted:      #94a3b8;
  --ami-border:     #2d2d4a;
  --ami-radius:     12px;
  --ami-card-radius: 10px;
  --ami-transition: 150ms ease;
}

/* --- Card layout helper (used by extensions, downloads, bookmarks) --- */
.ami-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 24px;
}

.ami-card {
  background: var(--ami-surface);
  border: 1px solid var(--ami-border);
  border-radius: var(--ami-card-radius);
  padding: 16px;
  transition: border-color var(--ami-transition), box-shadow var(--ami-transition);
}

.ami-card:hover {
  border-color: var(--ami-accent-alt);
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.15);
}

/* --- Filter chips (history, downloads, bookmarks) --- */
.ami-chips {
  display: flex;
  gap: 8px;
  padding: 0 24px 16px;
  flex-wrap: wrap;
}

.ami-chip {
  background: var(--ami-surface);
  border: 1px solid var(--ami-border);
  border-radius: 20px;
  padding: 4px 14px;
  font-size: 13px;
  color: var(--ami-muted);
  cursor: pointer;
  transition: all var(--ami-transition);
}

.ami-chip.active,
.ami-chip:hover {
  background: var(--ami-accent-alt);
  border-color: var(--ami-accent-alt);
  color: white;
}

/* --- Page header pattern --- */
.ami-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 16px;
  border-bottom: 1px solid var(--ami-border);
}

.ami-page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--ami-text);
}

/* --- Sidebar layout (extensions page) --- */
.ami-sidebar-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}

.ami-sidebar {
  background: var(--ami-surface);
  border-right: 1px solid var(--ami-border);
  padding: 16px 0;
}

.ami-sidebar-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ami-muted);
  padding: 16px 16px 8px;
}

.ami-sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-radius: 8px;
  margin: 0 8px;
  color: var(--ami-text);
  cursor: pointer;
  transition: background var(--ami-transition);
}

.ami-sidebar-item:hover,
.ami-sidebar-item.active {
  background: rgba(124, 58, 237, 0.15);
  color: white;
}
```

---

---

### 31.6 Additional User-Facing Internal Pages

These pages are opened regularly by normal users (not just developers). They must all pass the "Not Chrome" test.

---

#### `chrome://password-manager` — Password Manager

Chrome's password manager moved from settings into a dedicated page. It's heavily Google-branded.

**Chrome's layout:** Left sidebar (Passwords / Checkup / Settings) + right panel with a search bar and a flat list of credentials. The page logo is a Google key icon.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│ 🔑 AMI Vault                                                   │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  ┌─────────────────┐  ┌──────────────────────────────────────┐│
│  │ 🔑 Passwords    │  │ 🔍 Search passwords...               ││
│  │    (42)         │  │                                      ││
│  │ 🛡 Security     │  │  ── Recently used ──────────────    ││
│  │    Check        │  │  ╭─────────────────────────────────╮ ││
│  │ 💳 Passkeys     │  │  │ github.com                      │ ││
│  │    (8)          │  │  │ myuser@email.com  [Copy] [👁] [✏]│ ││
│  │ ⚙ Vault         │  │  ╰─────────────────────────────────╯ ││
│  │   Settings      │  │                                      ││
│  └─────────────────┘  │  ╭─────────────────────────────────╮ ││
│                       │  │ notion.so                        │ ││
│                       │  │ john@company.com [Copy] [👁] [✏] │ ││
│                       │  ╰─────────────────────────────────╯ ││
│                       └──────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **Title changed** from "Google Password Manager" / "Passwords" to **"AMI Vault"** — branding the password manager as AMI's own product
2. **Google key logo** replaced with AMI lock/vault icon
3. **"Passwords in your Google Account"** messaging removed — replaced with "Stored in your AMI Vault"
4. **Passkeys** added as a separate sidebar section (Chrome shows them mixed in the list)
5. **Credential cards** redesigned with AMI card style; action buttons visible on hover
6. **"Import from Google"** button changed to "Import passwords" (generic, no Google reference)
7. **Security Check section** — Chrome links to Google's security checkup page; AMI runs its own local breach check via HIBP API (Have I Been Pwned)

**Files:**
- `chrome/browser/resources/password_manager/password_manager_app.ts` — sidebar, branding
- `chrome/browser/resources/password_manager/passwords_section.ts` — credential card redesign
- `chrome/browser/ui/webui/password_manager/password_manager_ui.cc` — remove Google Account strings

---

#### `chrome://print` — Print Preview

**Chrome's layout:** Left panel (print settings) + right panel (page preview). Heavy use of material design dropdowns and a prominent "Print" button at the top.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  🖨 Print Preview                          [Cancel]  [Print →] │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐│
│  │ Destination          │  │                                 ││
│  │ [🖨 HP LaserJet  ▾]  │  │                                 ││
│  │                      │  │   [  PAGE PREVIEW  ]            ││
│  │ Pages  [All ▾]       │  │                                 ││
│  │ Copies  [1    ]      │  │                                 ││
│  │ Layout  [Portrait ▾] │  │                                 ││
│  │ Color   [Color ▾]    │  │                                 ││
│  │ ─────────────────    │  │                                 ││
│  │ ▾ More settings      │  └─────────────────────────────────┘│
│  │   Paper size         │                                     │
│  │   Scale              │  ← 1 of 3  →                       │
│  │   Margins            │                                     │
│  └──────────────────────┘                                     │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **Action buttons** (Cancel / Print) moved to the top header bar — Chrome has them at the top of the left panel only
2. **Settings panel** uses AMI card style with subtle dividers instead of material expansion panels
3. **Page navigation** (1 of 3) shown below the preview, not inside it
4. **"Send to Google Drive"** destination removed; only local printers and "Save as PDF"
5. **Dark-themed preview background** — the page preview sits on AMI's dark background instead of Chrome's light gray

**Files:**
- `chrome/browser/resources/print_preview/print_preview.ts` — header buttons, layout
- `chrome/browser/resources/print_preview/settings/` — AMI-styled settings panel
- `chrome/browser/resources/print_preview/preview_area.ts` — dark background

---

#### `chrome://tab-search` — Tab Search

Tab Search is the searchable tab list popup (Ctrl+Shift+A in Chrome, or the arrow on the tab strip).

**Chrome's layout:** A floating popup with a search bar at top, list of open tabs below grouped as "Open tabs" and "Recently closed".

**AMI's layout:**
```
╭──────────────────────────────────────────────────────╮
│ 🔍 Search tabs, history, bookmarks...                │  ← expanded scope
│                                                      │
│  ── Open (12) ──────────────────────────────────    │
│  ● GitHub · my-project / issues                      │
│    [favicon] github.com/yassirboudda...               │
│                                                      │
│  ○ Notion · Q2 Planning                              │
│    [favicon] notion.so/workspace/...                  │
│                                                      │
│  ── Automation tabs (3) ──────────────────────────  │  ← AMI-specific section
│  🔄 Amazon — Buy batteries  43%                      │
│  🔄 LinkedIn — Find MLEs    40%                      │
│                                                      │
│  ── Recently closed ──────────────────────────────  │
│  ✕ Stack Overflow · Python list comp...  2 min ago   │
│                                                      │
│  [Open Mission Control]                              │  ← AMI-specific action
╰──────────────────────────────────────────────────────╯
```

**Structural changes:**
1. **Search scope expanded** — searches not just tabs but also history and bookmarks (like a mini command palette)
2. **Automation tabs section** added between open tabs and recently closed — shows active automations with progress
3. **"Open Mission Control" button** at the bottom — quick shortcut to §18 Mission Control
4. **Tab previews on hover** — thumbnail preview on hover (Chrome only shows favicons)
5. **AMI keyboard shortcut** changed: `Ctrl+Shift+T` opens tab search (Chrome's default Ctrl+Shift+A conflicts with AMI Chat)

**Files:**
- `chrome/browser/resources/tab_search/tab_search_app.ts` — expanded search, AMI sections
- `chrome/browser/resources/tab_search/tab_search_item.ts` — tab hover previews
- `chrome/browser/ui/webui/tab_search/tab_search_ui.cc` — automation tab data provider

---

#### `chrome://certificate-manager` — Certificate Manager

**Chrome's layout:** Flat table of certificates organized by category (Personal, Trusted CAs, etc.) with Import/Export buttons.

**AMI's changes:**
- Dark theme via shared stylesheet
- **Certificate cards** instead of flat table rows — each cert shows domain, issuer, expiry date in a readable card
- **Expiry warnings** — certs expiring within 30 days shown with an amber indicator
- **"Import" button** repositioned to a floating action button (bottom-right), not in the header
- Remove any Google Trust Store / Google-branded CA references in the UI copy

**Files:**
- `chrome/browser/resources/certificate_manager/` — card layout
- `chrome/browser/ui/webui/certificate_manager/` — remove Google branding strings

---

#### `chrome://safety-check` / `chrome://settings/safetyCheck` — Safety Check

**Chrome's layout:** A page with a single "Check now" button and a list of check results (passwords, extensions, Chrome version, Safe Browsing status). All copy is Google-branded.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  🛡 AMI Security Check                                         │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  Last checked: 2 hours ago                   [Run Check →]    │
│                                                                │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ ✅ Passwords      42 saved · 0 compromised             │   │
│  │                   Powered by HIBP (local check)        │   │
│  ╰────────────────────────────────────────────────────────╯   │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ ✅ Extensions     12 active · 0 flagged                │   │
│  │                   No suspicious extensions found       │   │
│  ╰────────────────────────────────────────────────────────╯   │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ ✅ AMI Browser    v3.0.2 — Up to date                  │   │
│  ╰────────────────────────────────────────────────────────╯   │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ ✅ AMI Shield     Active — 1,247 blocked this session  │   │
│  ╰────────────────────────────────────────────────────────╯   │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **Title** changed to "AMI Security Check"
2. **"Check now" button** moved to the top header (not buried below a description paragraph)
3. **Result cards** with AMI card style — each category is a distinct card
4. **"Safe Browsing"** item replaced with **"AMI Shield"** (our ad/tracker blocker status)
5. **Password check** uses local HIBP instead of Google's password checkup service
6. **"Update Google Chrome"** item replaced with "Update AMI Browser"
7. **"Google account sync"** item removed entirely

**Files:**
- `chrome/browser/resources/settings/safety_check/` — card layout, AMI branding
- `chrome/browser/ui/webui/settings/safety_check_handler.cc` — replace Google-specific check logic

---

#### `chrome://privacy-sandbox-internals` / Privacy Sandbox Settings

Chrome has a Privacy Sandbox section in settings for ad topics/interests tracking. AMI's stance: **disabled and hidden**.

**Changes:**
- Hide the entire Privacy Sandbox settings section from `chrome://settings/privacySandbox`
- If accessed directly, show: "AMI Browser does not participate in Privacy Sandbox or interest-based advertising. This feature is disabled."
- Remove all Privacy Sandbox UI from settings menu
- Disable the underlying APIs at compile time (`blink::features::kPrivacySandboxAdsAPIs = false`)

**Files:**
- `chrome/browser/resources/settings/privacy_page/privacy_sandbox/` — replace with disabled notice
- `chrome/browser/ui/webui/settings/privacy_sandbox_handler.cc` — stub out

---

### 31.7 Settings Sub-Pages — Deep Redesign

Chrome's settings sub-pages (loaded at routes like `chrome://settings/privacy`, `chrome://settings/security`, etc.) all inherit the same flat material design list style. AMI redesigns each to use card groups.

#### `chrome://settings/privacy` — Privacy & Security

**Chrome's layout:** Long vertical list of toggles and links. Privacy Sandbox section prominent.

**AMI's layout:** Cards grouped by category:
```
╭────────────────────────────────────────────────────────────╮
│  🔒 Tracking Protection        [Enhanced ●]                │
│  Blocks third-party tracking. AMI Shield active.           │
╰────────────────────────────────────────────────────────────╯
╭────────────────────────────────────────────────────────────╮
│  🍪 Cookies                    [Block 3rd party ●]         │
│  Site cookies · Clear on close                             │
╰────────────────────────────────────────────────────────────╯
╭────────────────────────────────────────────────────────────╮
│  🕵 Browsing Data              [Clear data →]              │
│  History · Cookies · Cache                                 │
╰────────────────────────────────────────────────────────────╯
```

**Key changes:** Privacy Sandbox section removed. "Google account" and sync-related privacy options removed. AMI Shield toggle added at top.

---

#### `chrome://settings/security` — Security

**Chrome's layout:** Safe Browsing mode selector (Enhanced / Standard / No protection) is the dominant element.

**AMI's layout:**
- **"Safe Browsing"** relabeled to **"Threat Protection"** — AMI's own phrasing
- Safe Browsing mode selector redesigned as a visual radio card selector (not radio buttons with walls of text)
- **"Always use HTTPS"** toggle moved to the top (most actionable security setting)
- **Certificate transparency** and advanced options moved to a collapsible "Advanced" card

---

#### `chrome://settings/passwords` — Passwords (Settings Route)

Redirect to `chrome://password-manager` (the dedicated AMI Vault page, see §31.6). No split between settings and the dedicated page.

---

#### `chrome://settings/content` — Site Settings / Content Settings

**Chrome's layout:** Flat list of content types (location, camera, microphone, notifications, JavaScript, etc.).

**AMI's changes:**
- Group content settings into two visual columns: "Allowed by default" and "Blocked by default"
- Add **"AMI Agent Permissions"** section — which sites are allowed to be automated by AI agents (new permission type added in §17)
- Move "Notifications" to the top of the blocked column (most abused permission)

---

#### `chrome://settings/accessibility` — Accessibility

**Chrome's layout:** Simple list of toggles.

**AMI's changes:**
- Dark theme via shared stylesheet
- Group toggles into "Vision", "Motion", "Input" card sections
- **"High contrast"** toggle links to AMI's built-in high-contrast theme variant

---

### 31.8 Developer & Diagnostic Pages

These pages are used by developers and power users. They don't need full visual redesigns, but they must not look like Chrome. Apply AMI dark theme + targeted branding changes.

---

#### `chrome://net-internals` — Network Internals

Chromium's most powerful diagnostic tool. Used by developers to trace DNS lookups, HTTP connections, sockets, WebSockets, and more.

**AMI's changes beyond dark theme:**
- **Tab headers** (DNS / Sockets / HTTP/2 / QUIC / etc.) styled as AMI chip tabs instead of Chrome's gray tab bar
- **"DNS" tab renamed** to "DNS Resolver" for clarity
- **AMI Banner** added at the top: "AMI Network Internals — Powered by Chromium NetLog"
- **Export button** (`chrome://net-export/`) linked prominently as an icon button in the header
- **AMI Shield stats** shown in a new "Shield" tab: requests blocked, filter list version, last update

**Files:**
- `chrome/browser/resources/net_internals/` — tab styling, AMI banner, Shield tab

---

#### `chrome://gpu` — GPU Information

**AMI's changes:**
- Dark theme via shared stylesheet
- **Status table** rows use alternating `--ami-surface` / `--ami-bg` backgrounds (not Chrome's white/gray)
- **"Graphics Feature Status" section** moved to the top (most useful section) — Chrome shows "Version Information" first
- **AMI renderer tag**: add "AMI Browser Renderer" label next to GPU device name
- **Copy info button** — one-click copy of all GPU info for bug reports

**Files:**
- `chrome/browser/resources/gpu/` — section reordering, copy button, row styling

---

#### `chrome://webrtc-internals` — WebRTC Debugging

Used by developers debugging video/audio calls.

**AMI's changes:**
- Dark theme
- **Active connections** shown at the top with a count badge — Chrome shows them buried in a flat list
- **"Create dump" button** styled as AMI button (not Chrome's default material button)
- Connection state cards use AMI card style with color-coded status (green = connected, red = failed, gray = closed)

---

#### `chrome://media-internals` — Media Player Debugging

Used by developers debugging HTML5 audio/video.

**AMI's changes:**
- Dark theme
- Media player cards use AMI card style
- **Active players** shown first (not mixed with past players)
- Player state (playing/paused/buffering) shown with a colored indicator dot

---

#### `chrome://tracing` — Chrome Tracing Tool

Chrome's built-in performance profiler that records trace events across all browser processes.

**AMI's changes:**
- Dark theme
- **Record button** styled as a prominent AMI accent button (not Chrome's default gray)
- **Trace category checkboxes** use AMI-styled checkboxes
- **"Load" / "Save"** buttons use AMI's button style
- **Page title** changed from "chrome://tracing" in the header to "AMI Performance Tracer"

---

#### `chrome://omnibox` — Omnibox Debugging

Used by developers to debug omnibox autocomplete provider results.

**AMI's changes:**
- Dark theme
- Input field uses AMI omnibox style (matching the actual omnibox — consistent)
- Result rows use AMI card styling
- AMI custom providers (`@ami`, `@history`, etc. from §23) show their results here with an "AMI" badge

---

#### `chrome://discards` — Tab Discard Status

Shows which tabs are eligible for background discarding (memory savings).

**AMI's changes:**
- Dark theme
- **Table rows** use AMI styling with status color codes (green = active, amber = eligible for discard, red = discarded)
- **Automation tabs** (from §18) shown with a 🤖 badge and "Protected from discard" status — automation tabs must never be discarded
- **"Discard" button** per row uses AMI's danger button style (red)

---

#### `chrome://process-internals` — Browser Process Info

Shows the site isolation and process assignment model for open tabs.

**AMI's changes:**
- Dark theme
- Process assignment tree uses AMI's card/tree style
- Automation tabs highlighted with a distinct color

---

#### `chrome://serviceworker-internals` — Service Worker Debugging

**AMI's changes:**
- Dark theme
- SW registration cards use AMI card style
- Status badges (activated/installing/waiting) use AMI color tokens (green/amber/gray)

---

#### `chrome://indexeddb-internals` — IndexedDB Debugging

**AMI's changes:**
- Dark theme
- Origin/database tree uses collapsible AMI card panels

---

#### `chrome://quota-internals` — Storage Quota

**AMI's changes:**
- Dark theme
- Usage bars use AMI purple gradient (not Chrome's blue)
- Storage breakdown uses AMI card per origin

---

#### `chrome://webrtc-logs` — WebRTC Logs

**AMI's changes:**
- Dark theme
- Log entries use AMI monospace font (`JetBrains Mono` or `Fira Code` if bundled, otherwise `monospace`)

---

#### `chrome://sync-internals` — Sync Service Debugging

**AMI's changes:**
- Dark theme + AMI branding in header
- **"Sync is disabled in AMI Browser"** banner shown at the top if sync to Google Account is disabled (which it is by default in AMI — users sync via AMI Sync instead)
- Sync type status table uses AMI card rows

---

#### `chrome://signin-internals` — Sign-in State Debugging

**AMI's changes:**
- Dark theme
- **"Google Account sign-in"** replaced with "AMI Account" in all headings
- If user isn't signed into a Google account (common in AMI), shows a clean "No Google account connected — AMI account active" state instead of Chrome's empty/error state

---

#### `chrome://identity-internals` — Token Cache

**AMI's changes:**
- Dark theme
- Token entries use AMI card rows
- **AMI OAuth tokens** (from Connected Apps §16) listed here in addition to Google tokens

---

#### `chrome://safe-browsing` — Safe Browsing Status Debugging

**AMI's changes:**
- Dark theme
- **Page title** changed to "AMI Threat Protection Status"
- Google Safe Browsing references in the copy changed to "AMI Threat Protection"

---

#### `chrome://access-code-cast` / `chrome://cast`

Cast/media streaming pages.

**AMI's changes:**
- Dark theme via shared stylesheet
- Remove Google Cast branding from the UI header; replace with "AMI Media Cast"

---

### 31.9 Informational & System Pages

---

#### `chrome://policy` — Enterprise Policies

Shows active enterprise policies applied to the browser.

**AMI's changes:**
- Dark theme
- **Page title** changed to "AMI Browser Policies"
- Policy table uses AMI card rows, not a flat HTML table
- **AMI-specific policies** (automation limits, Shield enforcement, AI provider restrictions) added as a separate "AMI Policies" section at the top
- "Learn more" links point to AMI documentation instead of Google's enterprise documentation

---

#### `chrome://management` — Managed Browser Notice

Chrome shows a "Your browser is managed by your organization" page. AMI has no enterprise management by default.

**AMI's changes:**
- If unmanaged: show "AMI Browser is fully under your control. No organization has administrative access." in AMI styling
- If managed (enterprise deployment): show AMI-branded management notice instead of "This browser is managed by [company]" with a generic Google icon

---

#### `chrome://credits` — Open Source Credits

Chrome's credits page is a very long list of open-source projects. It's one of the only places that explicitly says "Google Chrome" in an internal page.

**AMI's changes:**
- **Header** changed to "AMI Browser — Open Source Credits"
- Add AMI's own open-source credits at the top (Chromium base, AMI-specific dependencies like adblock-rust, Backpack wallet, Inter font, etc.)
- Dark theme via shared stylesheet
- The original Chromium/Google credits are preserved below, as required by their licenses

**Files:**
- `chrome/browser/ui/webui/about_ui.cc` — header string, AMI credits section

---

#### `chrome://crashes` — Crash Reports

**AMI's changes:**
- Dark theme
- **"Send crash reports to Google"** copy changed to "AMI does not send crash reports unless you opt in"
- Crash list uses AMI card rows with timestamp, process type, and "View details" link
- **"Upload all crash reports" button** hidden by default (AMI default: no telemetry)

---

#### `chrome://system` — System Information

Shows a dump of OS, hardware, and browser information.

**AMI's changes:**
- Dark theme
- **Page title** changed to "AMI System Information"
- Each info section wrapped in a collapsible AMI card
- **"Copy all" button** added for easy bug reporting
- Google-specific entries (Google Account, Google services) hidden or labeled N/A

---

#### `chrome://histograms` — UMA Histograms

Internal metrics. Developer-only.

**AMI's changes:**
- Dark theme
- **Page header** shows "AMI Internal Metrics — Note: No data is sent to Google unless you have opted into crash reporting"
- Histogram bars use AMI purple color

---

#### `chrome://media-engagement` — Media Engagement Scores

Scores that influence Chrome's autoplay decisions.

**AMI's changes:**
- Dark theme
- Table uses AMI card rows
- **"Reset all scores" button** styled as AMI button

---

#### `chrome://site-engagement` — Site Engagement Scores

Chrome's internal scoring of how much users interact with each site (affects permissions, etc.).

**AMI's changes:**
- Dark theme
- Table uses AMI card rows with score bars (AMI purple gradient)
- Sorted by score descending by default (not alphabetical like Chrome)

---

#### `chrome://ntp-tiles-internals` — NTP Tiles Debugging

Debug page for the "Most Visited" tiles on the New Tab Page.

**AMI's changes:**
- Dark theme
- Tiles previewed with AMI card style
- Page title: "AMI New Tab Page — Tile Inspector"

---

#### `chrome://ukm` — URL-Keyed Metrics

UKM records page-level metrics tied to URLs.

**AMI's changes:**
- Dark theme
- **Banner**: "AMI does not send UKM data to Google. These metrics are stored locally only."
- UKM entry table uses AMI card rows

---

#### `chrome://suggestions` — Suggestion Service

Shows the content suggestions fetched from Google's servers for the NTP.

**AMI's changes:**
- Dark theme
- **Banner**: "AMI does not use Google's suggestion service. This page shows local browsing-based suggestions only."
- Suggestion cards use AMI card style

---

#### `chrome://translate-internals` — Translate Debugging

Debugging page for Google Translate integration.

**AMI's changes:**
- Dark theme
- **Banner**: "Translation in AMI Browser uses your configured AI provider, not Google Translate."
- Event log uses AMI monospace font

---

#### `chrome://user-actions` — User Action Recording

Records named user actions for debugging.

**AMI's changes:**
- Dark theme
- Action log uses AMI-styled monospace log view (same as DevTools console style)

---

#### `chrome://bluetooth-internals` — Bluetooth Debugging

**AMI's changes:**
- Dark theme
- Device cards use AMI card style
- Status badges (connected/disconnected/scanning) use AMI color tokens

---

#### `chrome://usb-internals` — USB Debugging

**AMI's changes:**
- Dark theme
- Device table uses AMI card rows

---

#### `chrome://device-log` — Device Log

**AMI's changes:**
- Dark theme
- Log entries use AMI monospace style with color-coded severity (info = muted, warning = amber, error = red accent)

---

#### `chrome://network-errors` — Network Error Pages Catalog

A developer page showing all Chromium network error codes and their error page rendering.

**AMI's changes:**
- Dark theme
- Each error page preview shows AMI's custom error page design (from §22.18) — this page doubles as a preview tool for our custom error pages

---

#### `chrome://chrome-urls` — List of All Internal Pages

Chrome's index of all `chrome://` pages.

**AMI's changes:**
- Dark theme
- **Page title** changed to "AMI Browser — Internal Pages"
- Pages are organized into categories (User Facing / Developer Tools / Diagnostic / Hidden) instead of a flat alphabetical list
- AMI-specific pages (`chrome-untrusted://mission-control/`, `chrome-untrusted://ami-chat/`, etc.) included in the list

---

#### `chrome://whats-new` — What's New Page

Chrome shows a "What's new in Chrome" page after updates.

**AMI's layout:**
- **Title**: "What's new in AMI Browser v3.x"
- AMI's own changelog content (not Chrome's update notes)
- Features highlighted with AMI card style and feature icons
- **"See all changes"** links to AMI's GitHub releases page
- No Chrome/Google branding

**Files:**
- `chrome/browser/resources/whats_new/` — full content + style replacement
- `chrome/browser/ui/webui/whats_new/whats_new_ui.cc` — AMI changelog data source

---

### 31.10 Side Panel Pages Redesign

Chromium has a side panel system (§4 adds AMI Chat as a panel). The built-in side panels also need AMI redesigns.

---

#### Reading List Side Panel

**Chrome's layout:** Simple list of saved URLs with a title and date added.

**AMI's layout:**
```
┌─────────────────────────────────┐
│ 📚 Reading List          [+ Add]│
│─────────────────────────────────│
│ 🔍 Search saved...              │
│                                 │
│ ── Unread (4) ─────────────     │
│ ╭───────────────────────────╮   │
│ │ [favicon] Article title   │   │
│ │ site.com · Added today    │   │
│ │ [🤖 Summarize] [✓ Read]  │   │
│ ╰───────────────────────────╯   │
│                                 │
│ ── Read (12) ──────────────     │
│ ...                             │
└─────────────────────────────────┘
```

**Structural changes:**
1. **"Unread" and "Read" sections** — Chrome has no separation
2. **"🤖 Summarize" button** on each item — AI summarizes the article without navigating to it
3. **Search** within the reading list
4. AMI card style for each item

---

#### Bookmarks Side Panel

**Chrome's layout:** Flat tree with folder structure. Same layout as `chrome://bookmarks` but in a narrow panel.

**AMI's layout:**
- Folder chips at the top for navigation
- Bookmark cards with favicon, title, domain
- **"Add bookmark" FAB** (floating action button) at the bottom
- Matches the `chrome://bookmarks` redesign (§31.3) but adapted for the narrow panel width

---

#### History Side Panel

**Chrome's layout:** Recent history list with a "Show full history" link.

**AMI's layout:**
- Smart Search bar at the top (§7)
- Recent visits in AMI card style
- "Open full history" link → goes to AMI's redesigned `chrome://history`

---

### 31.11 AMI DevTools MCP — Native Integration

> **Reference:** [github.com/ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) — the official Chrome DevTools MCP server (36k stars) that exposes Chrome DevTools to AI agents via the Model Context Protocol.

The chrome-devtools-mcp project is exactly the right interface for AMI's AI automation layer. Instead of maintaining a separate CDP bridge in the OpenClaw gateway, AMI should **ship a built-in, pre-configured DevTools MCP server** that is always running when AMI Browser is open — no setup required.

**What chrome-devtools-mcp provides:**
- Input automation: `click`, `drag`, `fill`, `fill_form`, `handle_dialog`, `hover`, `press_key`, `type_text`, `upload_file`
- Navigation: `close_page`, `list_pages`, `navigate_page`, `new_page`, `select_page`, `wait_for`
- Emulation: `emulate`, `resize_page`
- Performance: `performance_analyze_insight`, `performance_start_trace`, `performance_stop_trace`
- Network: `get_network_request`, `list_network_requests`
- Debugging: `evaluate_script`, `get_console_message`, `lighthouse_audit`, `list_console_messages`, `take_screenshot`, `take_snapshot`
- Extensions: `install_extension`, `list_extensions`, `reload_extension`, `trigger_extension_action`, `uninstall_extension`
- Memory: `take_memory_snapshot`

**AMI's Integration Plan:**

```
┌────────────────────────────────────────────────────────────────┐
│                        AMI Browser                            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              OpenClaw Gateway (port 18789)                │ │
│  │                                                           │ │
│  │  Traditional automation:                                  │ │
│  │  LLM → Vision AI → CDP actions → Browser tab             │ │
│  │                                                           │ │
│  │  NEW — DevTools MCP bridge:                               │ │
│  │  LLM → MCP tool call → DevTools MCP server               │ │
│  │                      → Puppeteer/CDP → Browser tab        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │         Built-in DevTools MCP Server (port 18793)         │ │
│  │         (chrome-devtools-mcp — shipped with AMI)          │ │
│  │                                                           │ │
│  │  • Runs as a native browser service (not a separate npm)  │ │
│  │  • Connects to AMI Browser's debug endpoint automatically │ │
│  │  • All 33 MCP tools available to OpenClaw agent           │ │
│  │  • Also exposed externally for VS Code Copilot,           │ │
│  │    Claude Desktop, Cursor, etc. to connect to             │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

#### Implementation

**Option A: Bundle as a Node.js sidecar (fast to implement)**
- Ship `chrome-devtools-mcp` as a bundled Node.js package alongside the AMI Browser binary
- On browser start, launch it automatically: `node /usr/lib/ami-browser/devtools-mcp/server.js --auto-connect --browser-url=http://127.0.0.1:18791`
- The AMI Browser binary starts with `--remote-debugging-port=18791`
- OpenClaw gateway connects to the MCP server's WebSocket on port `18793`

**Option B: Native C++ integration (clean, no Node dependency)**
- Port the MCP server logic into a native C++ component inside the browser process
- Expose MCP via a local WebSocket at `ws://127.0.0.1:18793`
- Eliminates the Node.js dependency and the separate process
- Aligns with AMI's goal of everything being binary-native

**Recommendation: Option A for V3 launch, Option B as a V4 optimization.**

#### AMI DevTools MCP — `chrome://settings/ami/devtools-mcp`

A settings sub-page to manage the built-in DevTools MCP server:

```
┌────────────────────────────────────────────────────────────────┐
│  🔌 AMI DevTools MCP                                          │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ Built-in DevTools MCP Server      ● Running on :18793  │   │
│  │                                           [Stop]        │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  Connect external clients                                      │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ MCP Endpoint:  ws://127.0.0.1:18793                    │   │
│  │ Config JSON:   [Copy for VS Code Copilot]               │   │
│  │               [Copy for Claude Desktop]                 │   │
│  │               [Copy for Cursor]                         │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ Security                                               │   │
│  │ ○ Localhost only (default — safe)                      │   │
│  │ ○ LAN access (for remote AI agents)                    │   │
│  │ Token:  [                    ] [Generate]              │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  Tools enabled:                                                │
│  ✓ Input automation    ✓ Navigation    ✓ Screenshots          │
│  ✓ Network inspection  ✓ Performance   ✓ Console access       │
│  ✓ Extensions          ✓ Memory        ✗ File upload (off)    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Why this is powerful:**
- Users with VS Code Copilot, Claude Desktop, or Cursor can point those tools at AMI Browser's built-in MCP endpoint — zero configuration, just copy the JSON snippet
- AMI's own OpenClaw gateway uses the same MCP interface for all automations — consistent, well-tested tooling
- The DevTools MCP tool set (Puppeteer-backed, screenshot, console, network, performance) is far more capable than a custom CDP script

#### DevTools MCP Integration with Mission Control (§18)

When an automation is running via the DevTools MCP server, Mission Control (§18) receives the same progress events:
- `take_screenshot` → frame forwarded to Mission Control live view
- `navigate_page` → navigation event logged in activity feed
- `evaluate_script` → console output shown in the automation card
- `get_console_message` → errors surfaced in the Mission Control error handler (§18 §J)

This makes the DevTools MCP the **unified automation interface** for everything: OpenClaw agent tasks, external AI tools (Copilot/Claude), and the Workflow Builder (§18.9).

---

### 31.12 Files Modified — Complete Summary

| Page / Component | Key Files | Effort |
|---|---|---|
| `chrome://extensions` | `extensions.html`, `toolbar.ts`, `extensions_item.html` | 4–6 h |
| `chrome://settings` (landing) | `settings_main.html`, `settings_menu.html` | 6–8 h |
| `chrome://settings/privacy` | `privacy_page.ts`, safe_browsing sections | 2–3 h |
| `chrome://settings/security` | `security_page.ts`, mode selector | 2–3 h |
| `chrome://settings/safetyCheck` | `safety_check_page.ts` | 2–3 h |
| `chrome://settings/content` | `site_settings_page.ts`, AMI permission type | 3–4 h |
| `chrome://settings/accessibility` | `a11y_page.ts` | 1–2 h |
| Privacy Sandbox (disabled) | `privacy_sandbox_handler.cc`, page TS | 1–2 h |
| `chrome://history` | `history_list.html`, `history_toolbar.html` | 3–4 h |
| `chrome://downloads` | `downloads.html`, `item.html` | 3–4 h |
| `chrome://bookmarks` | `bookmarks_list.html`, `bookmarks_toolbar.html` | 3–4 h |
| `chrome://password-manager` | `password_manager_app.ts`, `passwords_section.ts` | 4–5 h |
| `chrome://print` | `print_preview.ts`, settings panel | 3–4 h |
| `chrome://tab-search` | `tab_search_app.ts`, `tab_search_item.ts` | 2–3 h |
| `chrome://certificate-manager` | cert manager resources | 2–3 h |
| `chrome://flags` | `flags.html` | 2–3 h |
| `chrome://version` | `version.html` | 1–2 h |
| `chrome://about` | `about_ui.cc` redirect | 0.5 h |
| `chrome://whats-new` | `whats_new_ui.cc`, page resources | 2–3 h |
| `chrome://policy` | policy resources | 2–3 h |
| `chrome://management` | management resources | 1 h |
| `chrome://credits` | `about_ui.cc`, credits page | 1–2 h |
| `chrome://crashes` | crashes resources | 1 h |
| `chrome://system` | system resources | 1–2 h |
| `chrome://net-internals` | net_internals resources | 2–3 h |
| `chrome://gpu` | gpu resources | 1–2 h |
| `chrome://webrtc-internals` | webrtc resources | 1–2 h |
| `chrome://media-internals` | media_internals resources | 1–2 h |
| `chrome://tracing` | tracing resources | 1–2 h |
| `chrome://omnibox` | omnibox_ui resources | 1 h |
| `chrome://discards` | discards resources | 1 h |
| `chrome://process-internals` | process_internals resources | 1 h |
| `chrome://serviceworker-internals` | sw_internals resources | 1 h |
| `chrome://indexeddb-internals` | indexeddb resources | 1 h |
| `chrome://quota-internals` | quota resources | 1 h |
| `chrome://webrtc-logs` | webrtc_logs resources | 0.5 h |
| `chrome://sync-internals` | sync_internals resources | 1 h |
| `chrome://signin-internals` | signin_internals resources | 1 h |
| `chrome://identity-internals` | identity_internals resources | 1 h |
| `chrome://safe-browsing` | safe_browsing resources | 1 h |
| `chrome://histograms` | histograms resources | 0.5 h |
| `chrome://media-engagement` | media_engagement resources | 0.5 h |
| `chrome://site-engagement` | site_engagement resources | 0.5 h |
| `chrome://ntp-tiles-internals` | ntp_tiles resources | 0.5 h |
| `chrome://ukm` | ukm resources | 0.5 h |
| `chrome://suggestions` | suggestions resources | 0.5 h |
| `chrome://translate-internals` | translate resources | 0.5 h |
| `chrome://user-actions` | user_actions resources | 0.5 h |
| `chrome://bluetooth-internals` | bluetooth resources | 0.5 h |
| `chrome://usb-internals` | usb resources | 0.5 h |
| `chrome://device-log` | device_log resources | 0.5 h |
| `chrome://network-errors` | network_errors resources | 0.5 h |
| `chrome://chrome-urls` | chrome_urls resources | 1 h |
| Reading List side panel | side_panel/reading_list resources | 2–3 h |
| Bookmarks side panel | side_panel/bookmarks resources | 1–2 h |
| History side panel | side_panel/history resources | 1–2 h |
| DevTools theme + console | `devtools-frontend/src/front_end/` | 3–4 h |
| Shared injection system | `chrome_web_ui_controller_factory.cc`, `ami_webui_layout.css` | 2–3 h |
| DevTools MCP sidecar | Node.js bundle + launch service | 4–6 h |
| DevTools MCP settings page | `settings/ami/devtools_mcp_handler.cc` | 3–4 h |
| **Total** | | **~90–120 h** |

---

### 31.13 The "Not Chrome" Test — Full Page Coverage

> **Show each page to someone who uses Chrome daily. Ask: "What browser is this?"**
> Pass = they say "AMI" or "I don't know". Fail = they say "Chrome" or recognize Chrome's layout.

| Page | Fail condition | Pass condition |
|------|---------------|---------------|
| Extensions | Dev mode toggle top-right, Chrome Web Store link | Dev sidebar, AMI WebStore |
| Settings landing | "You and Google" first section | "AMI & AI" first, card grid layout |
| Settings/Privacy | Privacy Sandbox section present | Privacy Sandbox absent, AMI Shield toggle |
| Settings/Security | "Safe Browsing" label, Google-branded modes | "Threat Protection" label |
| Settings/Safety Check | "Check with Google" password check | Local HIBP check, AMI branding |
| History | Basic text search only | Smart Search bar, filter chips |
| Downloads | Flat list, no filter | Card layout, filter chips, AI Rename |
| Bookmarks | Tree sidebar + list | Card grid, folder chips |
| Password Manager | "Google Password Manager" header | "AMI Vault" header |
| Print Preview | "Send to Google Drive" destination | Google Drive absent |
| Tab Search | Only searches open tabs | Searches tabs + history + bookmarks |
| Certificate Manager | Flat table, material buttons | Card rows, AMI buttons |
| Safety Check | Google-linked password check | AMI Vault / HIBP check |
| Flags | "Experiments" title, no AMI section | "AMI Experimental Features", AMI section |
| Version | Plain text dump | Branded card layout, AMI logo |
| What's New | Chrome changelog | AMI changelog |
| Credits | "Google Chrome" header | "AMI Browser" header, AMI credits |
| Net-internals | Plain gray tabs | AMI chip tabs, Shield stats tab |
| GPU | Version info first, no copy button | Graphics status first, copy button |
| Discards | No automation tab markers | Automation tabs protected, 🤖 badge |
| Chrome URLs | Flat alphabetical list | Categorized, AMI pages included |
| Reading List panel | No AI action | "Summarize" button per item |
| DevTools | No themed console, no AMI theme | AMI console welcome, AMI dark theme |
| DevTools MCP settings | Doesn't exist in Chrome | Full MCP management UI |

---

### 31.14 Remaining Internal Pages — Supplementary Coverage

These pages are either rarely visited by normal users, used only in specific workflows, or only accessible by developers. They still need the AMI treatment — dark theme minimum, structural changes where meaningful.

---

#### `chrome://components` — Browser Components

Shows updatable browser components (CRLSet certificate revocation list, Widevine CDM, etc.) with version numbers and "Check for update" buttons per component.

**AMI's changes:**
- Dark theme + AMI card rows per component
- **Page title** changed to "AMI Browser Components"
- Each component shown as a card: name, version, status badge (Up to date ✅ / Checking 🔄 / Update available ⬆)
- **Google-branded components** (Google Update, Google Crash Handler) hidden or labeled as "System Component"
- **CRLSet** component labeled "Security Certificate Revocation List" for clarity
- "Check for update" button per card uses AMI button style

**Files:**
- `chrome/browser/resources/components/` — card layout, AMI branding
- `chrome/browser/ui/webui/components/components_ui.cc` — filter Google-branded components

---

#### `chrome://apps` — Chrome Apps

Chrome Apps (packaged apps) are mostly deprecated but the page still exists. Many users encounter it accidentally.

**AMI's changes:**
- Dark theme
- **Page title** changed to "Apps" (remove "Chrome" prefix)
- If no apps installed: show a friendly AMI-branded empty state: "No apps installed. Visit the AMI WebStore to discover tools." (links to AMI WebStore)
- App tiles use AMI card style with rounded corners and favicon

**Files:**
- `chrome/browser/resources/apps/` — AMI empty state, card style

---

#### `chrome://on-device-internals` — On-Device AI Models

Chrome's page for managing locally downloaded AI models (Gemini Nano, etc.).

**AMI's changes:**
- Dark theme
- **Page title** changed to "AMI Local AI Models"
- **"Gemini Nano"** references relabeled as "Local Language Model" generically — AMI is provider-agnostic
- Model list uses AMI card rows: model name, size on disk, status (downloaded / downloading / available)
- **"Download" button** per model uses AMI accent button style
- Add **"Ollama Models"** section — shows models available in the user's local Ollama instance (pulled from `http://localhost:11434/api/tags`), since AMI natively supports Ollama

**Files:**
- `chrome/browser/resources/on_device_internals/` — relabeling, Ollama section
- `chrome/browser/ui/webui/on_device_internals/` — Ollama API data provider

---

#### `chrome://optimization-guide-internals` — ML Optimization Guide

Chrome uses a server-side optimization guide to decide which ML features to enable per device. This page shows active hints and registered types.

**AMI's changes:**
- Dark theme
- **Banner**: "AMI Browser does not fetch optimization hints from Google servers. Local device capability is used directly."
- Page title: "AMI Feature Optimization Status"
- Hint table uses AMI card rows

---

#### `chrome://password-manager-internals` — Password Manager Debug

Shows raw password manager logs and form parsing decisions.

**AMI's changes:**
- Dark theme
- **Page title**: "AMI Vault — Debug Logs"
- Log entries use AMI monospace style with color-coded severity
- All "Google Password Manager" strings in the log output replaced with "AMI Vault"

---

#### `chrome://pref-internals` — Preferences Inspector

Shows a JSON tree of all browser preferences (a huge flat dump). Power-user/developer tool.

**AMI's changes:**
- Dark theme
- JSON tree rendered with AMI-styled expand/collapse controls (purple triangles)
- **Search bar** added at the top — allows filtering preferences by key name (Chrome has no search on this page)
- **"Copy to clipboard" button** for filtered results

**Files:**
- `chrome/browser/resources/pref_internals/` — search bar, styled JSON tree

---

#### `chrome://predictors` — Navigation Predictors

Shows Chrome's preloading predictions (which URLs will be prefetched).

**AMI's changes:**
- Dark theme
- Table rows use AMI card style
- Prediction confidence shown as a visual bar (AMI purple gradient) not just a number

---

#### `chrome://memory-internals` — Memory Usage Per Process

Shows memory usage broken down by tab, extension, and browser process.

**AMI's changes:**
- Dark theme
- **Tab memory cards**: each tab shown as a card with its favicon, title, URL, and memory bar
- Automation tabs (§18) shown with a 🤖 badge
- Memory bars use AMI color scheme: green (<256MB), amber (256–512MB), red (>512MB)
- **"Discard" button** per tab card (instantly frees memory for that tab)
- **Total memory usage** shown prominently in the page header
- Page title: "AMI Memory Usage"

**Files:**
- `chrome/browser/resources/memory_internals/` — card layout, AMI bars, discard button

---

#### `chrome://sandbox` — Sandbox Status

Shows sandboxing status for each renderer process.

**AMI's changes:**
- Dark theme
- Status badges: "Sandboxed ✅" in green, "Not sandboxed ⚠️" in amber
- Page title: "AMI Process Sandbox Status"

---

#### `chrome://blob-internals` — Blob Storage Debug

**AMI's changes:**
- Dark theme
- Blob entries use AMI card rows with size, origin, MIME type
- Page title: "AMI Blob Storage"

---

#### `chrome://invalidations` — Push Invalidation Service

Chrome uses this for sync push notifications from Google servers.

**AMI's changes:**
- Dark theme
- **Banner**: "AMI Browser uses AMI Sync instead of Google's invalidation service." (§33)
- Page title: "AMI Sync — Push Invalidations"

---

#### `chrome://gcm-internals` — Google Cloud Messaging

GCM is used for push notifications. AMI disables GCM by default (§1 Bug #8: `enable_gcm_driver = false`).

**AMI's changes:**
- If GCM is disabled (default): page shows "GCM is disabled in AMI Browser. Push notifications use the Web Push standard directly."
- If somehow enabled: dark theme + page title "Push Messaging Debug"

---

#### `chrome://internals` — Internals Hub

A recently-added hub page in Chrome that links to various internals pages.

**AMI's changes:**
- Dark theme
- **Page title**: "AMI Browser — Internals Hub"
- Links organized in an AMI card grid (categories: User Facing / Developer Tools / Diagnostic / AI & Automation)
- Adds links to AMI-specific internal pages (`chrome-untrusted://mission-control/`, `chrome-untrusted://ami-chat/`, `chrome://settings/ami/devtools-mcp`)

**Files:**
- `chrome/browser/resources/internals/` — AMI grid layout, AMI-specific page links

---

#### `chrome://local-state` — Local State JSON

Raw JSON dump of `Local State` preference file.

**AMI's changes:**
- Dark theme
- JSON rendered with AMI-styled syntax highlighting (keys in accent color, strings in green, numbers in blue)
- **Search/filter bar** added
- **"Export" button** for saving the JSON

---

#### `chrome://new-tab-page` vs `chrome://newtab`

Both routes should load the AMI NTP (§5). Ensure both are consistently redirected to the same AMI NTP WebUI.

**Files:** `chrome/browser/ui/webui/chrome_web_ui_configs.cc` — unified routing

---

#### `chrome://hats` — Happiness Tracking Surveys

Google occasionally shows in-browser satisfaction survey prompts (HaTS). AMI does not participate in Google's satisfaction tracking.

**AMI's changes:**
- Suppress all HaTS survey prompts at compile time (`chrome/browser/ui/hats/hats_service.cc` → no-op)
- If the page is accessed directly: show "AMI Browser does not display satisfaction surveys from Google."

---

#### `chrome://family-link-user-internals` — Family Link

Google's parental control integration.

**AMI's changes:**
- Dark theme
- If Family Link is not configured: "Family Link / parental controls are not active. AMI Browser is unmanaged."
- No structural redesign needed (extremely rarely visited)

---

#### `chrome://lens` — Google Lens

Google Lens integration for visual search.

**AMI's changes:**
- This page / feature is **removed** from AMI Browser. Any attempt to access `chrome://lens` redirects to `chrome://newtab` with a toast notification: "Google Lens is not available in AMI Browser. Use 'Ask AMI about this image' from the right-click menu instead."
- The right-click menu item "Search image with Google" (§22.6) is replaced with "🤖 Ask AMI about this image" — which sends the image to the AMI Chat sidebar

---

#### `chrome://ntp-cards-internals` / `chrome://ntp-tiles-internals`

NTP card and tile debug pages.

**AMI's changes:**
- Dark theme
- Page title: "AMI New Tab Page — Debug"
- Both pages merged or linked from each other

---

#### `chrome://webui-gallery` — WebUI Component Gallery

A developer-only page showing every WebUI component (buttons, inputs, dialogs, etc.) as a visual gallery. Used by Chromium developers to test UI components.

**AMI's changes:**
- Dark theme
- **AMI component gallery** added as the first section — shows all AMI custom UI components (AMI card, chip, button variants, sidebar, toast) in a live preview
- Existing Chromium components shown below with AMI styling applied
- Page title: "AMI WebUI Component Gallery"

This page is essentially a **living style guide** for AMI's WebUI design system.

**Files:**
- `chrome/browser/resources/webui_gallery/` — AMI components section
- New: `chrome/browser/resources/webui_gallery/ami_components/` — AMI component demos

---

#### `chrome://hid-internals` — HID (Human Interface Devices)

Shows HID device connections (game controllers, etc.).

**AMI's changes:** Dark theme only.

---

#### `chrome://serial-internals` — Serial Port Connections

**AMI's changes:** Dark theme only.

---

#### `chrome://browser-switch` — Internet Explorer / Edge mode

Windows-only — not applicable to AMI (Linux-first). Stub out or hide.

---

#### `chrome://welcome` — Welcome Page

Chrome's onboarding page shown on first run.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│               [AMI Logo — large, centered]                    │
│                                                                │
│          Welcome to AMI Browser                               │
│      Fast, private, AI-powered browsing                       │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  🤖 AI Built In        No API keys needed               │  │
│  │  🛡 Privacy First      No Google tracking               │  │
│  │  ⚡ 206 AI Skills      Automate anything                │  │
│  │  💎 AMI Rewards        Earn while browsing              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│       [Sign In to AMI Account]   [Continue as Guest]          │
│                                                                │
│  ─ Import from Chrome / Firefox / other browser ─             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. Full AMI brand experience — no Google logo, no "Set Chrome as default" prompt
2. Feature highlights (AI / Privacy / Skills / Rewards) in a visual card strip
3. **Import from other browsers** offered immediately (Chrome, Firefox, Brave, Edge)
4. **"Sign In to AMI Account"** via Clerk (not Google Sign-In)

**Files:**
- `chrome/browser/resources/welcome/` — full page replacement
- `chrome/browser/ui/webui/welcome/welcome_ui.cc` — AMI branding, Clerk sign-in link

---

#### `chrome://profile-picker` — Profile Picker

Shown when starting Chrome with multiple profiles, or via the profile icon.

**AMI's layout:**
- Profile cards use AMI card style with avatar, name, and profile color indicator
- **"Add profile" button** uses AMI accent style
- Remove "Sign in with Google" from the add-profile flow — AMI uses its own account system
- Background: AMI dark navy, not Chrome's light gray

**Files:**
- `chrome/browser/resources/profile_picker/` — card redesign, dark background
- `chrome/browser/ui/webui/signin/profile_picker_ui.cc` — remove Google sign-in push

---

### 31.15 Interstitial Pages — Custom AMI Safety Screens

Interstitial pages appear as full-page overlays when Chrome detects a dangerous site (phishing, malware, SSL errors, expired certs, etc.). Currently they look like Chrome — AMI redesigns them with the same security intent but AMI visual identity.

**Why this matters:** Interstitials are one of the most visible browser-branded moments. When a user sees a red "Dangerous site" warning, the giant Chrome shield logo and "Google Safe Browsing" attribution tells them exactly what browser they're using. AMI replaces all of this with AMI branding and messaging.

---

#### SSL Certificate Error — `chrome://interstitials/ssl`

**Chrome's layout:** Giant red lock icon, "Your connection is not private", NET::ERR_CERT_AUTHORITY_INVALID, "Back to safety" / "Advanced" buttons.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│         🔒 [broken lock icon — AMI red #e94560]               │
│                                                                │
│         Connection Not Private                                 │
│                                                                │
│  example.com has a certificate problem. AMI Shield has        │
│  blocked this page to protect your data.                      │
│                                                                │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ ⚠ Certificate issue: Expired · 3 days ago             │   │
│  │   Issued by: Unknown CA                               │   │
│  │   Error code: NET::ERR_CERT_DATE_INVALID              │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  [← Go Back (Safe)]          [Advanced ▾]                     │
│                                                                │
│  Advanced:                                                     │
│  This server could not prove it is example.com.              │
│  [Proceed to example.com (unsafe)]                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **"Google Safe Browsing"** attribution removed — replaced with "AMI Shield"
2. **Error details card** shows specific cert issue upfront (Chrome buries this under "Advanced")
3. **Background**: AMI dark navy with red accent — not Chrome's white with red header
4. **Icon**: AMI-styled broken lock (red #e94560) not Chrome's generic broken lock
5. **"Go Back" button** is the primary (large, prominent) button — Chrome places it secondary to the warning text

**Files:**
- `components/security_interstitials/content/resources/ssl/ssl.html` / `.ts`
- `components/security_interstitials/content/resources/ssl/ssl.css`

---

#### Safe Browsing Phishing/Malware Warning

**Chrome's layout:** Red page with Chrome shield logo, "Deceptive site ahead", "Back to safety" button. Attribution: "Google Safe Browsing".

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  [AMI Shield — red variant]                                   │
│                                                                │
│  🛡 AMI Shield: Dangerous Site Blocked                        │
│                                                                │
│  AMI Shield has blocked access to this site because it        │
│  was reported as a phishing / malware site.                   │
│                                                                │
│  ╭────────────────────────────────────────────────────────╮   │
│  │ 🎣 Phishing site — tries to steal your credentials    │   │
│  │    Reported: 2 days ago                                │   │
│  ╰────────────────────────────────────────────────────────╯   │
│                                                                │
│  [← Back to Safety]                [Details & Override]       │
│                                                                │
│  Override (not recommended):                                   │
│  "I understand the risk — proceed anyway"                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Structural changes:**
1. **"Google Safe Browsing"** → **"AMI Shield"** everywhere
2. Dark background (AMI navy with red accent) instead of Chrome's white
3. **Threat category** shown in a card up front (phishing / malware / unwanted software)
4. Override option is buried in a collapsible section (same as Chrome — don't make it easy to bypass)

**Files:**
- `components/security_interstitials/content/resources/interstitial_large.html`
- `chrome/browser/safe_browsing/` — AMI branding strings

---

#### Dangerous Download Warning

Shown in the download bar/toast when Chrome detects a suspicious download.

**AMI's layout:**
- Toast notification style (matching §22.9 Download Toast) with red accent
- "⚠ AMI Shield blocked this download — reported as malware"
- [Keep anyway] button in a collapsed details section
- No mention of "Google Safe Browsing"

---

#### Mixed Content Warning

When an HTTPS page loads HTTP resources.

**AMI's changes:**
- The shield icon in the address bar uses AMI styling (already part of §22.4)
- The info bubble text: "This page has insecure content — AMI Shield is blocking mixed content requests"
- Remove "Learn more" links that point to Google support pages → link to AMI docs

---

#### Captive Portal Detection Page

When connecting to a Wi-Fi network with a captive portal (hotel Wi-Fi, etc.), Chrome shows a generic notice.

**AMI's layout:**
- Dark themed notice card
- "🌐 Network Login Required — This network requires you to sign in before browsing."
- [Open Network Login Page] button in AMI accent style
- No Chrome branding

---

#### `chrome://lookalike-url-blocked` — Lookalike Domain Warning

Chrome warns when a URL looks like a typosquat of a popular domain.

**AMI's changes:**
- Dark theme
- "⚠ AMI Shield: Suspicious URL" — styling matches the other AMI Shield interstitials
- Show the suspected target domain prominently: "Did you mean → google.com?"

---

#### Offline / No Connection Page (`chrome://network-error/-106`)

The famous dinosaur game. AMI replaces it entirely.

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                [AMI Logo — subtle, faded]                     │
│                                                                │
│           No Internet Connection                              │
│                                                                │
│  Try:                                                          │
│  · Checking your Wi-Fi or cable connection                    │
│  · Restarting your router                                     │
│  · Checking for a captive portal (hotel/office Wi-Fi)         │
│                                                                │
│  [Try Again]                    [Network Settings]            │
│                                                                │
│  ────────────────────────────────────────────────────────     │
│                                                                │
│   🤖  AMI Offline Game                [Play]                  │
│   Keep your mind sharp while you wait                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**The AMI Offline Game:**
- Replace Chrome's T-Rex runner with an **AMI-branded mini game** — theme: a purple robot (`◉_◉`) navigating through data packets
- Same simple endless runner mechanic (spacebar to jump), but entirely AMI-themed
- High score persisted in `localStorage`

**Files:**
- `components/neterror/resources/offline.html` / `.ts` / `.css` — full replacement
- New: `components/neterror/resources/ami_offline_game.ts` — AMI offline game

---

#### `chrome://crash` and Sad Tab (`chrome://sad`)

When a tab crashes, Chrome shows a sad-face emoji tab with "Aw, Snap!" or "He's dead, Jim."

**AMI's layout:**
```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                  [AMI Logo — glitched/static]                 │
│                                                                │
│              Tab crashed                                      │
│                                                                │
│  Something went wrong loading this page.                      │
│  Error: STATUS_ACCESS_VIOLATION (or similar)                  │
│                                                                │
│  [↺ Reload]              [Report to AMI Team]                 │
│                                                                │
│  Tip: If this keeps happening, try:                           │
│  · Disabling extensions one by one                            │
│  · Clearing the site's cached data                            │
│  · Opening in a new tab                                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Changes:**
1. "Aw, Snap!" text replaced with "Tab crashed" (clearer, less juvenile)
2. **Error code shown** — developers find this useful; Chrome hides it by default
3. **"Report to AMI Team"** button — sends anonymous crash data to AMI's backend (only if user has opted in to crash reporting)
4. AMI logo with a "glitch" animation (CSS glitch effect) instead of a sad face

**Files:**
- `chrome/browser/ui/sad_tab.cc` — text strings
- `components/neterror/resources/` — sad tab HTML/CSS

---

### 31.16 Browser Dialog & Prompt UI Takeover

Chromium shows many types of native dialogs and in-page prompts. These are separate from the `chrome://` WebUI pages — they are native `views::Widget` dialogs, popup bubbles, and in-page prompt bars. All must be redesigned to match AMI.

---

#### Permission Request Bubbles (Camera, Mic, Location, Notifications, Clipboard)

When a site requests a permission, Chrome shows a small popup bubble below the address bar.

**Chrome's layout:** White bubble with a site favicon, permission description, [Allow] / [Block] buttons. The "Allow" button is a plain blue Material button.

**AMI's layout:**
```
╭────────────────────────────────────────────────────────╮
│  [favicon] example.com                           [✕]   │
│  wants to: 📍 Know your location                        │
│                                                         │
│  [🚫 Block]              [✓ Allow]                     │
│                                                         │
│  ○ Remember my choice for this site                    │
╰────────────────────────────────────────────────────────╯
```

**Changes:**
1. Dark background (`#1e1e3a`) not white
2. Permission icon is colored and contextual (📍 for location, 🎤 for mic, 📷 for camera, 🔔 for notifications)
3. **Block is the left/first button** (visually equal prominence to Allow — Chrome makes Allow the primary blue button, subtly nudging users to allow)
4. **"Remember my choice"** checkbox visible by default (Chrome hides this in a sub-menu)
5. AMI-styled buttons: Block = outlined, Allow = AMI accent filled

**Files:**
- `chrome/browser/ui/views/permission_bubble/permission_prompt_bubble_base_view.cc`
- `chrome/browser/ui/views/permission_bubble/permission_prompt_bubble_view.cc`

---

#### JavaScript Alert / Confirm / Prompt Dialogs

`window.alert()`, `window.confirm()`, `window.prompt()` — the most hated web dialogs.

**Chrome's layout:** System-modal white dialog with generic Chrome icon and plain text.

**AMI's layout:**
```
╭────────────────────────────────────────────────────────╮
│ [favicon] example.com says:                     [✕]    │
│─────────────────────────────────────────────────────── │
│                                                         │
│  Are you sure you want to delete this item?             │
│                                                         │
│─────────────────────────────────────────────────────── │
│                [Cancel]          [OK]                   │
╰────────────────────────────────────────────────────────╯
```

**Changes:**
- Dark background + rounded corners (AMI card style)
- Site origin shown prominently in header
- For `prompt()`: input field uses AMI input style
- **Suppress "Prevent this page from creating additional dialogs"** checkbox redesigned as a visible AMI-styled toggle (not hidden in small print)
- Dialog shadow: `0 8px 32px rgba(0,0,0,0.4)`

**Files:**
- `components/app_modal/javascript_app_modal_dialog_views.cc`
- `components/app_modal/views/` — dialog view

---

#### File Chooser Dialog

When a site opens `<input type="file">` — the OS file picker. This is a native OS dialog on Linux (GTK/KDE).

**AMI's changes (Linux GTK):**
- Use Chromium's built-in file chooser override for consistent theming
- Apply GTK dark mode preference via `GtkSettings` to match AMI's dark theme
- No custom file picker dialog (would require massive effort) — instead ensure dark mode propagation is correct

---

#### Basic Auth Dialog (HTTP Authentication)

When a server sends a `401 WWW-Authenticate` challenge, Chrome shows a username/password dialog.

**AMI's changes:**
- Dark background + AMI card style
- Site origin and realm shown in header
- Input fields use AMI input style (dark background, purple focus ring)
- **"AMI Vault" integration**: if the site has a saved password, offer auto-fill: "🔑 Fill with saved credential for this site"

**Files:**
- `chrome/browser/ui/views/login_view.cc` — AMI styling + Vault integration

---

#### "Open with application" / Protocol Handler Dialog

When a site registers as a handler for a protocol (mailto:, tel:, etc.) or asks to open an external app.

**AMI's changes:**
- AMI card style dialog
- Protocol/app shown with icon
- **Default changed**: Chrome defaults to "Open" — AMI defaults to "Cancel" (safer)
- Checkbox: "Remember for this site" visible by default

---

#### Tab Unload / "Leave site?" Dialog

Shown when navigating away from a page with `beforeunload` listener.

**AMI's changes:**
- AMI card style dialog (currently uses native browser dialog)
- "Leave site?" with [Stay] (primary) and [Leave] (secondary) — AMI makes "Stay" the visually prominent button (Chrome treats both equally)

---

#### PWA Install Prompt

When a Progressive Web App prompts the user to install it.

**Chrome's layout:** Small popup with app name, icon, and "Install" button.

**AMI's layout:**
```
╭────────────────────────────────────────────────────────╮
│  Install App                                    [✕]    │
│─────────────────────────────────────────────────────── │
│  [app icon — 64px]  App Name                           │
│                     app.example.com                    │
│─────────────────────────────────────────────────────── │
│  This app will be added to your AMI sidebar and        │
│  can be launched from the AMI app launcher.            │
│                                                         │
│  [Cancel]                    [Install →]               │
╰────────────────────────────────────────────────────────╯
```

**Changes:**
- Dark card style
- "Added to your AMI sidebar" — installed PWAs appear in the AMI Spaces/sidebar (§3)
- No "Chrome" mention in "Open in Chrome window" copy — changed to "Open as standalone app"

**Files:**
- `chrome/browser/ui/views/web_apps/web_app_install_dialog_delegate.cc`

---

#### "Translate this page?" Bar

When Chrome auto-detects a foreign language, it shows a translation bar below the address bar.

**AMI's changes:**
- Dark card bubble instead of Chrome's white bottom bar
- Positioned as a **floating bubble** near the top-right of the content area (not a bar spanning the full width)
- **"AMI Translate"** branding (not "Google Translate")
- Uses the user's configured AI provider for translation (AMI setting) instead of Google Translate by default
- Quick language selector: "Translate [Detected: French] → [English ▾]"

**Files:**
- `chrome/browser/ui/views/translate/translate_bubble_view.cc` — floating bubble, AMI branding
- `components/translate/content/browser/translate_driver.cc` — non-Google translate provider support

---

#### Find-in-Page Bar

When the user presses `Ctrl+F`.

**Chrome's layout:** Fixed bar at the top-right of the content area. White background, plaintext input, up/down arrows, match counter.

**AMI's layout:**
```
                         ╭──────────────────────────────────────╮
                         │ 🔍  Search in page...    2 of 14  ↑↓ [✕]│
                         ╰──────────────────────────────────────╯
```

**Changes:**
- Floating, pill-shaped bubble (not a bar attached to the browser chrome)
- Dark background (`#1e1e3a`), AMI border, rounded corners `20px`
- AMI purple highlight for matched text (instead of Chrome's yellow)
- Match counter inline in the input (not a separate label)
- Smooth slide-in animation

**Files:**
- `chrome/browser/ui/views/find_bar/find_bar_view.cc` — pill shape, dark style
- `chrome/browser/ui/views/find_bar/find_bar_host.cc` — floating positioning
- `third_party/blink/renderer/core/editing/finder/` — match highlight color

---

#### Extension Install Dialog

When a user installs an extension (from AMI WebStore or drag-drop).

**AMI's layout:**
```
╭────────────────────────────────────────────────────────╮
│  Add Extension?                                 [✕]    │
│─────────────────────────────────────────────────────── │
│  [ext icon 64px]  Extension Name                       │
│                   by Publisher Name                    │
│─────────────────────────────────────────────────────── │
│  This extension will be able to:                       │
│  · Read and change all your data on websites           │
│  · Manage your downloads                               │
│─────────────────────────────────────────────────────── │
│  [Cancel]                    [Add Extension →]         │
╰────────────────────────────────────────────────────────╯
```

**Changes:**
- Dark card style
- Permissions list uses bullet points with icons (🌐 for site access, 📥 for downloads, etc.)
- Remove "Verified by Chrome Web Store" badge — replace with "AMI WebStore" verification badge (or "Unverified" if installed manually)

**Files:**
- `chrome/browser/ui/views/extensions/extension_install_dialog_view.cc`

---

#### Extension Removed / Disabled Notification

Chrome shows a bar when an extension is remotely disabled (e.g., removed from Chrome Web Store).

**AMI's changes:**
- Toast notification style (AMI toast system, §22.10) instead of Chrome's infobar
- "Extension 'X' was disabled" — no mention of "Chrome Web Store" — mention "AMI WebStore" or "Removed by publisher"

---

#### Cookie / Storage Notifications

Info bubbles about cookie access, storage partitioning, etc.

**AMI's changes:**
- Dark card style for all cookie-related info bubbles
- "AMI Shield" branding in tracking-related notifications
- Privacy-friendly default messaging ("Third-party cookies are blocked by AMI Shield" not Chrome's neutral phrasing)

---

#### "Save password?" / "Update password?" Bubble

**Chrome's layout:** Small white popup below the address bar with a key icon.

**AMI's layout:**
```
╭──────────────────────────────────────────────╮
│ 🔑 Save to AMI Vault?                  [✕]  │
│  Username:  john@company.com                  │
│  Password:  ●●●●●●●●                          │
│─────────────────────────────────────────────│
│  [Not now]              [Save to Vault →]    │
╰──────────────────────────────────────────────╯
```

**Changes:**
- "Save to AMI Vault" branding (not "Save password")
- Show username prominently in the bubble
- Dark card style

**Files:**
- `chrome/browser/ui/views/passwords/password_save_update_view.cc`

---

#### Media Controls Toolbar (Picture-in-Picture)

When media is playing and the user enables Picture-in-Picture, Chrome shows a mini floating player.

**AMI's changes:**
- PiP window border: AMI dark navy with subtle accent glow
- Control buttons (play/pause/close) use AMI icon style
- **"Send to AMI Chat"** button added — sends the current video frame as an image to the AI chat for analysis

**Files:**
- `chrome/browser/ui/views/overlay/video_overlay_window_views.cc` — AMI styling + Send to Chat

---

### 31.17 Status Bar & Info Indicators

The status bar (shown at bottom of window when hovering links) and various info indicators throughout the browser chrome.

---

#### Link Hover Status Bar

When hovering over a link, Chrome shows the URL at the bottom-left of the window.

**AMI's changes:**
- Floating pill-shaped tooltip near the bottom-left (not a full-width status bar)
- Background: `#1e1e3a` with `8px` border-radius
- Show shortened URL: domain + truncated path (full URL on long hover or `Ctrl` hold)
- For http:// links: show a red "⚠ Not secure" badge inline with the URL

**Files:**
- `chrome/browser/ui/views/status_bubble.cc` — pill shape, dark style, URL shortening

---

#### Address Bar Security Indicator

The lock/info icon in the URL bar that shows connection security.

**AMI's changes:**
- **Secure (HTTPS)**: subtle AMI green lock (not Chrome's gray lock)
- **Not secure (HTTP)**: red "⚠ Not secure" (same as Chrome but AMI colored)
- **Extension controlled**: purple AMI icon
- Click opens a card bubble: connection details, certificate info, cookie count, Shield block count for this site

**Files:**
- `chrome/browser/ui/views/location_bar/icon_label_bubble_view.cc`
- `chrome/browser/ui/views/location_bar/page_info_bubble_view.cc` — page info card

---

#### Page Info Bubble (Click the Lock Icon)

**Chrome's layout:** Layered panels starting with "Connection is secure", with drilldown for certificate, cookies, site data.

**AMI's layout:**
```
╭────────────────────────────────────────────────────────╮
│  example.com                                    [✕]   │
│─────────────────────────────────────────────────────── │
│  🔒 Connection secure — TLS 1.3                        │
│  🛡 AMI Shield: 14 trackers blocked                   │
│  🍪 Cookies: 2 (both first-party)                     │
│  📍 Location: Blocked                                  │
│─────────────────────────────────────────────────────── │
│  [View Certificate]  [Site Settings]  [Privacy Report] │
╰────────────────────────────────────────────────────────╯
```

**Changes:**
1. **AMI Shield stats** shown prominently (trackers blocked count)
2. **Active permissions** listed inline (location blocked, camera not requested, etc.)
3. **Single panel** instead of Chrome's drill-down layers — key info at a glance
4. Dark card style

**Files:**
- `chrome/browser/ui/views/page_info/page_info_bubble_view.cc` — single panel layout, AMI Shield data

---

### 31.18 Full Internal Pages — Master Inventory

A complete inventory of every `chrome://` and `chrome-untrusted://` URL in Chromium 146, with AMI treatment status:

| URL | Treatment | Priority |
|-----|-----------|----------|
| `chrome://about` | Redirect → `chrome://version` | P0 |
| `chrome://accessibility` | Dark theme | P2 |
| `chrome://app-service-internals` | Dark theme | P3 |
| `chrome://apps` | AMI card style, empty state | P2 |
| `chrome://attribution-internals` | Dark theme | P3 |
| `chrome://autofill-internals` | Dark theme | P2 |
| `chrome://blob-internals` | Dark theme + card rows | P2 |
| `chrome://bluetooth-internals` | Dark theme + card rows | P2 |
| `chrome://bookmarks` | Full redesign (§31.3) | P0 |
| `chrome://browser-switch` | N/A (Windows only, stub out) | — |
| `chrome://cast` | Dark theme + AMI branding | P2 |
| `chrome://certificate-manager` | Card rows, AMI buttons | P1 |
| `chrome://chrome-urls` | Categorized grid (§31.9) | P1 |
| `chrome://components` | Card rows per component | P1 |
| `chrome://crashes` | Card rows, opt-in messaging | P1 |
| `chrome://credits` | AMI header + AMI credits | P1 |
| `chrome://device-log` | Dark theme + monospace | P2 |
| `chrome://discards` | Automation tab markers | P1 |
| `chrome://downloads` | Full redesign (§31.3) | P0 |
| `chrome://extensions` | Full redesign (§31.3) | P0 |
| `chrome://family-link-user-internals` | Dark theme only | P3 |
| `chrome://flags` | AMI section at top (§31.3) | P1 |
| `chrome://gcm-internals` | Disabled notice | P2 |
| `chrome://gpu` | Section reorder + copy btn | P1 |
| `chrome://hats` | Suppressed | P0 |
| `chrome://hid-internals` | Dark theme | P3 |
| `chrome://histograms` | Dark theme + AMI header | P2 |
| `chrome://history` | Full redesign (§31.3) | P0 |
| `chrome://identity-internals` | Dark theme + AMI tokens | P2 |
| `chrome://indexeddb-internals` | Dark theme + card panels | P2 |
| `chrome://inspect` | Dark theme + branding | P2 |
| `chrome://internals` | AMI categorized hub | P1 |
| `chrome://invalidations` | AMI Sync notice | P2 |
| `chrome://lens` | Removed → AMI Ask | P0 |
| `chrome://local-state` | Dark + search + syntax hl | P2 |
| `chrome://management` | AMI managed/unmanaged notice | P1 |
| `chrome://media-engagement` | Dark + card rows | P2 |
| `chrome://media-internals` | Dark + card players | P2 |
| `chrome://memory-internals` | Full redesign — memory cards | P1 |
| `chrome://net-internals` | Chip tabs + Shield tab | P1 |
| `chrome://network-errors` | Dark + AMI error previews | P2 |
| `chrome://new-tab-page` | → AMI NTP (§5) | P0 |
| `chrome://newtab` | → AMI NTP (§5) | P0 |
| `chrome://ntp-cards-internals` | Dark theme | P3 |
| `chrome://ntp-tiles-internals` | Dark theme | P3 |
| `chrome://omnibox` | Dark + AMI providers | P2 |
| `chrome://on-device-internals` | AMI Local AI + Ollama | P1 |
| `chrome://optimization-guide-internals` | Dark + offline notice | P2 |
| `chrome://password-manager` | AMI Vault full redesign | P0 |
| `chrome://password-manager-internals` | Dark + AMI Vault label | P2 |
| `chrome://policy` | AMI Policies section | P1 |
| `chrome://predictors` | Dark + visual conf bars | P2 |
| `chrome://pref-internals` | Dark + search + syntax hl | P2 |
| `chrome://print` | Full redesign (§31.6) | P1 |
| `chrome://process-internals` | Dark + automation markers | P2 |
| `chrome://profile-picker` | AMI card style + dark bg | P1 |
| `chrome://quota-internals` | Dark + AMI usage bars | P2 |
| `chrome://safe-browsing` | AMI Threat Protection label | P1 |
| `chrome://safety-check` | Full redesign (§31.6) | P1 |
| `chrome://sandbox` | Dark + status badges | P2 |
| `chrome://serial-internals` | Dark theme | P3 |
| `chrome://serviceworker-internals` | Dark + status badges | P2 |
| `chrome://settings` | Full redesign (§31.3) | P0 |
| `chrome://signin-internals` | Dark + AMI account label | P2 |
| `chrome://site-engagement` | Dark + purple score bars | P2 |
| `chrome://suggestions` | Dark + offline notice | P2 |
| `chrome://sync-internals` | Dark + AMI Sync notice | P2 |
| `chrome://system` | Dark + card sections + copy | P1 |
| `chrome://tab-search` | Expanded search + automations | P1 |
| `chrome://tracing` | Dark + AMI labels | P2 |
| `chrome://translate-internals` | Dark + AMI Translate notice | P2 |
| `chrome://ukm` | Dark + no-telemetry banner | P2 |
| `chrome://usb-internals` | Dark theme | P3 |
| `chrome://user-actions` | Dark + monospace log | P2 |
| `chrome://version` | Full redesign (§31.3) | P1 |
| `chrome://webrtc-internals` | Dark + connection cards | P2 |
| `chrome://webrtc-logs` | Dark + monospace | P2 |
| `chrome://webui-gallery` | AMI component section first | P2 |
| `chrome://welcome` | Full AMI onboarding | P1 |
| `chrome://whats-new` | AMI changelog | P1 |
| `chrome-untrusted://ami-chat/` | AMI Chat (§4) — new | P0 |
| `chrome-untrusted://mission-control/` | Mission Control (§18) — new | P0 |
| `chrome-untrusted://workflow-builder/` | Workflow Builder (§18.9) — new | P1 |

**Priority key:** P0 = ship with V3 launch · P1 = ship within 30 days · P2 = ship within 90 days · P3 = nice to have

---

## 32. Linux Desktop Integration — Native OS Experience

> **Why Linux-first matters:** AMI Browser targets Linux as its primary platform. Chromium on Linux has rough edges in OS integration — the app doesn't feel native. AMI fixes all of these to make the browser feel like a first-class Linux citizen on both GNOME (Wayland/X11) and KDE Plasma.

---

### 32.1 `.desktop` File & Application Metadata

The `.desktop` file controls how the application appears in the OS app launcher, file manager, and taskbar.

**Current Chromium `chromium-browser.desktop` (what we inherit):**
```ini
[Desktop Entry]
Name=Chromium Web Browser
Exec=/usr/bin/chromium-browser %U
Icon=chromium-browser
Type=Application
Categories=Network;WebBrowser;
```

**AMI's `ami-browser.desktop`:**
```ini
[Desktop Entry]
Version=1.0
Name=AMI Browser
GenericName=Web Browser
Comment=Fast, private, AI-powered web browser
Exec=/usr/lib/ami-browser/ami-browser %U
Icon=ami-browser
Terminal=false
Type=Application
Categories=Network;WebBrowser;AI;
Keywords=ami;browser;web;ai;agent;automation;privacy;
StartupNotify=true
StartupWMClass=ami-browser
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/ami;

# AMI-specific protocol handler
[Desktop Action NewWindow]
Name=New Window
Exec=/usr/lib/ami-browser/ami-browser --new-window

[Desktop Action NewIncognitoWindow]
Name=New Private Window
Exec=/usr/lib/ami-browser/ami-browser --incognito

[Desktop Action OpenAIChat]
Name=Open AMI Chat
Exec=/usr/lib/ami-browser/ami-browser --open-ami-chat

[Desktop Action MissionControl]
Name=Mission Control
Exec=/usr/lib/ami-browser/ami-browser --open-mission-control
```

**Key improvements:**
- `StartupWMClass=ami-browser` — ensures taskbar grouping works correctly in GNOME/KDE
- `MimeType` includes `x-scheme-handler/ami` — handles `ami://` deep links from iOS app and external sources
- **Jump list actions** (New Window, Private Window, AMI Chat, Mission Control) — right-click the taskbar icon in GNOME/KDE to access these instantly
- `Keywords` includes "ai", "agent", "automation" — makes the browser findable by these terms in app search

**Files:**
- `chrome/installer/linux/ami-browser.desktop` — new desktop file
- `chrome/installer/linux/ami-browser-stable.desktop` — stable channel variant

---

### 32.2 System Tray Integration

AMI Browser should have an optional **system tray icon** that persists after the window is closed — showing running automations, unread AI chat messages, and quick access to the app.

**Tray icon behavior:**
- Shown when at least one automation is running OR user has enabled "Keep in tray"
- Icon: AMI logo (16×16, 22×22, 24×24 — standard tray sizes)
- If automations are running: badge with count
- **Right-click menu:**
  ```
  ┌─────────────────────────────────┐
  │ AMI Browser                     │
  │ ─────────────────────────────── │
  │ ● Amazon task — 43% complete    │
  │ ● LinkedIn task — 40% complete  │
  │ ─────────────────────────────── │
  │ Open AMI Browser                │
  │ Open Mission Control            │
  │ Open AMI Chat                   │
  │ ─────────────────────────────── │
  │ Keep in tray when closed [✓]    │
  │ ─────────────────────────────── │
  │ Quit                            │
  └─────────────────────────────────┘
  ```

**Implementation:**
- Use `libappindicator3` (GNOME) / `libdbusmenu` (KDE) for system tray
- New: `chrome/browser/ui/linux/ami_tray_icon.h/.cc`
- Chromium already has `StatusIcon` infrastructure for Linux — extend it

**Files:**
- `chrome/browser/ui/views/status_icons/status_icon_linux.cc` — tray icon implementation
- New: `chrome/browser/ui/linux/ami_tray_icon.h/.cc` — AMI-specific tray logic
- `chrome/browser/app_controller_mac.cc` equivalent for Linux: `chrome/browser/ui/linux/ami_application_handler.cc`

**Effort:** 4–6 hours

---

### 32.3 Wayland & X11 Native Feel

Chrome/Chromium on Wayland has known issues. AMI fixes them all:

**Issues to fix:**
1. **Window decorations (CSD vs SSD):** On GNOME Wayland, Chrome uses client-side decorations that look off. AMI uses proper CSD with AMI-styled title bar (§22.12)
2. **Fractional scaling:** On HiDPI Wayland displays, Chrome's fractional scaling can be blurry. Force `--enable-features=UseOzonePlatform --ozone-platform=wayland` and ensure `--force-device-scale-factor` is set correctly from the system's scale factor
3. **Clipboard sync:** Chrome on Wayland doesn't always sync clipboard properly. Apply the `--enable-features=ClipboardHistoryRefresh` and Wayland clipboard fixes
4. **File portal:** Use `xdg-portal` for file dialogs on both Wayland and X11 (consistent native dialog)
5. **IME (Input Method Editor):** Ensure proper IBus/Fcitx5 integration for CJK input on Wayland
6. **Screen capture:** Use `xdg-desktop-portal` PipeWire screen capture (not just X11 XSHM) for Wayland screen sharing

**Launch flags (set by default in AMI's startup wrapper):**
```bash
#!/bin/bash
# /usr/lib/ami-browser/ami-browser-wrapper

# Detect Wayland
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    FLAGS="--ozone-platform=wayland
           --enable-features=UseOzonePlatform,WaylandWindowDecorations
           --gtk-version=4"
else
    FLAGS="--ozone-platform=x11"
fi

# HiDPI — read scale from gsettings or KDE
if command -v gsettings >/dev/null 2>&1; then
    SCALE=$(gsettings get org.gnome.desktop.interface scaling-factor 2>/dev/null | tr -d "'")
    [ -n "$SCALE" ] && [ "$SCALE" -gt 1 ] && FLAGS="$FLAGS --force-device-scale-factor=$SCALE"
fi

exec /usr/lib/ami-browser/ami-browser $FLAGS "$@"
```

**Files:**
- `chrome/installer/linux/ami-browser-wrapper` — shell wrapper with flag detection
- `chrome/browser/ui/views/frame/browser_frame_view_linux.cc` — CSD improvements

**Effort:** 4–6 hours

---

### 32.4 File Association & MIME Types

AMI Browser should be registered as the default handler for web content types:

```xml
<!-- /usr/share/mime/packages/ami-browser.xml -->
<mime-info>
  <mime-type type="x-scheme-handler/http">
    <comment>HTTP URL</comment>
    <glob pattern="http://*"/>
  </mime-type>
  <mime-type type="x-scheme-handler/https">
    <comment>HTTPS URL</comment>
    <glob pattern="https://*"/>
  </mime-type>
  <mime-type type="x-scheme-handler/ami">
    <comment>AMI Browser Protocol</comment>
    <glob pattern="ami://*"/>
  </mime-type>
  <mime-type type="text/html">
    <glob pattern="*.html"/>
    <glob pattern="*.htm"/>
  </mime-type>
</mime-info>
```

**Post-install setup:**
```bash
# Run during package install (postinst script)
xdg-mime default ami-browser.desktop x-scheme-handler/http
xdg-mime default ami-browser.desktop x-scheme-handler/https
xdg-mime default ami-browser.desktop x-scheme-handler/ami
update-mime-database /usr/share/mime
update-desktop-database /usr/share/applications
gtk-update-icon-cache /usr/share/icons/hicolor
```

**Files:**
- `chrome/installer/linux/ami-browser.xml` — MIME type registration
- `chrome/installer/linux/postinst` — post-install script

---

### 32.5 System Notifications (libnotify / Portal)

When AMI wants to show a desktop notification (automation complete, update available, approval needed), use the system notification system rather than Chrome's own notification popup.

**Implementation:**
- Use `libnotify` for D-Bus notifications on both GNOME and KDE
- Notifications appear in the system notification center
- Automation completion notification example:
  ```
  ╭──────────────────────────────────────╮
  │ [AMI icon] AMI Browser               │
  │ ✅ Automation complete               │
  │ "Buy AA batteries" finished.         │
  │ Cart total: $12.99                   │
  │ [View Result]  [Dismiss]             │
  ╰──────────────────────────────────────╯
  ```
- Approval-needed notifications are **persistent** (don't auto-dismiss) and have action buttons ("Approve" / "Deny") usable directly from the notification center

**Files:**
- `chrome/browser/notifications/notification_platform_bridge_linux.cc` — libnotify integration
- New: `chrome/browser/ami/ami_notification_service.h/.cc` — AMI-specific notification helper

**Effort:** 2–3 hours

---

### 32.6 Application Icon Set — All Required Sizes

Linux requires icons in many sizes for different contexts (app launcher, taskbar, file manager, etc.):

| Size | Format | Use |
|------|--------|-----|
| 16×16 | PNG | Taskbar, system tray, menus |
| 22×22 | PNG | KDE Plasma system tray |
| 24×24 | PNG | GNOME panel |
| 32×32 | PNG | App switcher |
| 48×48 | PNG | App launcher |
| 64×64 | PNG | Large icon view |
| 96×96 | PNG | GNOME Activities |
| 128×128 | PNG | App store, high DPI |
| 256×256 | PNG | Modern launchers |
| 512×512 | PNG | High DPI, 2× |
| Scalable | SVG | Rendering at any size |

**Icon design spec:**
- Background: AMI navy (`#1a1a2e`) rounded to a circle/squircle at larger sizes
- Foreground: AMI logo mark in accent red (`#e94560`) + white
- At 16/22px: simplified version (just the AMI monogram / globe icon)
- At 48px+: full AMI logo with wordmark

**Files:**
- `chrome/app/theme/ami/` — full icon set
- `chrome/installer/linux/hicolor/*/apps/ami-browser.png` — each size

---

### 32.7 Autostart & Background Service

When automations are scheduled or running, AMI Browser should optionally start in the background at login (system tray only, no window).

**Implementation:**
- Settings → AMI → "Start AMI in background at login" (default: off)
- Creates `~/.config/autostart/ami-browser-background.desktop`:
  ```ini
  [Desktop Entry]
  Type=Application
  Name=AMI Browser Background
  Exec=/usr/lib/ami-browser/ami-browser --no-startup-window --enable-background-mode
  Hidden=false
  X-GNOME-Autostart-enabled=true
  ```
- When running in background mode: only the tray icon is shown (§32.2), no browser window
- A "tray-only" window manager hint prevents the browser from appearing in the taskbar/dock when no windows are open

**Files:**
- `chrome/browser/ui/linux/ami_background_mode.cc` — background mode management
- `chrome/browser/resources/settings/ami_startup_section.ts` — autostart toggle

**Effort:** 2–3 hours

---

## 33. AMI Browser Sync — Own Cloud, Zero Google

> **Problem:** Chromium's sync infrastructure is deeply tied to Google Accounts and Google servers. Chrome syncs bookmarks, history, passwords, settings, and extensions to `google.com/accounts`. AMI Browser does NOT use Google Sync — it uses its own sync backend, built on the existing AMI Exchange server infrastructure.

---

### 33.1 What Gets Synced

| Data | Chrome Sync | AMI Sync |
|------|-------------|----------|
| Bookmarks | Google Drive / servers | AMI server (`api.ami.exchange/sync`) |
| History | Google servers (anonymized) | AMI server (end-to-end encrypted) |
| Passwords | Google Account | AMI Vault (E2E encrypted) |
| Open tabs | Google servers | AMI server |
| Extensions list | Google servers | AMI server |
| Settings | Google servers | AMI server |
| Spaces (§3) | N/A (Chrome has Profiles) | AMI server |
| AI chat history | N/A | AMI server |
| Automation history | N/A | AMI server |
| Reward balance | N/A | AMI Rewards backend |

---

### 33.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AMI Browser                              │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  AMI Sync Engine                           │ │
│  │  (Replaces Chromium's SyncService / SyncClient)            │ │
│  │                                                            │ │
│  │  DataTypes:                                                │ │
│  │  Bookmarks → AmiBookmarkSyncBridge                        │ │
│  │  History   → AmiHistorySyncBridge                         │ │
│  │  Passwords → AmiVaultSyncBridge (E2E encrypted)           │ │
│  │  Tabs      → AmiTabSyncBridge                             │ │
│  │  Settings  → AmiPreferenceSyncBridge                      │ │
│  │  Spaces    → AmiSpaceSyncBridge (new data type)           │ │
│  └──────────────────────────┬─────────────────────────────────┘ │
│                             │ HTTPS                              │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                    ┌─────────▼───────────┐
                    │  AMI Sync Server     │
                    │  api.ami.exchange    │
                    │  /api/sync/v1        │
                    │                     │
                    │  Auth: Clerk JWT     │
                    │  Storage: MongoDB    │
                    │  Encryption: AES-256 │
                    └─────────────────────┘
```

---

### 33.3 Encryption Model

AMI Sync uses **end-to-end encryption** for sensitive data (passwords, history, chat history):

1. **Encryption key derivation:** User's AMI account password + salt → PBKDF2 → 256-bit AES key (generated client-side, never sent to server)
2. **Sync payload:** `{ encrypted_data: base64(AES-GCM(plaintext)), iv: base64, version: 1 }`
3. **Server stores only ciphertext** — AMI cannot read passwords or history
4. **Key recovery:** Encrypted key wrapped with a recovery code (12-word BIP-39 mnemonic) shown during account setup

Non-sensitive data (bookmarks titles/URLs, extension list, open tab URLs) is stored server-side but tied to the authenticated Clerk JWT — only accessible by the authenticated user.

---

### 33.4 Cross-Device Sync

When a user signs into AMI on a second device:
1. AMI Chat sidebar shows: "📱 New device connected — iPhone (AMI Browser iOS)" with a timestamp
2. **Open Tabs** from other devices appear in a "Other devices" section in Tab Search (§31.6) and the tab manager
3. **Bookmarks** merge (deduplicated by URL)
4. **History** merges with 90-day retention
5. **Spaces** (§3) sync their tab lists, pinned sites, and settings

---

### 33.5 Settings UI — `chrome://settings/ami/sync`

```
┌────────────────────────────────────────────────────────────────┐
│  🔄 AMI Sync                                                   │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  ● Signed in as: john@company.com                             │
│  Last synced: 2 minutes ago                   [Sync now]      │
│                                                                │
│  Synced data:                                                  │
│  ╭──────────────────────────────────────────────────────────╮ │
│  │ ✓ Bookmarks           ✓ Open tabs                       │ │
│  │ ✓ History             ✓ Extensions                      │ │
│  │ ✓ AMI Vault (E2E 🔒)  ✓ Settings                       │ │
│  │ ✓ Spaces              ✓ AI chat history                 │ │
│  ╰──────────────────────────────────────────────────────────╯ │
│                                                                │
│  Connected devices:                                            │
│  ╭──────────────────────────────────────────────────────────╮ │
│  │ 💻 This device (Ubuntu 24.04) — Active now               │ │
│  │ 📱 AMI Browser iOS — Last seen 5 min ago                 │ │
│  ╰──────────────────────────────────────────────────────────╯ │
│                                                                │
│  [Sign out of sync]    [Manage encryption key]                 │
│  [Delete all sync data]                                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### 33.6 Implementation

**Phase 1 (V3 launch): Replace Google sync with no-op + AMI Sync lite**
- Disable Chromium's `SyncService` entirely (`BUILDFLAG(ENABLE_SYNC) = false` for Google-specific parts)
- Implement AMI Sync as an extension-level service (runs in the Hub extension, syncs via the AMI Exchange server)
- This avoids the complexity of patching Chromium's sync C++ stack for V3

**Phase 2 (V4): Native C++ AMI Sync Engine**
- Implement `AmiSyncService` as a proper Chromium component replacing `SyncService`
- Binary-level integration means sync works even without the Hub extension loaded

**Server side (already exists):** The AMI Exchange MongoDB backend (`mongodb+srv://autoapplyami:...`) has user document structure that can be extended with a `sync` collection per user. Add REST endpoints at `api.ami.exchange/api/sync/v1/{data_type}` with Clerk authentication.

**Files (Phase 1):**
- New: `chrome/browser/ami/sync/ami_sync_extension_bridge.h/.cc` — calls Hub extension sync API
- `chrome/browser/ui/webui/settings/ami_sync_handler.h/.cc` — settings UI data provider
- Server: add `/api/sync/v1/` routes to existing Express backend

**Effort:** Phase 1: 8–10 hours · Phase 2: 40–60 hours

---

## 34. AMI WebStore — Extension Distribution Platform

> **Problem:** Chrome extensions are distributed via the Chrome Web Store — a Google-controlled platform that can remove extensions, requires Google account login, and tracks installs. AMI Browser needs its own extension distribution.

---

### 34.1 What It Is

The AMI WebStore is a curated extension marketplace accessible at:
- **In-browser:** `chrome-untrusted://ami-webstore/` (native WebUI, fast, no external request)
- **Web:** `https://store.ami.exchange/` (public website, links deep-link to the browser)

---

### 34.2 Categories & Curation

| Category | Examples |
|----------|---------|
| **AMI Certified** | Extensions verified and maintained by AMI team |
| **Productivity** | Tab managers, note-taking, clipboard tools |
| **AI Tools** | LLM integrations, writing assistants |
| **Privacy** | Additional ad blockers, cookie managers |
| **Developer** | JSON formatter, API testers, REST clients |
| **Web3 / Crypto** | Wallets, DeFi tools (compatible with AMI Rewards) |
| **Automation** | Tools that work with AMI's OpenClaw agent |
| **Themes** | Custom browser themes (color schemes) |

---

### 34.3 The `chrome-untrusted://ami-webstore/` Page

**Layout:**
```
┌────────────────────────────────────────────────────────────────┐
│  🏪 AMI WebStore                         🔍 Search extensions  │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  [All]  [AMI Certified]  [Productivity]  [AI]  [Privacy] ...  │
│                                                                │
│  ── Featured ──────────────────────────────────────────────   │
│  ╭──────────────╮  ╭──────────────╮  ╭──────────────╮        │
│  │ [icon 64px]  │  │ [icon 64px]  │  │ [icon 64px]  │        │
│  │ Ext Name     │  │ Ext Name     │  │ Ext Name     │        │
│  │ ★★★★★ 4.8   │  │ ★★★★☆ 4.2   │  │ ★★★★★ 4.9   │        │
│  │ 12k installs │  │ 5k installs  │  │ 8k installs  │        │
│  │ [Install →]  │  │ [Install →]  │  │ [+ Add]      │        │
│  ╰──────────────╯  ╰──────────────╯  ╰──────────────╯        │
│                                                                │
│  ── AI-Powered Tools ──────────────────────────────────────   │
│  ...                                                           │
└────────────────────────────────────────────────────────────────┘
```

---

### 34.4 Extension Distribution Infrastructure

**Backend (existing AMI Exchange server):**
```
/api/store/v1/
├── GET /extensions          — list with filters/search/pagination
├── GET /extensions/:id      — single extension detail + reviews
├── GET /extensions/:id/crx  — download .crx package
├── POST /extensions/:id/install — record install (analytics)
├── POST /extensions/:id/review  — submit review (Clerk auth required)
└── GET /categories          — list of categories
```

**`.crx` hosting:** Extensions stored as `.crx` files in object storage (S3-compatible). The browser downloads and installs them using Chromium's existing CRX install path — no Chrome Web Store required.

**Override Chrome Web Store install path:**
```cpp
// chrome/browser/extensions/crx_installer.cc
// When source is kExternalPolicyDownload or a URL matching ami.exchange:
// skip Chrome Web Store validation, use AMI's own signature verification
bool CrxInstaller::AllowInstall(const extensions::Extension* extension) {
  if (IsAmiStoreSource(source_url_))
    return VerifyAmiStoreSignature(extension);
  return VerifyChromeWebStoreSignature(extension);
}
```

**AMI signature verification:** Each extension in the AMI WebStore is signed with AMI's private key. The browser ships with AMI's public key and verifies it on install — same model as Chrome Web Store but using AMI's own PKI.

---

### 34.5 Replace All "Chrome Web Store" References

Across all of Chromium's UI, any reference to "Chrome Web Store" is replaced with "AMI WebStore":

| Location | Chrome text | AMI text |
|----------|------------|---------|
| `chrome://extensions` footer | "Discover more extensions on the Chrome Web Store" | "Discover extensions at AMI WebStore" |
| Extension install dialog | "From Chrome Web Store" | "From AMI WebStore" |
| Manage extensions button | (links to CWS) | Links to `chrome-untrusted://ami-webstore/` |
| Error: unknown extension | "Find in Chrome Web Store" | "Search AMI WebStore" |
| Settings → Extensions section | "Visit Chrome Web Store" | "Open AMI WebStore" |

**Files:**
- All `.grd` / `.grdp` files containing "Chrome Web Store" string IDs
- `chrome/browser/extensions/webstore_installer.cc` — redirect install source
- `chrome/browser/ui/webui/extensions/extensions_ui.cc` — remove CWS promo data

---

### 34.6 Compatibility with Chrome Web Store Extensions

Users may want to install extensions from the Chrome Web Store. AMI Browser supports this via a compatibility mode:

**Settings → Extensions → "Allow Chrome Web Store extensions"** (default: OFF for security/branding)

When enabled:
- Shows a warning: "Chrome Web Store extensions are not verified by AMI. Install only from sources you trust."
- Allows dragging `.crx` files into the extensions page to install
- Allows the user to manually visit `chromewebstore.google.com` and install from there (Chrome Web Store's install flow still works in any Chromium browser if the extension ID is allowed)

When disabled (default):
- Blocks navigation to `chromewebstore.google.com` with a friendly redirect: "AMI Browser's extension platform is the AMI WebStore. [Open AMI WebStore]"

**Files:**
- New: `chrome/browser/ami/ami_webstore_policy.h/.cc` — enforcement
- `chrome/browser/extensions/` — CWS block + AMI redirect

**Effort:** 8–12 hours (store backend + browser integration)

---

### 34.7 Developer Extension Submission

Developers can submit extensions to the AMI WebStore via:
- `https://store.ami.exchange/developer` — developer dashboard
- Submit a `.zip` of the extension source
- AMI team reviews within 48 hours (manual review for launch, automated later)
- Approved extensions get an AMI Store signature applied server-side

**Revenue share:** Paid extensions: 70% developer / 30% AMI Exchange (same as Apple's model). Free extensions: no fee.

---

## Table of Contents Update

The following new sections were added (update Table of Contents):

29. [V3 AI Architecture — Server-Side Proxy (No BYO Keys)](#29-v3-ai-architecture--server-side-proxy-no-byo-keys)
30. [Replace Native Chromium "Ask AI" / Side Panel Button with AMI Chat](#30-replace-native-chromium-ask-ai--side-panel-button-with-ami-chat)
31. [Opera-Style Chromium WebUI Takeover — Full Internal Page Redesign](#31-opera-style-chromium-webui-takeover--full-internal-page-redesign)
32. [Linux Desktop Integration — Native OS Experience](#32-linux-desktop-integration--native-os-experience)
33. [AMI Browser Sync — Own Cloud, Zero Google](#33-ami-browser-sync--own-cloud-zero-google)
34. [AMI WebStore — Extension Distribution Platform](#34-ami-webstore--extension-distribution-platform)
35. [Performance & Startup Optimization](#35-performance--startup-optimization)
36. [Packaging & Distribution](#36-packaging--distribution)
37. [Update Channel System](#37-update-channel-system)
38. [Security Hardening](#38-security-hardening)
39. [Build System & GN Configuration](#39-build-system--gn-configuration)
40. [Privacy & Telemetry Policy](#40-privacy--telemetry-policy)
41. [Accessibility Enhancements](#41-accessibility-enhancements)
42. [iOS / Desktop Companion Integration](#42-ios--desktop-companion-integration)
43. [Testing Strategy](#43-testing-strategy)
44. [V3 → V4 Roadmap](#44-v3--v4-roadmap)

---

## 35. Performance & Startup Optimization

> **Goal:** AMI Browser cold-starts in ≤1.5s on a mid-range Linux machine (8 GB RAM, NVMe SSD). Hot-start (already in RAM) in ≤200ms. Memory footprint ≤180 MB at idle with one tab open.

Chromium's default build is not optimized for startup — it does a lot of work upfront that can be deferred. This section documents every optimization AMI applies.

---

### 35.1 V8 JavaScript Engine Optimization

**Profile-Guided Optimization (PGO):**
- Build with `chrome_pgo_phase=2` using a training workload that simulates AMI's typical usage (NTP load, AMI Chat open, one web page)
- PGO typically reduces startup time by 5–15% on benchmarks

**V8 Startup Snapshot:**
- Chromium ships a V8 context snapshot (`snapshot_blob.bin`) containing pre-compiled built-in JS
- AMI extends this snapshot with AMI's own frequently-used JS (the Chat panel bootstrap, OpenClaw worker initialization)
- Tool: `v8/tools/mksnapshot` with AMI additions

**V8 Code Cache (bytecode caching):**
- Enable `--v8-cache-options=code` to persist compiled bytecode for commonly visited pages
- AMI pre-caches bytecode for its own `chrome-untrusted://` pages during the post-install step
- Cache location: `~/.config/ami-browser/Default/Code Cache/`

**Files:**
- `chrome/BUILD.gn` — PGO flags
- `v8/tools/ami_snapshot_extras.js` — new: AMI additions to V8 snapshot
- `chrome/browser/ami/startup/ami_v8_precache.cc` — post-install bytecode warming

---

### 35.2 Startup Task Deferral

Chrome initializes many services at startup that users don't immediately need. AMI defers them:

| Service | Chrome default | AMI |
|---------|---------------|-----|
| Google Sync | Starts immediately | Removed — replaced by AMI Sync (§33), initialized on demand |
| Safe Browsing updates | Starts immediately | Deferred 5s after first tab loads |
| Spell-check download | Starts immediately | Deferred until user types in a text field |
| Extension background pages | Start with browser | Deferred 3s after first tab loads |
| Crash reporter | Starts immediately | Deferred 10s after launch |
| Network quality estimator | Starts immediately | Disabled (no Google servers) |
| Optimization hints fetch | Starts immediately | Disabled (no Google servers) |
| Metrics/UMA upload | Starts immediately | Disabled (§40) |
| GCM push service | Starts immediately | Disabled (§32.6) |
| Media router (Cast) | Starts immediately | Deferred 10s |

**Implementation:** `chrome/browser/browser_process_impl.cc` — wrap each service init in an `ami::PostDelayedTask()` call where appropriate.

**Files:**
- `chrome/browser/browser_process_impl.cc` — deferred initialization
- New: `chrome/browser/ami/startup/ami_startup_scheduler.h/.cc` — centralized deferred init manager

**Effort:** 6–8 hours

---

### 35.3 Pre-Rendered New Tab Page

The AMI NTP (§5) is the first thing users see. Pre-render it in a spare renderer process while Chrome is still initializing the browser process:

```cpp
// chrome/browser/ui/startup/startup_browser_creator_impl.cc
// After first browser window is created, pre-warm a renderer for NTP:
void StartupBrowserCreatorImpl::PrewarmNTPRenderer() {
  content::RenderProcessHost::WarmupSpareRenderProcessHost(profile_);
  prerender_manager_->AddPrerenderFromBrowser(
      GURL("chrome://newtab"), /* frame_tree_node */ nullptr);
}
```

This means the NTP is fully rendered and ready before the user even sees it — perceived startup time drops dramatically.

**Files:**
- `chrome/browser/ui/startup/startup_browser_creator_impl.cc` — NTP pre-render on startup

---

### 35.4 Memory Optimization — Per-Tab

**Tab discarding (already in §31.8 for `chrome://discards`):**
- AMI aggressively discards background tabs after 15 minutes of inactivity (configurable in settings)
- Automation tabs are never discarded (§18)
- Default Chrome: discard after ~1 hour or under memory pressure only

**Compressed memory (zswap):**
- AMI ships with a `sysctl` recommendation: `vm.swappiness=10`, `zswap.enabled=1`
- Settings → AMI → Performance → "Optimize system memory settings for AMI Browser" (applies recommended sysctl on click)

**Per-process renderer splitting:**
- AMI keeps the default Chromium site-isolation model (one renderer process per origin) but adds a **renderer process cap** of 8 processes to prevent runaway memory with many tabs
- Tabs beyond the cap share renderer processes with same-origin sites where possible

**Memory pressure handling:**
- Custom `chrome/browser/memory/ami_memory_pressure_monitor.cc` that listens to system memory pressure (via `malloc_info()` / cgroup memory events on Linux)
- When >80% RAM used: auto-discard the least-recently-used non-automation tab
- When >90% RAM used: suspend media in background tabs

**Files:**
- `chrome/browser/memory/ami_memory_pressure_monitor.h/.cc` — new
- `chrome/browser/resource_coordinator/tab_lifecycle_unit.cc` — 15-min discard threshold

---

### 35.5 Network Pre-optimization

**DNS prefetching:**
- AMI pre-resolves DNS for the user's most visited 20 domains at startup (pulled from local history)
- Done without sending any data to Google DNS — uses the user's configured DNS-over-HTTPS provider (§38.3)

**HSTS preload list:**
- Chromium ships a large HSTS preload list (`transport_security_state_static.json`). AMI trims it to the 10,000 most commonly visited domains (the full list has 300,000+ entries) to reduce memory footprint — full list still available via runtime fetch if a domain isn't in the trimmed set

**TCP pre-connect:**
- Pre-open TCP connections to the AMI Exchange API endpoints (`api.ami.exchange`, `sync.ami.exchange`) at startup so the first AMI Sync push is instant

**Files:**
- `chrome/browser/net/ami_startup_dns_prefetch.cc` — history-based DNS pre-resolution
- `net/http/transport_security_state_static.json` — trimmed to 10k entries

---

### 35.6 Startup Benchmark Targets

| Metric | Target | How measured |
|--------|--------|-------------|
| Cold start to first paint (NTP) | ≤ 1.5s | `time ami-browser --new-window` — wall clock to first contentful paint |
| Hot start (second launch, already in cache) | ≤ 200ms | Same |
| Memory at idle (1 tab, NTP) | ≤ 180 MB RSS | `smem -P ami-browser` total |
| Memory per additional tab (simple pages) | ≤ 30 MB | Measured across 10 tabs |
| Memory per additional tab (JS-heavy, e.g. Gmail) | ≤ 80 MB | Measured across 5 tabs |
| Extension background page overhead | ≤ 5 MB each | `chrome://memory-internals` |
| Time to AMI Chat ready | ≤ 800ms after NTP paint | JS performance.mark() in Chat |

---

## 36. Packaging & Distribution

> AMI Browser is distributed as native Linux packages (`.deb`, `.rpm`), an `AppImage` for distro-agnostic installs, and potentially a Flatpak/Snap for sandboxed environments. This section documents each format, the package contents, and the install scripts.

---

### 36.1 Debian / Ubuntu Package (`.deb`)

**Package name:** `ami-browser`
**Architecture:** `amd64` (primary), `arm64` (secondary)
**Target distros:** Ubuntu 22.04+, Debian 12+, Pop!_OS, Linux Mint, elementary OS

**Package structure:**
```
ami-browser_1.0.0_amd64.deb
├── /usr/lib/ami-browser/
│   ├── ami-browser                  — main binary
│   ├── ami-browser-wrapper          — shell wrapper (§32.3)
│   ├── chrome-sandbox               — SUID sandbox
│   ├── chrome_crashpad_handler      — crash handler
│   ├── libEGL.so                    — bundled EGL
│   ├── libGLESv2.so                 — bundled GLES
│   ├── resources/
│   │   ├── ami_resources.pak        — UI resources
│   │   └── v8_context_snapshot.bin  — V8 snapshot (§35.1)
│   └── locales/
│       └── en-US.pak                — and other locales
├── /usr/bin/
│   └── ami-browser → /usr/lib/ami-browser/ami-browser-wrapper
├── /usr/share/applications/
│   └── ami-browser.desktop
├── /usr/share/icons/hicolor/
│   ├── 16x16/apps/ami-browser.png
│   ├── 48x48/apps/ami-browser.png
│   ├── 128x128/apps/ami-browser.png
│   └── scalable/apps/ami-browser.svg
├── /usr/share/mime/packages/
│   └── ami-browser.xml
└── /etc/ami-browser/
    └── ami-browser-defaults.conf    — admin-overridable defaults
```

**Control file:**
```
Package: ami-browser
Version: 1.0.0
Architecture: amd64
Maintainer: AMI Exchange <packages@ami.exchange>
Depends: libc6 (>= 2.31), libgtk-3-0 (>= 3.24), libglib2.0-0, libnss3 (>= 3.26), libappindicator3-1, libnotify4, fonts-liberation, xdg-utils
Recommends: libvulkan1, libu2f-udev
Conflicts: ami-browser-beta, ami-browser-unstable
Homepage: https://ami.exchange
Description: AMI Browser — Fast, private, AI-powered web browser
 AMI Browser is a Chromium-based browser with built-in AI assistance,
 automation capabilities, and privacy-first defaults.
```

**Install scripts:**
- `postinst`: register MIME types, update icon cache, set as default browser (if user opts in), create `/etc/ami-browser/` defaults
- `prerm`: unregister MIME types if no other browser installed, remove autostart entry

**APT repository:**
- Hosted at `https://packages.ami.exchange/apt/`
- Users add: `deb [signed-by=/usr/share/keyrings/ami-browser.gpg] https://packages.ami.exchange/apt/ stable main`
- Repository key fingerprint published at `https://ami.exchange/gpg`

---

### 36.2 RPM Package (`.rpm`)

**Target distros:** Fedora 39+, RHEL 9+, openSUSE Leap 15.5+, CentOS Stream 9

**Spec file key sections:**
```spec
Name:       ami-browser
Version:    1.0.0
Release:    1%{?dist}
Summary:    AMI Browser — Fast, private, AI-powered web browser
License:    BSD and LGPLv2+ and ASL 2.0 and MIT and GPLv2
URL:        https://ami.exchange
Requires:   gtk3 >= 3.24, nss >= 3.26, libappindicator, libnotify, xdg-utils

%post
update-mime-database %{_datadir}/mime &>/dev/null
update-desktop-database %{_datadir}/applications &>/dev/null
gtk-update-icon-cache %{_datadir}/icons/hicolor &>/dev/null

%postun
update-mime-database %{_datadir}/mime &>/dev/null
update-desktop-database %{_datadir}/applications &>/dev/null
```

**DNF/YUM repository:**
- `https://packages.ami.exchange/rpm/` — RPM repository with `.repo` file
- Signed with AMI's GPG key (same key as Debian packages)

---

### 36.3 AppImage (Universal Linux Package)

The AppImage bundles all dependencies into a single portable executable — no install required.

**AppImage structure:**
```
AMI_Browser-1.0.0-x86_64.AppImage
└── AppDir/
    ├── AppRun                       — entry point shell script
    ├── ami-browser.desktop
    ├── ami-browser.svg
    └── usr/
        ├── bin/ami-browser          — wrapper
        └── lib/ami-browser/         — same as .deb /usr/lib/ami-browser/
            └── (all bundled .so files including GTK, NSS, etc.)
```

**Key AppImage behaviors:**
- Self-contained — works on any Linux distro with kernel ≥ 4.15
- **No root required** to run
- First run: auto-integrates `.desktop` file and icon via `appimaged` (if installed) or prompts user
- Can be placed in `~/Applications/` and double-clicked

**Build tool:** `appimagetool` + `linuxdeploy` with GTK plugin

**Files:**
- `chrome/installer/linux/appimage/AppRun` — entry point
- `chrome/installer/linux/appimage/build_appimage.sh` — build script

---

### 36.4 Flatpak (Sandboxed)

Flatpak provides a sandboxed environment, common on GNOME-focused distros (Fedora Workstation, etc.).

**App ID:** `exchange.ami.Browser`
**Flatpak manifest:** `exchange.ami.Browser.yml`

**Permissions required:**
```yaml
finish-args:
  - --share=network
  - --share=ipc
  - --socket=wayland
  - --socket=fallback-x11
  - --socket=pulseaudio
  - --device=dri         # GPU acceleration
  - --filesystem=home    # Downloads, file access
  - --talk-name=org.freedesktop.Notifications
  - --talk-name=org.kde.StatusNotifierWatcher
  - --talk-name=org.freedesktop.portal.Desktop
  - --env=GTK_PATH=/app/lib/gtk-3.0
```

**Distribution:** Flathub (`https://flathub.org/apps/exchange.ami.Browser`) — submitted after V3 launch stabilizes

---

### 36.5 Package Size Targets

| Package | Target size | Notes |
|---------|------------|-------|
| `.deb` / `.rpm` | ≤ 120 MB | Compressed `.xz`; excludes bundled fonts (system fonts used) |
| AppImage | ≤ 180 MB | Must bundle GTK, NSS; uses `upx` compression on binary |
| Flatpak | ≤ 200 MB | Includes all runtime libs |
| Install footprint on disk | ≤ 280 MB | `/usr/lib/ami-browser/` + shared assets |

**Size reduction strategies:**
- Strip debug symbols from release build (`strip -s`)
- Use `xz -9` compression for `.deb`
- Remove unused locales from `locales/` — ship only `en-US`, `fr`, `de`, `es`, `pt`, `ja`, `zh-CN` by default; others available as separate locale pack `.deb` files
- Remove unused Chromium features compiled out (see §39)

---

## 37. Update Channel System

> AMI Browser follows a three-channel release model similar to Chrome: Stable, Beta, and Nightly (Dev). This ensures users get tested stable releases while developers and testers can run the latest features.

---

### 37.1 Release Channels

| Channel | Package name | Update frequency | Who uses it |
|---------|-------------|-----------------|-------------|
| **Stable** | `ami-browser` | Every 4–6 weeks | All users (default) |
| **Beta** | `ami-browser-beta` | Every 2 weeks | Opt-in users, power users |
| **Nightly** | `ami-browser-nightly` | Every night at 2AM UTC | Developers, testers |

All three channels can be installed side-by-side (different package names, different install paths, different profile directories).

---

### 37.2 Auto-Update Mechanism

AMI Browser does **not** use Google Update (`update_engine` / Google Software Update) — it implements its own:

**Update check flow:**
```
Every 6 hours (Stable) / 2 hours (Beta) / 30 min (Nightly):

Browser → GET https://updates.ami.exchange/api/update/check
  Body: { channel, version, os, arch, locale }
  
Response:
  { update_available: true, version: "1.1.0", 
    url: "https://packages.ami.exchange/apt/.../ami-browser_1.1.0_amd64.deb",
    sha256: "abc123...",
    release_notes_url: "https://ami.exchange/changelog/1.1.0" }
```

**Update installation:**
- **Linux `.deb`/`.rpm`:** AMI Browser invokes the system package manager (`apt`, `dnf`, `zypper`) via a helper process with `pkexec` (polkit) for privilege elevation — no running as root, no setuid tricks
- **AppImage:** Download new AppImage to a temp path, verify SHA-256, then `mv` over the old one on next launch (the old one is in use during download)
- **Flatpak:** `flatpak update exchange.ami.Browser` — handled by Flatpak's own update mechanism

**Notification (no update nag):**
- When an update is available, a **single** notification appears in the toolbar (a subtle dot on the AMI logo) and in `chrome://settings/ami/about`
- No modal interruptions, no "Chrome is out of date" banners
- **Scheduled restart update:** If the update requires a browser restart, the user sees a toast: "AMI Browser will update when you next close it." — the update is staged and applied on next cold start

---

### 37.3 Delta Updates

Full browser downloads are 100MB+. AMI supports **delta updates** (patches) for users updating from the previous version:

- Delta patch generated server-side using `bsdiff` between adjacent versions
- Typical delta: 5–20 MB vs 120 MB full download
- If delta patch fails to apply (checksum mismatch), fall back to full download automatically
- Delta patches only available for Stable and Beta channels (Nightly always does full download)

**Files:**
- New: `chrome/browser/ami/updater/ami_update_client.h/.cc` — update check, download, verify
- New: `chrome/browser/ami/updater/ami_delta_patcher.h/.cc` — bsdiff apply
- New: `chrome/browser/ui/webui/settings/ami_update_handler.h/.cc` — settings page data

---

### 37.4 Rollback Support

If a Stable update causes widespread crashes (detected via crash reporting §40):
1. AMI server sets the update endpoint to return the previous version for affected configs
2. Users see a toast: "AMI Browser was rolled back to 1.0.1 due to a critical issue. Update to 1.1.1 when available."
3. The rolled-back version is pinned until a fixed release is available

**Files:**
- `chrome/browser/ami/updater/ami_update_client.cc` — rollback detection and version pin

---

### 37.5 `chrome://settings/ami/about`

The About page (replaces `chrome://settings/help`):

```
┌────────────────────────────────────────────────────────────────┐
│  About AMI Browser                                             │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  [AMI Logo]  AMI Browser                                       │
│              Version 1.0.0 (Stable)                           │
│              Chromium 146.0.7680.80                            │
│                                                                │
│  ✅ AMI Browser is up to date.                 [Check now]    │
│                                                                │
│  Release channel:  ● Stable  ○ Beta  ○ Nightly               │
│                    [Switch channel]                            │
│                                                                │
│  ─────────────────────────────────────────────────────────    │
│                                                                │
│  Release notes for 1.0.0 ↗                                    │
│  Report a bug ↗                                               │
│  AMI Exchange website ↗                                       │
│                                                                │
│  OS: Ubuntu 24.04.1 LTS (Linux 6.8.0)                        │
│  Architecture: x86_64                                         │
│  Profile path: ~/.config/ami-browser/Default/                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 38. Security Hardening

> AMI Browser builds on Chromium's already strong security model and adds additional hardening specific to its threat model: protecting users from web-based attacks, preventing data exfiltration to third parties, and securing the automation engine.

---

### 38.1 Compile-Time Security Flags

Build flags applied in `args.gn` (documented in §39):

```gn
# Control Flow Integrity
is_cfi = true
use_cfi_icall = true
use_cfi_cast = true

# Stack protection
enable_stack_protector = true

# ASLR (Address Space Layout Randomization) — PIE binary
is_pie = true

# Fortify source (glibc buffer overflow detection)
use_fortify_source = true

# Shadow Call Stack (AArch64 only)
use_shadow_call_stack = true  # arm64 build only
```

---

### 38.2 Sandbox Hardening

Chromium already sandboxes renderer processes with namespaces + seccomp-BPF. AMI adds:

**Renderer process hardening:**
- Enable `MADV_DONTFORK` on heap pages to prevent memory from leaking to forked child processes
- `SECCOMP_MODE_FILTER` policy for renderers: whitelist of ≤50 syscalls (same as Chrome's policy + remove any syscalls not needed by AMI)
- Audit the seccomp filter for AMI-specific code paths (the Ollama sidecar communication, DevTools MCP port)

**GPU process sandboxing:**
- On Wayland: GPU process uses a separate `DRM` fd passed via socket (no direct `/dev/dri` access in renderer)
- Verify `--no-sandbox` flag is NOT set in production builds — fail build if detected in release config

**Extension sandbox:**
- Extensions in the AMI WebStore are reviewed for permissions. Extensions requesting `<all_urls>` access are flagged in the store UI with a warning badge

**Files:**
- `sandbox/linux/seccomp-bpf-helpers/ami_renderer_syscall_policy.cc` — AMI seccomp policy

---

### 38.3 DNS-over-HTTPS (DoH) — Default On

Chrome enables DoH optionally. AMI enables it **by default** with user-configurable providers:

**Default provider:** Cloudflare (`https://cloudflare-dns.com/dns-query`) — no logging policy
**Alternative providers available:** NextDNS, AdGuard DNS, Mullvad, system resolver (off)

**Settings location:** `chrome://settings/privacy` → "Use secure DNS" → always on with provider selector

**AMI DoH behavior:**
- DoH used for all DNS resolution including prefetch (§35.5)
- Captive portal detection still uses plain DNS to detect captive portals (otherwise captive portals would never be detected)
- When using a VPN: skip DoH and use VPN's DNS to avoid DoH traffic leaking outside VPN tunnel (detected via routing table check)

**Files:**
- `chrome/browser/net/dns_util.cc` — default DoH setting
- `chrome/browser/ui/webui/settings/privacy_sandbox_handler.cc` — DoH provider list

---

### 38.4 Enhanced Tracking Protection (Always On)

AMI ships with tracker blocking enabled by default for all users (not opt-in like Chrome's "Enhanced protection"):

**Tracker blocking layers:**
1. **DNS-level:** Block known tracker domains at DNS resolution time (using Cloudflare's Malware + Tracking list when using Cloudflare DoH)
2. **Network-level:** AMI Shield's request blocker (uses uBlock Origin's lists compiled into the browser, §14)
3. **JS-level:** Block fingerprinting scripts (canvas fingerprint, AudioContext fingerprint, WebGL fingerprint)
4. **Cookie-level:** Third-party cookies blocked by default. First-party cookies: 7-day TTL cap for tracking cookies (Safari ITP-style)

**Fingerprinting resistance:**
- `navigator.userAgent` → sanitized UA string (no OS version, no specific Chromium build number)
- `navigator.platform` → `"Linux x86_64"` always (not the actual CPU info)
- `screen.width` / `screen.height` → rounded to nearest 10px
- `Date` timezone → UTC for non-trusted sites (user can whitelist sites)
- `navigator.hardwareConcurrency` → capped at 4 (not the actual core count)
- `navigator.deviceMemory` → always returns `4` (not actual RAM)

**Files:**
- `third_party/blink/renderer/core/frame/navigator.cc` — UA, platform, hardware spoofing
- `chrome/browser/ami/shield/ami_shield_fingerprint_protection.cc` — canvas, AudioContext spoofing

---

### 38.5 HTTPS-Only Mode

AMI enables **HTTPS-Only Mode** by default (Chrome has this off by default):

- All HTTP navigations are upgraded to HTTPS automatically
- If upgrade fails, show an AMI-styled interstitial (§31.15): "This site doesn't support secure connections"
- Mixed content is blocked (not just warned about)
- HTTP sites in bookmarks show a `⚠` icon

**Files:**
- `chrome/browser/ssl/https_only_mode_tab_helper.cc` — enforce HTTPS-only default

---

### 38.6 AMI Shield — Integrated Security Dashboard

`chrome://settings/ami/shield` is the central security control panel:

```
┌────────────────────────────────────────────────────────────────┐
│  🛡 AMI Shield                                                 │
│ ═══════════════════════════════════════════════════════════════│
│                                                                │
│  Today's stats:                                                │
│  ╭──────────────┐ ╭──────────────═ ╭──────────────╮          │
│  │ 1,247        │ │ 38           │ │ 12           │          │
│  │ Trackers     │ │ Ads          │ │ Fingerprint  │          │
│  │ blocked      │ │ blocked      │ │ attempts     │          │
│  ╰──────────────╯ ╰──────────────╯ ╰──────────────╯          │
│                                                                │
│  Protections:                                                  │
│  ● Tracker blocking          ON  [toggle]                     │
│  ● Ad blocking               ON  [toggle]                     │
│  ● Fingerprinting protection ON  [toggle]                     │
│  ● HTTPS-Only Mode           ON  [toggle]                     │
│  ● DNS-over-HTTPS            ON  Cloudflare [change]          │
│  ● Safe Browsing             ON  AMI lists [manage]           │
│                                                                │
│  Per-site exceptions:  [Manage exceptions]                    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### 38.7 Automation Engine Security (OpenClaw)

The OpenClaw automation agent (§18) has access to the browser and can navigate pages, fill forms, and click buttons. This is a powerful attack surface:

**Security model for automation:**
1. **Explicit approval required** for any automation that touches:
   - Forms with `type="password"` fields
   - Payment pages (detected by URL + page content heuristics)
   - Pages in AMI's "Sensitive Sites" list (banking, medical, government)
2. **Automation sandbox:** All agent JS runs in an isolated renderer context — it can't access the user's extension contexts or privileged AMI pages
3. **MCP tool allowlist:** The DevTools MCP tools available to AI agents (§31.11) are restricted to read-only tools by default. Write/navigate tools require explicit user approval per session
4. **Automation audit log:** Every action taken by an agent is logged to `~/.config/ami-browser/automation-log/` with timestamps, URLs, and action descriptions — accessible via `chrome://settings/ami/automation-log`
5. **Rate limiting:** Agent can perform max 10 actions/second, 500 actions/session — prevents runaway loops from consuming system resources

**Files:**
- New: `chrome/browser/ami/automation/ami_automation_security.h/.cc` — approval gates
- New: `chrome/browser/ami/automation/ami_automation_audit_log.h/.cc` — audit logging
- `chrome/browser/ami/automation/openclaw_agent.cc` — rate limiting

---

## 39. Build System & GN Configuration

> This section documents the complete GN args, build process, and patch management system for building AMI Browser from Chromium source.

---

### 39.1 Repository Structure

AMI Browser is maintained as a **patch set on top of Chromium** — not a fork. The repository structure:

```
ami-browser/                          — AMI Browser repository
├── chromium/                         — Chromium source (git submodule, pinned to 146.0.7680.80)
├── patches/                          — Git patches applied on top of Chromium
│   ├── 0001-ami-branding.patch       — Brand strings, colors, icons
│   ├── 0002-ami-ntp.patch            — New Tab Page replacement
│   ├── 0003-ami-chat-sidebar.patch   — AI Chat sidebar
│   ├── 0004-remove-google-services.patch
│   ├── 0005-ami-webui-takeover.patch — §31 WebUI redesigns
│   ├── 0006-ami-shield.patch         — Tracker/ad blocking
│   ├── ...
│   └── 0042-ami-webstore.patch       — AMI WebStore
├── ami_src/                          — AMI-specific source files (not patches)
│   ├── chrome/browser/ami/           — Core AMI features
│   ├── chrome/browser/resources/ami/ — AMI WebUI resources
│   └── chrome-untrusted/             — AMI sandboxed WebUI pages
├── scripts/
│   ├── apply_patches.sh              — Apply all patches to chromium/
│   ├── build.sh                      — Full build script
│   ├── update_chromium.sh            — Bump Chromium version
│   └── generate_patch.sh             — Create a new patch from staged changes
├── args/
│   ├── release.gn                    — Production build GN args
│   ├── debug.gn                      — Debug build GN args
│   └── asan.gn                       — ASAN build for testing
└── CHANGELOG.md
```

---

### 39.2 Production Build GN Args (`args/release.gn`)

```gn
# === AMI Browser Release Build Configuration ===
# Chromium 146.0.7680.80 — AMI Browser 1.0.0

# Target
target_os = "linux"
target_cpu = "x64"

# Build type
is_official_build = true
is_debug = false
symbol_level = 0             # No debug symbols in release

# Component build (monolithic binary — smaller, faster startup)
is_component_build = false

# Chrome branding (enables official APIs, Widevine, etc.) replaced by AMI branding
# We keep is_chrome_branded = false and implement needed APIs ourselves
is_chrome_branded = false
is_chromium_branded = false   # Our own branding
ami_branded = true            # New GN arg for AMI-specific code paths

# Compiler optimizations
use_thin_lto = true           # Thin LTO for cross-translation-unit optimization
chrome_pgo_phase = 2          # Profile-guided optimization (training run first)
use_goma = true               # Goma/Siso distributed compilation

# Features to ENABLE
enable_widevine = true        # For DRM content (Netflix, etc.)
enable_pdf = true             # Built-in PDF viewer
enable_printing = true        # Print support
use_system_libjpeg = false    # Bundled (consistent behavior)
use_system_libpng = false
use_system_zlib = true        # System zlib is fine

# Features to DISABLE (Google services)
enable_google_now = false
enable_background_mode = false  # We implement our own (§32.7)
enable_service_worker_core = true  # Keep — needed for web apps
safe_browsing_mode = 1        # Local safe browsing lists only (no Google ping)
enable_reporting = false      # No Chrome reporting API
enable_network_error_logging = false
enable_nacl = false           # Native Client — deprecated, disable
enable_remoting = false       # Chrome Remote Desktop — not in AMI

# Google API keys (intentionally blank — AMI does not use Google APIs)
google_api_key = ""
google_default_client_id = ""
google_default_client_secret = ""

# Proprietary codecs (important for media playback)
proprietary_codecs = true
ffmpeg_branding = "Chrome"    # Enables H.264, AAC, MP3 in FFmpeg

# Security
is_cfi = true
use_cfi_icall = true
use_cfi_cast = true

# DCHECK (debug assertions) — off in release, on in debug
dcheck_always_on = false

# AMI-specific GN args
ami_exchange_api_url = "https://api.ami.exchange"
ami_sync_url = "https://sync.ami.exchange"
ami_webstore_url = "https://store.ami.exchange"
ami_updates_url = "https://updates.ami.exchange"
ami_devtools_mcp_port = 18793
```

---

### 39.3 Debug Build (`args/debug.gn`)

```gn
# Inherits from release.gn, overrides:
is_official_build = false
is_debug = true
symbol_level = 2              # Full debug symbols
use_thin_lto = false          # LTO disabled for faster incremental builds
chrome_pgo_phase = 0          # No PGO in debug
is_component_build = true     # Component build for faster incremental builds
dcheck_always_on = true

# Point to local dev servers
ami_exchange_api_url = "http://localhost:3000"
ami_sync_url = "http://localhost:3001"
ami_devtools_mcp_port = 18793
```

---

### 39.4 Patch Management

As Chromium is updated (every 4–6 weeks for a new major version), patches must be rebased:

```bash
# Update Chromium to a new version
scripts/update_chromium.sh 147.0.7900.0

# This script:
# 1. Pulls the new Chromium tag in the submodule
# 2. Attempts to apply patches in order (scripts/apply_patches.sh)
# 3. Reports conflicts

# For each conflicting patch:
cd chromium/
git apply --reject ../patches/0005-ami-webui-takeover.patch
# Fix .rej files manually
git add .
../scripts/generate_patch.sh 0005-ami-webui-takeover.patch
```

**Automated patch conflict detection:**
- CI runs `apply_patches.sh` against the `main` Chromium branch daily
- If any patch fails, a GitHub issue is automatically created: "Patch conflict: 0005-ami-webui-takeover.patch needs rebase for Chromium XXXX"

---

### 39.5 Build Script (`scripts/build.sh`)

```bash
#!/bin/bash
set -e

CHANNEL="${1:-stable}"
ARCH="${2:-x64}"

echo "=== AMI Browser Build ==="
echo "Channel: $CHANNEL  Arch: $ARCH"

# 1. Apply patches
echo "Applying patches..."
cd chromium
git checkout .
cd ..
bash scripts/apply_patches.sh

# 2. Copy AMI source files
echo "Syncing ami_src/..."
rsync -a ami_src/ chromium/

# 3. Set up GN
cd chromium
gn gen out/Release --args="$(cat ../args/release.gn) target_cpu=\"$ARCH\""

# 4. Build
echo "Building... (this will take a while)"
autoninja -C out/Release chrome chrome_sandbox

# 5. Package
echo "Packaging..."
bash ../scripts/package.sh "$CHANNEL" "$ARCH" out/Release

echo "=== Build complete ==="
```

---

### 39.6 CI/CD Pipeline

**GitHub Actions workflows:**
```
.github/workflows/
├── ci.yml           — PR checks: patch apply, build (debug), unit tests
├── nightly.yml      — Nightly: full release build, package, publish to nightly repo
├── release.yml      — Manual trigger: release build, sign, publish to stable/beta repo
└── patch-check.yml  — Daily: check patches against upstream Chromium main
```

**Build machines:** 2× 96-core `c3-highmem-192` (GCP) for PGO training + release builds. Estimated build time with Goma: ~45 minutes for a full release build.

---

## 40. Privacy & Telemetry Policy

> This section documents exactly what data AMI Browser collects, what it sends, what it does NOT send, and where this is disclosed to users.

---

### 40.1 What Chrome Sends That AMI Does NOT Send

| Chrome data collection | AMI status | GN flag / code change |
|------------------------|-----------|----------------------|
| Google UMA/UKM metrics | ❌ Disabled | `enable_reporting = false` |
| RLZ ping (install tracking) | ❌ Disabled | `enable_rlz = false` |
| Google Sync heartbeats | ❌ Disabled | Sync removed (§33) |
| Safe Browsing URL ping | ❌ Disabled | `safe_browsing_mode = 1` (local lists only) |
| Optimization hints fetch | ❌ Disabled | `enable_optimization_guide_fetching = false` |
| Field trials (Chrome experiments) | ❌ Disabled | `fieldtrial_testing_config_path = ""` |
| Usage statistics / crash reports to Google | ❌ Disabled | `enable_crash_reporter = false` (to Google) |
| Translation requests to Google | ❌ Disabled | Replaced with AMI AI provider (§31.16) |
| Spelling check requests to Google | ❌ Disabled | Local Hunspell dictionary only |
| Search suggestions ping | ❌ Disabled | AMI search doesn't ping Google |
| NTP content fetch from Google | ❌ Disabled | AMI NTP uses local + AMI server content |
| WebRTC IP leak to Google STUN | ⚠️ Use AMI STUN | Replace Google STUN server URLs |

---

### 40.2 What AMI Browser Does Send

| Data | Destination | Purpose | Can opt out? |
|------|-------------|---------|-------------|
| Anonymous crash reports | `crashes.ami.exchange` | Bug fixing | Yes — opt in only |
| Update check: `{ channel, version, arch }` | `updates.ami.exchange` | Version check | No (needed for updates) — but no identifying info |
| AMI Sync data (E2E encrypted blobs) | `sync.ami.exchange` | Cross-device sync | Yes — don't sign in |
| AI chat messages | User's configured AI provider OR `api.ami.exchange/proxy` | AI responses | Yes — use local Ollama |
| AMI Rewards events | `api.ami.exchange/rewards` | Reward balance | Yes — disable rewards |
| Extension install events | `store.ami.exchange` | Store analytics (anonymous) | Yes — offline install |

---

### 40.3 Crash Reporting

AMI uses `crashpad` (same as Chromium) but routes to AMI's own Sentry instance:

**Collection (opt-in only, default OFF):**
- Crashes captured by `chrome_crashpad_handler`
- Minidump + stack trace sent to `https://crashes.ami.exchange/api/minidump/`
- **Personally identifying information stripped before upload:** URLs stripped from stack frames, form values not included, history not included
- User can review pending crash reports before sending: `chrome://crashes` (§31.9)

**User-visible dialog (on crash):**
```
╭──────────────────────────────────────────────────────╮
│ AMI Browser crashed                                   │
│                                                       │
│ We're sorry — something went wrong.                  │
│                                                       │
│ ○ Send crash report to AMI (recommended)             │
│   This helps us fix the issue. No personal data.    │
│ ○ Don't send                                         │
│                                                       │
│ [Restart AMI Browser]                                 │
╰──────────────────────────────────────────────────────╯
```

---

### 40.4 Privacy Policy Disclosure

**In-browser disclosure locations:**
1. `chrome://settings/ami/privacy` — comprehensive table of all data collected (same as §40.2 above)
2. First-run welcome page (§31.14) — brief summary of privacy practices
3. `chrome://settings/ami/about` — link to full privacy policy at `https://ami.exchange/privacy`

**The AMI Privacy Promise (shown on settings page):**
> AMI Browser does not send your browsing history, search queries, or personal data to any third party — including AMI Exchange. Your data stays on your device or in your own encrypted AMI Sync vault. AMI earns revenue through AMI Rewards (opt-in) and premium AI usage, not by selling your data.

---

## 41. Accessibility Enhancements

> AMI Browser aims to exceed WCAG 2.1 AA compliance across all its custom UI. This section documents AMI-specific accessibility work beyond what Chromium provides.

---

### 41.1 Screen Reader Support

Chromium has reasonable screen reader support (AT-SPI2 on Linux). AMI's custom UI elements must provide proper ARIA:

**AMI Chat Sidebar:**
- Chat messages: `role="log"` on the message container, `aria-live="polite"` for new messages
- Each message: `role="article"`, `aria-label="AMI: [message preview]"` or `aria-label="You: [message preview]"`
- Input: `aria-label="Message AMI"`, `aria-multiline="true"`
- Streaming responses: `aria-live="polite"` updates as text streams in

**AMI NTP:**
- Search box: `aria-label="Search the web with AMI"`
- Shortcut tiles: `role="link"`, `aria-label="[site name]"`
- AI suggestion cards: `role="article"`, `aria-label="[suggestion title]"`

**Mission Control:**
- Automation task list: `role="list"`, each task: `role="listitem"`, progress: `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Approval prompts: `role="alertdialog"`, focus trapped inside until resolved

**AMI WebStore:**
- Extension cards: `role="article"`, `aria-label="[Extension name], [star rating], [install count]"`
- "Install" button: `aria-label="Install [Extension name]"`

---

### 41.2 Keyboard Navigation

All AMI custom UI elements must be fully keyboard navigable:

| UI element | Keyboard behavior |
|-----------|-------------------|
| AMI Chat sidebar | `Tab` moves between input and action buttons; `Enter` sends; `Esc` closes |
| AMI NTP shortcuts | Arrow keys navigate tiles; `Enter` opens; `Delete` removes |
| Omnibox AMI suggestions | `Tab` accepts AI suggestion; `Enter` searches |
| Permission bubbles | `Enter` = Allow; `Esc` = Block; Tab between buttons |
| AMI Shield toggle (toolbar) | `Space` toggles; `Enter` opens full Shield panel |
| Mission Control | Full keyboard navigation: `j`/`k` move between tasks, `Enter` opens, `a` approves |
| Sidebar tabs | `Ctrl+]` / `Ctrl+[` cycle through sidebar panel tabs |

**Files:**
- All AMI WebUI TypeScript files — ensure `tabindex`, `keydown` handlers
- New: `chrome/browser/resources/ami/a11y/keyboard_nav.ts` — shared keyboard nav utilities

---

### 41.3 High Contrast & Forced Colors Mode

When the OS is in high contrast mode (`prefers-contrast: more` or Windows Forced Colors):

**AMI CSS adaptation:**
```css
@media (forced-colors: active) {
  :root {
    --ami-bg: Canvas;
    --ami-surface: Canvas;
    --ami-card: Canvas;
    --ami-accent: Highlight;
    --ami-text: CanvasText;
    --ami-border: ButtonBorder;
  }
  
  .ami-card {
    border: 1px solid ButtonBorder;
    background: Canvas;
  }
  
  .ami-button-primary {
    background: Highlight;
    color: HighlightText;
    border: 1px solid ButtonBorder;
  }
}
```

All AMI SVG icons must use `currentColor` for strokes/fills so they respond to forced colors.

---

### 41.4 Font Scaling & Zoom

AMI's UI must remain usable at browser zoom levels from 75% to 200%:

- All layout uses `rem`/`em` units (not `px`) for text-containing elements
- Card grids use CSS Grid with `auto-fill` — at large zoom levels, cards wrap to fewer columns
- The AMI Chat sidebar has a minimum width of `280px` and a maximum of `600px` — resizable by dragging
- The sidebar remembers its width per profile

---

### 41.5 Motion Reduction

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable all AMI animations */
  .ami-card { transition: none; }
  .ami-slide-in { animation: none; }
  .ami-spinner { animation: none; }
  /* Replace spinner with a static "Loading..." text */
  .ami-spinner::after { content: "Loading…"; animation: none; }
}
```

---

## 42. iOS / Desktop Companion Integration

> AMI Browser iOS app (already built) connects to AMI Browser V3 on desktop for seamless cross-device workflows. This section documents the integration points.

---

### 42.1 Shared AMI Sync (§33)

The primary integration: bookmarks, history, open tabs, and AMI Vault passwords sync between iOS and desktop via AMI Sync (§33).

**iOS → Desktop:**
- Open tabs from iPhone appear in the "Other Devices" section of the desktop tab search panel
- Bookmarks added on iPhone appear on desktop within seconds (push notification via WebSocket or polling)
- Copied URLs on iPhone (via "Send to desktop" Share Sheet action) open in a new tab on desktop (push via AMI server)

**Desktop → iOS:**
- "Send to phone" button in the AMI desktop omnibox: sends the current URL to the iOS app (appears as a notification)
- Shared clipboard: text copied in AMI Chat on desktop available in AMI iOS app (opt-in)

---

### 42.2 QR Code Pairing

To connect a new device to AMI Sync without typing passwords:

```
Desktop: Settings → AMI Sync → "Add device"
  → Shows a QR code

iOS: AMI Browser iOS → Settings → Sync → "Pair new device"
  → Scans QR code → devices linked
```

**Protocol:** The QR code encodes a short-lived (60s TTL) pairing token. The desktop polls `api.ami.exchange/pair/check?token=xxx`. The iOS app POSTs `api.ami.exchange/pair/confirm?token=xxx` with its device ID. Once confirmed, both devices get each other's device ID and can sync.

---

### 42.3 AMI Handoff

**Desktop → iOS:**
- Any automation running on desktop can be configured to "notify on completion" — sends a push notification to paired iOS devices with the result

**iOS → Desktop automation:**
- The iOS app's "Ask AMI" (Siri shortcut) can trigger desktop automations remotely:
  - "Hey Siri, ask AMI to order more coffee" → iOS app sends task to desktop → desktop runs the automation
  - Works only when desktop is running (via the system tray background mode, §32.7)
- Trigger endpoint: `ami://automation/trigger?task=...` handled by the AMI browser deep link handler

---

### 42.4 Continuity Camera (AMI Vision)

When a user on desktop wants to analyze an image via AMI's vision AI:
- Right-click on any image on desktop → "Ask AMI about this image" → sends image to AMI Chat
- On iOS: the AMI app can use the phone camera and send the photo to the desktop AMI Chat session in real time (via AMI Sync photo relay)
- Practical use case: "Point your phone at this diagram and ask AMI to explain it" from the desktop chat

---

### 42.5 Shared AMI Vault

AMI Vault passwords (§31.6) are shared between iOS and desktop through AMI Sync with E2E encryption. Specific integration:
- iOS AutoFill uses the AMI Vault credentials (via iOS Password Manager API / `ASCredentialIdentityStore`)
- Desktop AutoFill uses the same Vault
- Changes (new passwords, edits) sync in under 5 seconds

---

## 43. Testing Strategy

> How AMI Browser is tested to ensure quality across its Chromium base, AMI features, and UI customizations.

---

### 43.1 Test Layers

| Layer | Framework | What it tests | Run frequency |
|-------|-----------|--------------|---------------|
| C++ unit tests | GTest | AMI C++ components (sync bridge, Shield, automation security) | Every commit |
| Browser tests | `browser_tests` target | Integration: WebUI pages, settings, permissions | Every PR |
| Interactive UI tests | `interactive_ui_tests` | Real browser window, actual user interactions | Every PR |
| Web platform tests (WPT) | WPT harness | Web standards compliance | Nightly |
| Visual regression | Playwright + screenshot diffing | AMI WebUI appearance | Every PR |
| Performance benchmarks | Telemetry / Catapult | Startup time, memory, rendering | Nightly |
| End-to-end (E2E) | Playwright | Full user flows (install extension, sync, automation) | Nightly |
| Security fuzzing | LibFuzzer / AFL++ | Parser, networking, WebUI input | Continuous |

---

### 43.2 "Not Chrome" Test Suite (Automated)

The 24-row "Not Chrome" test table in §31.13 is encoded as an automated test suite:

```typescript
// chrome/test/ami/not_chrome_test.ts
describe('AMI Browser — Not Chrome', () => {
  it('NTP does not contain Google branding', async () => {
    await page.goto('chrome://newtab');
    expect(await page.textContent('body')).not.toContain('Google');
    expect(await page.textContent('body')).toContain('AMI');
  });

  it('Settings page shows AMI branding', async () => {
    await page.goto('chrome://settings');
    expect(await page.title()).toContain('AMI');
    expect(await page.textContent('h1')).not.toContain('Chrome');
  });

  it('Omnibox default search is not Google', async () => {
    const defaultEngine = await browser.getDefaultSearchEngine();
    expect(defaultEngine.keyword).not.toBe('google.com');
  });

  it('No Google API requests on startup', async () => {
    const googleRequests = networkLog.filter(r => 
      r.url.includes('google.com') || r.url.includes('googleapis.com')
    );
    expect(googleRequests).toHaveLength(0);
  });
  
  // ... 20 more tests
});
```

---

### 43.3 Visual Regression Tests

Every AMI WebUI page has a baseline screenshot. PRs that change WebUI code trigger screenshot comparisons:

```yaml
# .github/workflows/visual-regression.yml
- name: Run visual regression
  run: |
    playwright test tests/visual/
    # Generates diff images for any changed pages
    # Fails if pixel diff > 0.5% of screen area
```

**Pages with baseline screenshots:**
- `chrome://newtab` — AMI NTP
- `chrome://settings` — AMI Settings
- `chrome://extensions` — AMI Extensions
- `chrome://history` — AMI History
- All AMI-branded interstitial pages
- AMI Chat sidebar (open state, streaming state)
- Mission Control (with active tasks)

---

### 43.4 Privacy Audit Tests

Automated network request auditing to verify no Google requests:

```typescript
// Tests that run on browser startup and record all network requests
// for 30 seconds, then verify no requests to Google domains:
const BLOCKED_DOMAINS = [
  'google.com', 'googleapis.com', 'googleusercontent.com',
  'gstatic.com', 'googlesyndication.com', 'google-analytics.com',
  'googletagmanager.com', 'chrome.google.com', 'update.googleapis.com',
  'safebrowsing.googleapis.com', 'clients1.google.com', 
  'clients2.google.com', 'accounts.google.com',
];

it('No requests to Google domains on cold start', async () => {
  const requests = await collectNetworkRequests(30_000);
  const googleRequests = requests.filter(r => 
    BLOCKED_DOMAINS.some(d => r.url.includes(d))
  );
  expect(googleRequests).toEqual([]);
});
```

---

### 43.5 Automation Security Tests

Tests that verify the OpenClaw automation engine cannot be abused:

```typescript
it('Automation requires approval for password fields', async () => {
  await agent.navigate('https://login.example.com');
  const fillTask = agent.fillField('input[type=password]', 'test');
  // Should not proceed without approval
  await expect(fillTask).toThrow('ApprovalRequired');
});

it('MCP write tools require explicit session approval', async () => {
  const mcp = await connectToDevToolsMCP();
  // Read-only tools work:
  await expect(mcp.call('screenshot')).resolves.toBeTruthy();
  // Write tools blocked by default:
  await expect(mcp.call('navigate', {url: 'https://example.com'}))
    .rejects.toThrow('MCPWriteToolNotApproved');
});
```

---

## 44. V3 → V4 Roadmap

> V3 (this document) establishes AMI Browser as a production-quality, privacy-first, AI-integrated Chromium browser. V4 deepens every layer with features that require more foundational infrastructure.

---

### 44.1 V3 Definition of Done

V3 ships when ALL of the following are true:

- [ ] All P0 items in §31.18 master inventory are complete
- [ ] Build passes on Ubuntu 22.04 and Fedora 39 (clean install)
- [ ] Cold start ≤ 1.5s on reference hardware (i5-8th gen, 8GB RAM, NVMe)
- [ ] "Not Chrome" test suite: 24/24 passing
- [ ] Privacy audit: zero Google domain requests on cold start
- [ ] AMI Sync operational: bookmarks/history/tabs sync between two desktop instances
- [ ] AMI Chat functional with at least Ollama + OpenAI providers
- [ ] OpenClaw can complete a 5-step shopping automation on Amazon
- [ ] AMI WebStore serves ≥20 curated extensions
- [ ] `.deb` and AppImage packages built and installable
- [ ] Nightly build channel publishing automatically

---

### 44.2 V4 Feature Targets

| Feature | Description | Estimated scope |
|---------|-------------|----------------|
| **Native AMI Sync Engine** | Rewrite AMI Sync as a native C++ Chromium component (replaces Phase 1 extension-based sync) | ~60h |
| **AMI Browser Android** | Port of AMI Browser to Android (Chromium/WebLayer based) — allows completing the mobile ecosystem | ~200h |
| **AMI Vision native integration** | Native camera/screen-capture AI analysis pipeline using local vision models (LLAVA, Moondream) | ~40h |
| **AMI Browser Extensions API** | AMI-specific extension APIs exposing `openclaw`, `ami-vault`, `ami-chat` — extensions can build on AMI's AI | ~50h |
| **P2P Private Browsing** | Optional Tor integration for truly anonymous browsing (embedded `tor` process, `.onion` support) | ~30h |
| **AMI Spaces V2** | Spaces become full "browser profiles" with their own extensions, stored cookies, and AMI Vault vaults | ~40h |
| **Browser-native RAG** | Local document ingestion (PDFs, emails, notes) indexed in a local vector DB; AMI Chat can answer questions about your documents | ~80h |
| **AMI Themes store** | Full custom browser themes (toolbar, tab strip, NTP) distributed via AMI WebStore | ~20h |
| **Multi-agent orchestration** | Multiple OpenClaw agents running simultaneously, one agent can spawn sub-agents for parallelism | ~50h |
| **AMI Browser for macOS** | Port to macOS (requires macOS-specific native integration work: Touch Bar, system integration) | ~120h |
| **Enterprise Management Console** | `chrome://settings/ami/enterprise` — bulk policy management for organizations deploying AMI Browser fleet-wide | ~60h |
| **AMI Browser SDK** | Public SDK for building integrations with AMI Browser's automation, chat, and Vault APIs | ~40h |

---

### 44.3 Chromium Version Update Cadence

Chromium releases a new major version approximately every 4 weeks. AMI Browser tracks Chromium on this schedule:

| AMI Version | Chromium Base | Target Date |
|-------------|--------------|-------------|
| 1.0.0 (V3 launch) | 146.x | Q2 2026 |
| 1.1.0 | 147.x | Q3 2026 |
| 1.2.0 | 148.x | Q3 2026 |
| 1.3.0 | 149.x | Q4 2026 |
| 2.0.0 (V4 launch) | 150.x | Q4 2026 |

**Version number scheme:**
- `[AMI major].[Chromium minor delta].[patch]`
- AMI 1.0.0 = Chromium 146 baseline
- AMI 1.1.0 = Chromium 147 (one major update ahead)
- AMI 2.0.0 = V4 launch (new major AMI version regardless of Chromium version)

---

### 44.4 Open Source Strategy

AMI Browser V3 is developed as source-available (patches visible, binary distributed). The plan for V4:

- **Open source the patches** — all AMI patches on top of Chromium published on GitHub under BSD license (same as Chromium)
- **Proprietary AMI features** — AMI Exchange server, AMI Rewards backend, and AMI WebStore curation remain proprietary
- **Community contributions** — Accept patches for bug fixes, new locale support, and WebUI improvements
- **Bounty program** — $500–$5000 bounties for security vulnerabilities reported responsibly to `security@ami.exchange`

---

### 44.5 Hardware Partnership Targets

| Partner | Integration |
|---------|------------|
| **Framework Laptop** | AMI Browser as default browser on Framework's Linux image |
| **Raspberry Pi** | AMI Browser ARM64 build optimized for Pi 5 (4GB model) |
| **PINE64** | AMI Browser on PinePhone Pro — mobile Linux support path |
| **System76** | AMI Browser pre-installed on Pop!_OS-shipped machines |
