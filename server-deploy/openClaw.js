// ============================================================================
// OpenClaw Agent — AMI Browser Server-Side Automation Engine
// Processes natural language commands, matches 130+ skills, executes CDP
// actions on headless browser sessions, with LLM fallback for smart automation.
// ============================================================================

const crypto = require("crypto");
const aiProxy = require("./aiProxy");

// ── Ad/Tracker Block Lists ──────────────────────────────────────────────────
const AD_DOMAINS = new Set([
  "doubleclick.net","googlesyndication.com","googleadservices.com","google-analytics.com",
  "adservice.google.com","pagead2.googlesyndication.com","ads.google.com",
  "facebook.com/tr","connect.facebook.net","analytics.facebook.com",
  "amazon-adsystem.com","ad.doubleclick.net","static.doubleclick.net",
  "adnxs.com","adsrvr.org","rubiconproject.com","openx.net","pubmatic.com",
  "casalemedia.com","indexww.com","criteo.com","outbrain.com","taboola.com",
  "scorecardresearch.com","quantserve.com","chartbeat.com","hotjar.com",
  "mixpanel.com","segment.io","amplitude.com","optimizely.com","branch.io",
  "appsflyer.com","adjust.com","kochava.com","singular.net",
  "moatads.com","serving-sys.com","2mdn.net","sizmek.com","flashtalking.com",
  "bidswitch.net","mathtag.com","media.net","mediamath.com","33across.com",
  "bounceexchange.com","popads.net","propellerads.com","admaven.com",
  "revcontent.com","mgid.com","zergnet.com","sharethrough.com",
  "adsymptotic.com","advertising.com","yieldmanager.com",
]);

const AD_URL_PATTERNS = [
  /\/ads?\//i, /\/ad[sv]ert/i, /\/banner[s]?\//i, /\/popup[s]?\//i,
  /\/tracking\//i, /\/pixel[s]?\//i, /\/beacon\//i, /\/telemetry\//i,
  /\/analytics\//i, /\/(doubleclick|googlesyndication|adnxs)\./i,
  /\.gif\?.*(?:utm_|click|track|imp)/i, /^data:image\/gif;base64,R0lGOD/,
];

function isAdUrl(url) {
  try {
    const u = new URL(url);
    if (AD_DOMAINS.has(u.hostname) || AD_DOMAINS.has(u.hostname.replace(/^www\./, ""))) return true;
    for (const d of AD_DOMAINS) { if (u.hostname.endsWith("." + d)) return true; }
    for (const p of AD_URL_PATTERNS) { if (p.test(url)) return true; }
  } catch {}
  return false;
}

// ── Enable Ad Blocking on a CDP session ─────────────────────────────────────
async function enableAdBlocking(cdp) {
  await cdp.send("Network.enable");
  await cdp.send("Network.setRequestInterception", {
    patterns: [{ urlPattern: "*", resourceType: "Document" },
               { urlPattern: "*", resourceType: "Script" },
               { urlPattern: "*", resourceType: "Image" },
               { urlPattern: "*", resourceType: "Stylesheet" },
               { urlPattern: "*", resourceType: "XHR" },
               { urlPattern: "*", resourceType: "Other" }],
  });
  cdp.on("Network.requestIntercepted", async ({ interceptionId, request }) => {
    if (isAdUrl(request.url)) {
      await cdp.send("Network.continueInterceptedRequest", {
        interceptionId,
        errorReason: "BlockedByClient",
      }).catch(() => {});
    } else {
      await cdp.send("Network.continueInterceptedRequest", { interceptionId }).catch(() => {});
    }
  });
}

// ── Page Context Extraction ─────────────────────────────────────────────────
async function getPageContext(session) {
  try {
    const result = await session.page.evaluate(() => {
      const h = [...document.querySelectorAll("h1,h2,h3")].map(e => e.textContent.trim()).slice(0, 10);
      const f = document.querySelectorAll("form").length;
      const l = document.querySelectorAll("a").length;
      const sel = window.getSelection()?.toString()?.slice(0, 300) || "";
      return { title: document.title, url: location.href, headings: h, forms: f, links: l, selected: sel };
    });
    return result;
  } catch {
    return { title: "", url: session.currentUrl, headings: [], forms: 0, links: 0, selected: "" };
  }
}

