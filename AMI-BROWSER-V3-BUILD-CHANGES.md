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
5. If newer version found → shows update badge on toolbar + notification in `chrome://settings/help`
6. User clicks "Update" → downloads the asset matching their OS/arch → applies update

**Update check endpoint (no backend needed):**
```
GET https://api.github.com/repos/yassirboudda/AMIBrowser/releases/latest
→ { "tag_name": "v3.0.2", "assets": [{ "name": "ami-browser-3.0.2-linux-x64.deb", "browser_download_url": "..." }] }
```

**Works with private repos** using a bundled GitHub token (read-only, scoped to releases). For public repos, no token needed (5000 req/hr with token, 60/hr without).

**Update UI:**
- Toolbar badge: small green dot on AMI logo when update available
- `chrome://settings/help` → "AMI Browser is up to date" or "Update available: v3.0.2 — [Update Now]"
- Settings toggle: "Check for updates automatically" (default: ON)
- Update progress bar during download

**Implementation files:**
| File | Purpose |
|------|---------|
| `browser/ami_update_checker.cc` | Background update check service (runs every 4 hours) |
| `browser/ami_update_checker.h` | Header |
| `browser/ami_update_ui.cc` | Update notification bar + toolbar badge |
| `browser/resources/ami_update_page.html` | The `chrome://settings/help` update panel |

#### Phase 2: Hybrid Backend (Subscription + Delta Updates)

**When needed:** Once AMI Browser has paid tiers or needs delta updates to reduce download sizes.

**Lightweight backend API (single endpoint):**
```
GET https://updates.ami.exchange/api/check?version=3.0.1&os=linux&arch=x64&channel=stable&license=xxx
→ {
    "update_available": true,
    "version": "3.0.2",
    "download_url": "https://github.com/.../releases/download/v3.0.2/ami-browser-3.0.2-linux-x64.deb",
    "delta_url": "https://updates.ami.exchange/deltas/3.0.1-to-3.0.2.bsdiff",  // optional
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
| 59 | Packaging & Auto-Updater (§24) | 18-28h | P0 | All |

**Day 12-25 total: ~233-330 hours**
**Outcome:** Complete AMI Browser V3 with Vision AI automation engine, Workflow Builder, Mission Control live dashboard, cron scheduling, and every planned feature.

### Total Estimated Build Time

| Phase | Hours | Calendar (1 person) | Calendar (2-3 people) |
|-------|-------|--------------------|-----------------------|
| Phase 1: Foundation + Visual Identity | 38-57h | 3-5 days | 2-3 days |
| Phase 2: UI Polish + Core Features | 53-74h | 5-7 days | 2-3 days |
| Phase 3: Remaining UI + AI Features | 79-115h | 8-11 days | 3-5 days |
| Phase 4: Power Features + Mission Control | 233-330h | 20-30 days | 8-12 days |
| **Total** | **417-598h** | **38-55 days** | **18-26 days** |

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

---

*This document is the complete build plan for AMI Browser V3. Every section requires touching the Chromium binary. Extension-level features (AI chat logic, integration configs, skills library) are handled by the Hub extension outside of this build.*

*Last updated by: AMI Exchange Engineering Team*