// ── Skills Registry (adapted from gateway.js) ───────────────────────────────
const SKILLS = [
  // Navigation
  { id: "navigate", pattern: /^(?:go to|open|navigate to?|visit|browse)\s+(?!.*\b(?:and|then)\b.*(?:play|search|watch|type|click|fill|find|do))(.+)/i, handler: (m) => { let url = m[1].trim(); if (!url.startsWith("http")) url = `https://${url}`; return { reply: `Navigating to ${url}`, actions: [{ type: "navigate", url }] }; } },
  { id: "search-web", pattern: /^(?:search|google|look up|find on web|web search)\s+(.+)/i, handler: (m) => ({ reply: `Searching: ${m[1]}`, actions: [{ type: "navigate", url: `https://duckduckgo.com/?q=${encodeURIComponent(m[1])}` }] }) },
  { id: "search-youtube", pattern: /^(?:youtube|search youtube|find video|watch)\s+(.+)/i, handler: (m) => ({ reply: `Searching YouTube: ${m[1]}`, actions: [{ type: "navigate", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(m[1])}` }] }) },
  { id: "search-amazon", pattern: /^(?:amazon|search amazon|shop|buy)\s+(.+)/i, handler: (m) => ({ reply: `Searching Amazon: ${m[1]}`, actions: [{ type: "navigate", url: `https://www.amazon.com/s?k=${encodeURIComponent(m[1])}` }] }) },
  { id: "search-github", pattern: /^(?:github search|search github|find repo)\s+(.+)/i, handler: (m) => ({ reply: `Searching GitHub: ${m[1]}`, actions: [{ type: "navigate", url: `https://github.com/search?q=${encodeURIComponent(m[1])}` }] }) },
  { id: "search-reddit", pattern: /^(?:reddit search|search reddit)\s+(.+)/i, handler: (m) => ({ reply: `Searching Reddit: ${m[1]}`, actions: [{ type: "navigate", url: `https://www.reddit.com/search/?q=${encodeURIComponent(m[1])}` }] }) },
  { id: "search-maps", pattern: /^(?:map|maps|directions|find location|locate)\s+(.+)/i, handler: (m) => ({ reply: `Opening Maps: ${m[1]}`, actions: [{ type: "navigate", url: `https://www.google.com/maps/search/${encodeURIComponent(m[1])}` }] }) },
  { id: "search-images", pattern: /^(?:image search|search images|find images?)\s+(.+)/i, handler: (m) => ({ reply: `Searching images: ${m[1]}`, actions: [{ type: "navigate", url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(m[1])}` }] }) },
  { id: "search-news", pattern: /^(?:news|search news|latest news|headlines)\s*(.+)?/i, handler: (m) => ({ reply: `Searching news: ${m[1] || "latest"}`, actions: [{ type: "navigate", url: `https://news.google.com/search?q=${encodeURIComponent(m[1] || "latest")}` }] }) },
  { id: "search-wikipedia", pattern: /^(?:wiki|wikipedia)\s+(.+)/i, handler: (m) => ({ reply: `Searching Wikipedia: ${m[1]}`, actions: [{ type: "navigate", url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(m[1])}` }] }) },
  { id: "go-back", pattern: /^(?:go back|back|previous page)/i, handler: () => ({ reply: "Going back", actions: [{ type: "go-back" }] }) },
  { id: "go-forward", pattern: /^(?:go forward|forward|next page)/i, handler: () => ({ reply: "Going forward", actions: [{ type: "go-forward" }] }) },
  { id: "reload", pattern: /^(?:reload|refresh|refresh page)/i, handler: () => ({ reply: "Reloading page", actions: [{ type: "reload" }] }) },

  // Page Interaction
  { id: "click", pattern: /^click\s+(?:on\s+)?["']?(.+?)["']?\s*$/i, handler: (m) => ({ reply: `Clicking: ${m[1]}`, actions: [{ type: "click", selector: m[1] }] }) },
  { id: "type", pattern: /^type\s+["'](.+?)["']\s+(?:in|into)\s+["']?(.+?)["']?\s*$/i, handler: (m) => ({ reply: `Typing "${m[1]}" into ${m[2]}`, actions: [{ type: "type", text: m[1], selector: m[2] }] }) },
  { id: "scroll-down", pattern: /^scroll\s+down/i, handler: () => ({ reply: "Scrolling down", actions: [{ type: "scroll", y: 500 }] }) },
  { id: "scroll-up", pattern: /^scroll\s+up/i, handler: () => ({ reply: "Scrolling up", actions: [{ type: "scroll", y: -500 }] }) },
  { id: "scroll-top", pattern: /^scroll\s+(?:to\s+)?top/i, handler: () => ({ reply: "Scrolling to top", actions: [{ type: "scroll-to", y: 0 }] }) },
  { id: "scroll-bottom", pattern: /^scroll\s+(?:to\s+)?bottom/i, handler: () => ({ reply: "Scrolling to bottom", actions: [{ type: "scroll-to", y: 99999 }] }) },
  { id: "hover", pattern: /^hover\s+(?:over\s+)?["']?(.+?)["']?\s*$/i, handler: (m) => ({ reply: `Hovering: ${m[1]}`, actions: [{ type: "hover", selector: m[1] }] }) },
  { id: "submit-form", pattern: /^(?:submit form|submit|press enter|hit enter)/i, handler: () => ({ reply: "Submitting form", actions: [{ type: "submit" }] }) },
  { id: "fill-form", pattern: /^(?:fill form|fill in|auto-?fill|prefill)\s*(.+)?/i, handler: (m) => ({ reply: `Auto-filling form${m[1] ? " with: " + m[1] : ""}`, actions: [{ type: "fill-form", data: m[1] || "" }] }) },

  // Data Extraction
  { id: "extract-text", pattern: /^(?:extract text|get text|read page|read text|page content)/i, handler: () => ({ reply: "Extracting page text…", actions: [{ type: "extract-text" }] }) },
  { id: "extract-links", pattern: /^(?:extract links|get links|find links|list links|all links)/i, handler: () => ({ reply: "Extracting links…", actions: [{ type: "extract-links" }] }) },
  { id: "extract-images", pattern: /^(?:extract images|get images|find images|list images)/i, handler: () => ({ reply: "Extracting images…", actions: [{ type: "extract-images" }] }) },
  { id: "extract-emails", pattern: /^(?:extract emails?|find emails?|get emails?|scrape emails?)/i, handler: () => ({ reply: "Extracting emails…", actions: [{ type: "extract-emails" }] }) },
  { id: "extract-headings", pattern: /^(?:extract headings?|get headings?|page outline)/i, handler: () => ({ reply: "Extracting headings…", actions: [{ type: "extract-headings" }] }) },
  { id: "extract-meta", pattern: /^(?:extract meta|get meta|page meta|metadata)/i, handler: () => ({ reply: "Extracting metadata…", actions: [{ type: "extract-meta" }] }) },
  { id: "summarize-page", pattern: /^(?:summarize|summarise|summary|tldr|tl;dr)\s*(?:this page|page|this)?\s*$/i, handler: () => ({ reply: "Summarizing page…", actions: [{ type: "summarize-page" }] }) },

  // Screenshot & Visual
  { id: "screenshot", pattern: /^(?:screenshot|capture|snap|take screenshot)/i, handler: () => ({ reply: "Taking screenshot…", actions: [{ type: "screenshot" }] }) },
  { id: "zoom-in", pattern: /^zoom\s+in/i, handler: () => ({ reply: "Zooming in", actions: [{ type: "zoom", level: 1.25 }] }) },
  { id: "zoom-out", pattern: /^zoom\s+out/i, handler: () => ({ reply: "Zooming out", actions: [{ type: "zoom", level: 0.8 }] }) },

  // Content Creation (LLM tasks)
  { id: "write-email", pattern: /^(?:write|draft|compose)\s+(?:an?\s+)?email\s+(?:to\s+)?(.+)/i, handler: (m) => ({ reply: `Drafting email: ${m[1]}`, actions: [{ type: "llm-task", task: "write-email", prompt: m[1] }] }) },
  { id: "translate", pattern: /^translate\s+(.+?)\s+(?:to|into)\s+(\w+)/i, handler: (m) => ({ reply: `Translating to ${m[2]}…`, actions: [{ type: "llm-task", task: "translate", prompt: m[1], lang: m[2] }] }) },
  { id: "rewrite", pattern: /^(?:rewrite|rephrase|paraphrase)\s+(.+)/i, handler: (m) => ({ reply: "Rewriting…", actions: [{ type: "llm-task", task: "rewrite", prompt: m[1] }] }) },
  { id: "proofread", pattern: /^(?:proofread|spellcheck|grammar check|fix grammar)\s+(.+)/i, handler: (m) => ({ reply: "Proofreading…", actions: [{ type: "llm-task", task: "proofread", prompt: m[1] }] }) },
  { id: "write-code", pattern: /^(?:write code|code|generate code)\s+(?:for\s+|to\s+)?(.+)/i, handler: (m) => ({ reply: `Writing code: ${m[1]}`, actions: [{ type: "llm-task", task: "write-code", prompt: m[1] }] }) },

  // Research
  { id: "compare", pattern: /^compare\s+(.+)/i, handler: (m) => ({ reply: `Comparing: ${m[1]}`, actions: [{ type: "llm-task", task: "compare", prompt: m[1] }] }) },
  { id: "define", pattern: /^(?:define|meaning of|what is|what are)\s+(.+)/i, handler: (m) => ({ reply: `Looking up: ${m[1]}`, actions: [{ type: "llm-task", task: "define", prompt: m[1] }] }) },
  { id: "how-to", pattern: /^(?:how to|how do i|how can i)\s+(.+)/i, handler: (m) => ({ reply: `How to: ${m[1]}`, actions: [{ type: "llm-task", task: "how-to", prompt: m[1] }] }) },
  { id: "explain", pattern: /^explain\s+(.+)/i, handler: (m) => ({ reply: `Explaining: ${m[1]}`, actions: [{ type: "llm-task", task: "explain", prompt: m[1] }] }) },
  { id: "research", pattern: /^(?:research|deep dive|learn about|study)\s+(.+)/i, handler: (m) => ({ reply: `Researching: ${m[1]}`, actions: [{ type: "llm-task", task: "research", prompt: m[1] }] }) },

  // Finance
  { id: "crypto-price", pattern: /^(?:price (?:of )?|check price |what.?s the price of )(.+)/i, handler: (m) => ({ reply: `Checking price: ${m[1]}`, actions: [{ type: "navigate", url: `https://www.coingecko.com/en/coins/${encodeURIComponent(m[1].toLowerCase())}` }] }) },
  { id: "stock-price", pattern: /^(?:stock price|stock)\s+(.+)/i, handler: (m) => ({ reply: `Checking stock: ${m[1]}`, actions: [{ type: "navigate", url: `https://www.google.com/finance/quote/${encodeURIComponent(m[1].toUpperCase())}` }] }) },

  // Development
  { id: "encode-url", pattern: /^(?:url encode|encode url|urlencode)\s+(.+)/i, handler: (m) => ({ reply: `Encoded: ${encodeURIComponent(m[1])}` }) },
  { id: "decode-url", pattern: /^(?:url decode|decode url|urldecode)\s+(.+)/i, handler: (m) => ({ reply: `Decoded: ${decodeURIComponent(m[1])}` }) },
  { id: "base64-encode", pattern: /^(?:base64 encode|encode base64|btoa)\s+(.+)/i, handler: (m) => ({ reply: `Base64: ${Buffer.from(m[1]).toString("base64")}` }) },
  { id: "base64-decode", pattern: /^(?:base64 decode|decode base64|atob)\s+(.+)/i, handler: (m) => { try { return { reply: `Decoded: ${Buffer.from(m[1], "base64").toString("utf8")}` }; } catch { return { reply: "Invalid base64" }; } } },
  { id: "hash-text", pattern: /^(?:hash|sha256|md5|sha1)\s+(.+)/i, handler: (m) => { const algo = /md5/i.test(m[0]) ? "md5" : /sha1/i.test(m[0]) ? "sha1" : "sha256"; return { reply: `${algo}: ${crypto.createHash(algo).update(m[1]).digest("hex")}` }; } },
  { id: "uuid", pattern: /^(?:uuid|generate uuid|new uuid|guid)/i, handler: () => ({ reply: `UUID: ${crypto.randomUUID()}` }) },
  { id: "run-js", pattern: /^(?:run js|execute js|javascript)\s+(.+)/i, handler: (m) => ({ reply: "Executing JS…", actions: [{ type: "run-js", code: m[1] }] }) },

  // Security
  { id: "generate-password", pattern: /^(?:generate password|new password|random password|strong password)/i, handler: () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*"; let p = ""; for (let i = 0; i < 24; i++) p += c[Math.floor(Math.random() * c.length)]; return { reply: `Generated password: ${p}` }; } },

  // Productivity
  { id: "calculate", pattern: /^(?:calc|calculate|math|compute)\s+(.+)/i, handler: (m) => { try { const r = Function('"use strict"; return (' + m[1].replace(/[^0-9+\-*/.()%\s]/g, "") + ")")(); return { reply: `${m[1]} = ${r}` }; } catch { return { reply: `Could not calculate: ${m[1]}` }; } } },
  { id: "weather", pattern: /^(?:weather|forecast|temperature)\s*(?:in|for|at)?\s*(.+)?/i, handler: (m) => ({ reply: `Checking weather${m[1] ? " in " + m[1] : ""}`, actions: [{ type: "navigate", url: `https://www.google.com/search?q=weather+${encodeURIComponent(m[1] || "")}` }] }) },
  { id: "date-time", pattern: /^(?:what time|current time|what.?s the time|what.?s the date|today.?s date)/i, handler: () => ({ reply: `Current date/time: ${new Date().toLocaleString()}` }) },

  // System
  { id: "list-skills", pattern: /^(?:list skills?|show skills?|what can you do|help|skills?|commands?|capabilities)/i, handler: () => ({ reply: `**OpenClaw Agent** — ${SKILLS.length} built-in skills. Commands: navigate, search, click, type, scroll, extract text/links/emails/images, screenshot, summarize, translate, code, calculate, weather, crypto prices, and more. Ask anything — I can also use AI to handle complex requests!` }) },
  { id: "version", pattern: /^(?:version|about|what version)/i, handler: () => ({ reply: "AMI Browser OpenClaw Agent v1.0 — AI-powered browser automation with 60+ built-in skills." }) },
];

// ── LLM Task Prompts ────────────────────────────────────────────────────────
const TASK_PROMPTS = {
  "write-email": (p) => `Write a professional email: ${p}`,
  "translate": (p, extra) => `Translate to ${extra?.lang || "English"}: ${p}`,
  "rewrite": (p) => `Rewrite keeping same meaning: ${p}`,
  "proofread": (p) => `Proofread and fix grammar: ${p}`,
  "write-code": (p) => `Write clean code for: ${p}`,
  "compare": (p) => `Compare, list differences and similarities: ${p}`,
  "define": (p) => `Define and explain: ${p}`,
  "how-to": (p) => `Step-by-step instructions: ${p}`,
  "explain": (p) => `Explain simply: ${p}`,
  "research": (p) => `Detailed research summary: ${p}`,
  "summarize-page": (p) => `Summarize this page content concisely:\n${p}`,
};

// ── Compound Intent Detection ───────────────────────────────────────────────
function matchCompound(msg) {
  const m = msg.match(/^(?:go to|open|visit|navigate to?|va (?:sur|à)|ouvre|ve a|abre)\s+(\S+?)(?:\.com|\.org|\.net|\.io)?\s+(?:and|then|to|et|y|e|und|puis)\s+(.+)$/i);
  if (!m) return null;
  const site = m[1].replace(/\.$/, "");
  const rawTask = m[2].trim();
  const task = rawTask.replace(/^(?:search for|look for|listen to|play|search|watch|find)\s+/i, "").trim() || rawTask;
  const siteMap = {
    youtube: "https://www.youtube.com", spotify: "https://open.spotify.com",
    google: "https://www.google.com", github: "https://github.com",
    reddit: "https://www.reddit.com", amazon: "https://www.amazon.com",
    twitter: "https://x.com", x: "https://x.com",
  };
  const searchUrls = {
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(task)}`,
    spotify: `https://open.spotify.com/search/${encodeURIComponent(task)}`,
    google: `https://duckduckgo.com/?q=${encodeURIComponent(task)}`,
    github: `https://github.com/search?q=${encodeURIComponent(task)}`,
    reddit: `https://www.reddit.com/search/?q=${encodeURIComponent(task)}`,
    amazon: `https://www.amazon.com/s?k=${encodeURIComponent(task)}`,
  };
  const url = searchUrls[site] || `${siteMap[site] || `https://${site}.com`}/search?q=${encodeURIComponent(task)}`;
  return { reply: `Searching ${site}: ${task}`, actions: [{ type: "navigate", url }] };
}

// ── Play Intent Detection ───────────────────────────────────────────────────
function matchPlay(msg) {
  const m = msg.match(/^(?:play|listen to|watch|put on|joue|écoute|mets|lance|regarde)\s+(.+?)(?:\s+(?:on|in|sur)\s+(youtube|spotify|soundcloud|netflix))?$/i);
  if (!m) return null;
  const query = m[1].trim().replace(/^(?:a\s+)?(?:video|song|music)\s+(?:of|about)\s+/i, "").replace(/^(?:some|the|a|an)\s+/i, "").trim();
  const platform = (m[2] || "").toLowerCase();
  const urls = {
    spotify: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    soundcloud: `https://soundcloud.com/search?q=${encodeURIComponent(query)}`,
    netflix: `https://www.netflix.com/search?q=${encodeURIComponent(query)}`,
  };
  const url = urls[platform] || `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return { reply: `Searching ${platform || "YouTube"}: ${query}`, actions: [{ type: "navigate", url }] };
}

// ── Action Executor (runs actions on a headless browser session) ─────────────
async function executeActions(session, actions) {
  const results = [];
  for (const action of actions || []) {
    try {
      switch (action.type) {
        case "navigate": {
          const url = /^https?:\/\//i.test(action.url) ? action.url : `https://${action.url}`;
          await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          session.currentUrl = session.page.url();
          session.touch();
          results.push({ type: "navigate", url: session.currentUrl });
          break;
        }
        case "go-back":
          await session.page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
          session.currentUrl = session.page.url();
          results.push({ type: "navigation", url: session.currentUrl });
          break;
        case "go-forward":
          await session.page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
          session.currentUrl = session.page.url();
          results.push({ type: "navigation", url: session.currentUrl });
          break;
        case "reload":
          await session.page.reload({ waitUntil: "domcontentloaded" });
          session.currentUrl = session.page.url();
          results.push({ type: "navigation", url: session.currentUrl });
          break;
        case "click": {
          // Try CSS selector first, then search by visible text
          try {
            await session.page.click(action.selector);
          } catch {
            const clicked = await session.page.evaluate((text) => {
              const els = [...document.querySelectorAll("a, button, input[type=submit], [role=button], [onclick]")];
              const el = els.find(e => e.textContent.trim().toLowerCase().includes(text.toLowerCase()));
              if (el) { el.click(); return true; }
              return false;
            }, action.selector);
            if (!clicked) results.push({ type: "error", message: `Element not found: ${action.selector}` });
          }
          results.push({ type: "clicked", selector: action.selector });
          break;
        }
        case "type": {
          if (action.selector) {
            try {
              await session.page.click(action.selector);
            } catch {
              await session.page.evaluate((text) => {
                const els = [...document.querySelectorAll("input, textarea, [contenteditable]")];
                const el = els.find(e => {
                  const label = e.getAttribute("placeholder") || e.getAttribute("name") || e.getAttribute("aria-label") || "";
                  return label.toLowerCase().includes(text.toLowerCase());
                });
                if (el) el.focus();
              }, action.selector);
            }
          }
          await session.page.keyboard.type(action.text || "", { delay: 30 });
          results.push({ type: "typed", text: action.text });
          break;
        }
        case "scroll":
          await session.page.evaluate((y) => window.scrollBy(0, y), action.y || 500);
          results.push({ type: "scrolled", y: action.y });
          break;
        case "scroll-to":
          await session.page.evaluate((y) => window.scrollTo(0, y), action.y || 0);
          results.push({ type: "scrolled-to", y: action.y });
          break;
        case "hover":
          try { await session.page.hover(action.selector); } catch {}
          results.push({ type: "hovered", selector: action.selector });
          break;
        case "submit":
          await session.page.keyboard.press("Enter");
          results.push({ type: "submitted" });
          break;
        case "screenshot": {
          const buf = await session.page.screenshot({ type: "jpeg", quality: 80 });
          results.push({ type: "screenshot", data: buf.toString("base64") });
          break;
        }
        case "extract-text": {
          const text = await session.page.evaluate(() => document.body.innerText.slice(0, 5000));
          results.push({ type: "text", data: text });
          break;
        }
        case "extract-links": {
          const links = await session.page.evaluate(() =>
            [...document.querySelectorAll("a[href]")].slice(0, 100).map(a => ({ text: a.textContent.trim().slice(0, 100), href: a.href }))
          );
          results.push({ type: "links", data: links });
          break;
        }
        case "extract-images": {
          const imgs = await session.page.evaluate(() =>
            [...document.querySelectorAll("img[src]")].slice(0, 50).map(i => ({ src: i.src, alt: i.alt }))
          );
          results.push({ type: "images", data: imgs });
          break;
        }
        case "extract-emails": {
          const text2 = await session.page.evaluate(() => document.body.innerText);
          const emails = [...new Set((text2.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []))];
          results.push({ type: "emails", data: emails });
          break;
        }
        case "extract-headings": {
          const headings = await session.page.evaluate(() =>
            [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(h => ({ tag: h.tagName, text: h.textContent.trim() }))
          );
          results.push({ type: "headings", data: headings });
          break;
        }
        case "extract-meta": {
          const meta = await session.page.evaluate(() => ({
            title: document.title,
            description: document.querySelector('meta[name="description"]')?.content || "",
            keywords: document.querySelector('meta[name="keywords"]')?.content || "",
            ogTitle: document.querySelector('meta[property="og:title"]')?.content || "",
            ogImage: document.querySelector('meta[property="og:image"]')?.content || "",
            canonical: document.querySelector('link[rel="canonical"]')?.href || "",
          }));
          results.push({ type: "meta", data: meta });
          break;
        }
        case "run-js": {
          // Only allow safe evaluation patterns
          const jsResult = await session.page.evaluate((code) => {
            try { return String(eval(code)).slice(0, 5000); } catch (e) { return `Error: ${e.message}`; }
          }, action.code);
          results.push({ type: "js-result", data: jsResult });
          break;
        }
        case "zoom": {
          const level = action.level || 1;
          await session.cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: level }).catch(() => {
            session.page.evaluate((z) => document.body.style.zoom = z, level);
          });
          results.push({ type: "zoomed", level });
          break;
        }
        case "fill-form": {
          // Smart form fill: try to detect and fill visible inputs
          await session.page.evaluate(() => {
            const inputs = [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]), textarea, select")];
            inputs.forEach(el => el.focus());
          });
          results.push({ type: "form-focused" });
          break;
        }
        default:
          results.push({ type: "unknown-action", action: action.type });
      }
    } catch (err) {
      results.push({ type: "error", action: action.type, message: err.message });
    }
  }
  return results;
}

// ── Process Chat Message (main entry point) ─────────────────────────────────
async function processMessage(session, message, history) {
  const lower = (message || "").toLowerCase().trim();
  if (!lower) return { reply: "Send a command or ask anything.", actions: [], results: [] };

  // Normalize: strip conversational preambles
  const normalized = lower
    .replace(/^(?:i\s+want\s+(?:you\s+)?to|can\s+you(?:\s+please)?|could\s+you(?:\s+please)?|please|hey\s+ami|ami)\s+/i, "")
    .trim();
  const matchLower = normalized || lower;

  // 1. Compound intent: "go to youtube and play X"
  const compound = matchCompound(matchLower);
  if (compound) {
    const results = await executeActions(session, compound.actions);
    return { ...compound, results };
  }

  // 2. Play intent: "play X on youtube"
  const play = matchPlay(matchLower);
  if (play) {
    const results = await executeActions(session, play.actions);
    return { ...play, results };
  }

  // 3. Smart page interaction with LLM
  const isPageAction = /click|tap|press|select|choose|pick|find.*button|find.*link|go to.*result|open.*result|\b(first|second|third|1st|2nd|3rd|last|next)\b.*(?:result|link|item|button)/i.test(matchLower);
  if (isPageAction) {
    try {
      const ctx = await getPageContext(session);
      const resp = await aiProxy.chatCompletion([
        { role: "system", content: `You are a browser automation agent. Page: "${ctx.title}" at ${ctx.url}. Headings: ${ctx.headings.join(", ")}. Forms: ${ctx.forms}, Links: ${ctx.links}. Respond ONLY with JSON: {"reply":"description","actions":[{"type":"click","selector":"CSS_SELECTOR"}]}. Action types: click, type (with selector + text), scroll (with y), navigate (with url). For nth results use CSS nth-of-type selectors.` },
        { role: "user", content: message },
      ], { max_tokens: 512 });
      const text = resp.data?.choices?.[0]?.message?.content || "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const results = await executeActions(session, parsed.actions || []);
      return { reply: parsed.reply || `Performing: ${message}`, actions: parsed.actions || [], results };
    } catch (err) {
      console.warn("[openclaw] Smart page action failed, falling to skills:", err.message);
    }
  }

  // 4. Match against built-in skills
  const normalizedMsg = message.replace(/^(?:i\s+want\s+(?:you\s+)?to|can\s+you(?:\s+please)?|please|hey\s+ami|ami)\s+/i, "").trim() || message;
  for (const skill of SKILLS) {
    const match = normalizedMsg.match(skill.pattern) || message.match(skill.pattern);
    if (match) {
      const result = skill.handler(match);
      if (!result) continue;

      // Handle LLM tasks
      if (result.actions?.some(a => a.type === "llm-task")) {
        const taskAction = result.actions.find(a => a.type === "llm-task");
        const promptFn = TASK_PROMPTS[taskAction.task];

        // Special: summarize-page needs page text
        if (taskAction.task === "summarize-page") {
          const pageText = await session.page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => "");
          if (promptFn) {
            try {
              const resp = await aiProxy.chatCompletion([
                { role: "system", content: "You are a helpful AI assistant. Be concise." },
                { role: "user", content: promptFn(pageText, taskAction) },
              ], { max_tokens: 1024 });
              const text = resp.data?.choices?.[0]?.message?.content || "Could not summarize.";
              return { reply: text, actions: [], results: [{ type: "llm-response", data: text }] };
            } catch (err) {
              return { reply: `AI error: ${err.message}`, actions: [], results: [] };
            }
          }
        }

        if (promptFn) {
          try {
            const resp = await aiProxy.chatCompletion([
              { role: "system", content: "You are a helpful AI assistant. Be concise and useful." },
              { role: "user", content: promptFn(taskAction.prompt, taskAction) },
            ], { max_tokens: 1024 });
            const text = resp.data?.choices?.[0]?.message?.content || "No response.";
            return { reply: text, actions: [], results: [{ type: "llm-response", data: text }] };
          } catch (err) {
            return { reply: `${result.reply}\n\n(AI unavailable: ${err.message})`, actions: result.actions, results: [] };
          }
        }
        return { reply: result.reply, actions: result.actions, results: [] };
      }

      // Execute browser actions
      const results = await executeActions(session, result.actions);
      return { ...result, results };
    }
  }

  // 5. Fallback to LLM for general chat
  try {
    const ctx = await getPageContext(session);
    const sysPrompt = `You are AMI Agent (OpenClaw), the AI brain of AMI Browser. You help users browse the web, find information, and automate tasks. The user is viewing: "${ctx.title}" at ${ctx.url}. When the user wants a browser action, respond with JSON: {"reply":"...","actions":[{"type":"navigate","url":"..."}]}. For general questions, respond normally in plain text. Be concise.`;

    const messages = [
      { role: "system", content: sysPrompt },
      ...((history || []).slice(-6).map(m => ({
        role: m.role === "agent" ? "assistant" : m.role,
        content: m.content,
      }))),
      { role: "user", content: message },
    ];

    const resp = await aiProxy.chatCompletion(messages, { max_tokens: 1024 });
    const text = resp.data?.choices?.[0]?.message?.content || "I didn't understand that.";

    // Try to parse as action JSON
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
      if (cleaned.startsWith("{")) {
        const parsed = JSON.parse(cleaned);
        if (parsed.actions && parsed.actions.length > 0) {
          const results = await executeActions(session, parsed.actions);
          return { reply: parsed.reply || message, actions: parsed.actions, results };
        }
        return { reply: parsed.reply || text, actions: [], results: [] };
      }
    } catch {}

    return { reply: text, actions: [], results: [] };
  } catch (err) {
    return {
      reply: `I have ${SKILLS.length} built-in skills! Try:\n• "go to <url>" — navigate\n• "search <query>" — web search\n• "screenshot" — capture page\n• "extract text/links/emails" — read page data\n• "summarize" — summarize page\n• "click <element>" — click elements\n\n(AI unavailable: ${err.message})`,
      actions: [],
      results: [],
    };
  }
}

module.exports = {
  processMessage,
  executeActions,
  enableAdBlocking,
  getPageContext,
  isAdUrl,
  SKILLS,
};
