/* ═══════════════════════════════════════════════════════════════
   OpenClaw Agent — Server-side browser automation AI for AMI iOS
   216+ built-in skills, ad blocking, LLM fallback, action execution
   Synced from V3 gateway.js verified skills registry
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');

// ── Ad blocking ─────────────────────────────────────────────────────────────
const AD_DOMAINS = new Set([
  'doubleclick.net','googlesyndication.com','googleadservices.com','google-analytics.com',
  'adservice.google.com','pagead2.googlesyndication.com','tpc.googlesyndication.com',
  'fundingchoicesmessages.google.com','adnxs.com','adsrvr.org','criteo.com','criteo.net',
  'taboola.com','outbrain.com','amazon-adsystem.com','facebook.net','connect.facebook.net',
  'ads-twitter.com','analytics.twitter.com','ads.linkedin.com','snap.licdn.com',
  'scorecardresearch.com','quantserve.com','adsymptotic.com','adform.net',
  'bidswitch.net','casalemedia.com','demdex.net','dotomi.com','everesttech.net',
  'eyeota.net','mathtag.com','mookie1.com','openx.net','pubmatic.com',
  'rlcdn.com','rubiconproject.com','sharethis.com','simpli.fi','smartadserver.com',
  'turn.com','yahooapis.com','moatads.com','serving-sys.com','2mdn.net',
]);
const AD_URL_PATTERNS = [
  /\/ads?\//i,/\/adserv/i,/\/ad[_-]?banner/i,/\/ad[_-]?click/i,
  /\/sponsor/i,/\/pixel\?/i,/\/tracking\?/i,/\.gif\?.*click/i,
  /\/pagead\//i,/\/adsense/i,/doubleclick/i,/googlesyndication/i,
];

function isAdUrl(url) {
  try {
    const u = new URL(url);
    if (AD_DOMAINS.has(u.hostname) || [...AD_DOMAINS].some(d => u.hostname.endsWith('.' + d))) return true;
    return AD_URL_PATTERNS.some(p => p.test(url));
  } catch { return false; }
}

async function enableAdBlocking(cdp) {
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.setRequestInterception', {
      patterns: [{ urlPattern: '*', resourceType: 'Script' }, { urlPattern: '*', resourceType: 'Image' }, { urlPattern: '*', resourceType: 'Stylesheet' }, { urlPattern: '*', resourceType: 'XHR' }],
    });
    cdp.on('Network.requestIntercepted', ({ interceptionId, request }) => {
      if (isAdUrl(request.url)) {
        cdp.send('Network.continueInterceptedRequest', { interceptionId, errorReason: 'Aborted' }).catch(() => {});
      } else {
        cdp.send('Network.continueInterceptedRequest', { interceptionId }).catch(() => {});
      }
    });
  } catch {}
}

// ── Page context extraction ─────────────────────────────────────────────────
async function getPageContext(session) {
  if (!session?.page) return {};
  try {
    return await session.page.evaluate(() => ({
      title: document.title,
      url: location.href,
      headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 10).map(h => h.textContent.trim()),
      forms: document.querySelectorAll('form').length,
      links: document.querySelectorAll('a[href]').length,
      selected: window.getSelection?.()?.toString() || '',
    }));
  } catch { return {}; }
}

// ══════════════════════════════════════════════════════════════════════════════
// 210+ Built-in Skills Registry (synced from V2 gateway.js)
// ══════════════════════════════════════════════════════════════════════════════
const SKILLS = [
  // ─── Navigation & Browsing (15) ───
  { id: 'navigate', cat: 'Navigation', pattern: /^(?:go to|open|navigate to?|visit|browse)\s+(?!.*\b(?:and|then)\b.*(?:play|search|watch|type|click|fill|find|do))(.+)/i, desc: 'Navigate to a URL or website', handler: (m) => { let url = m[1].trim(); if (!url.startsWith('http')) url = `https://${url}`; return { reply: `Navigating to ${url}`, actions: [{ type: 'navigate', url }] }; } },
  { id: 'search-web', cat: 'Navigation', pattern: /^(?:search|google|look up|find on web|web search)\s+(.+)/i, desc: 'Search the web for a query', handler: (m) => ({ reply: `Searching: ${m[1]}`, actions: [{ type: 'navigate', url: `https://duckduckgo.com/?q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-youtube', cat: 'Navigation', pattern: /^(?:youtube|search youtube|find video|watch)\s+(.+)/i, desc: 'Search YouTube for videos', handler: (m) => ({ reply: `Searching YouTube: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(m[1])}`, followUp: [{ type: 'dismiss-cookies', delay: 1500 }, { type: 'click', selector: 'first result', delay: 3000 }] }] }) },
  { id: 'search-spotify', cat: 'Navigation', pattern: /^(?:spotify|search spotify|find song|find music)\s+(.+)/i, desc: 'Search Spotify for music', handler: (m) => ({ reply: `Searching Spotify: ${m[1]}`, actions: [{ type: 'navigate', url: `https://open.spotify.com/search/${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-soundcloud', cat: 'Navigation', pattern: /^(?:soundcloud|search soundcloud)\s+(.+)/i, desc: 'Search SoundCloud', handler: (m) => ({ reply: `Searching SoundCloud: ${m[1]}`, actions: [{ type: 'navigate', url: `https://soundcloud.com/search?q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-amazon', cat: 'Navigation', pattern: /^(?:amazon|search amazon|shop|buy)\s+(.+)/i, desc: 'Search Amazon for products', handler: (m) => ({ reply: `Searching Amazon: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.amazon.com/s?k=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-stackoverflow', cat: 'Navigation', pattern: /^(?:stackoverflow|stack overflow|search stackoverflow)\s+(.+)/i, desc: 'Search Stack Overflow', handler: (m) => ({ reply: `Searching Stack Overflow: ${m[1]}`, actions: [{ type: 'navigate', url: `https://stackoverflow.com/search?q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-npm', cat: 'Navigation', pattern: /^(?:npm search|search npm|find package)\s+(.+)/i, desc: 'Search npm packages', handler: (m) => ({ reply: `Searching npm: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.npmjs.com/search?q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-twitch', cat: 'Navigation', pattern: /^(?:twitch|search twitch|find stream)\s+(.+)/i, desc: 'Search Twitch', handler: (m) => ({ reply: `Searching Twitch: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.twitch.tv/search?term=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-netflix', cat: 'Navigation', pattern: /^(?:netflix|search netflix)\s+(.+)/i, desc: 'Search Netflix', handler: (m) => ({ reply: `Searching Netflix: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.netflix.com/search?q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-github', cat: 'Navigation', pattern: /^(?:github search|search github|find repo|find repository)\s+(.+)/i, desc: 'Search GitHub for repositories', handler: (m) => ({ reply: `Searching GitHub: ${m[1]}`, actions: [{ type: 'navigate', url: `https://github.com/search?q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-reddit', cat: 'Navigation', pattern: /^(?:reddit search|search reddit)\s+(.+)/i, desc: 'Search Reddit', handler: (m) => ({ reply: `Searching Reddit: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.reddit.com/search/?q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-twitter', cat: 'Navigation', pattern: /^(?:twitter search|search twitter|search x|x search)\s+(.+)/i, desc: 'Search Twitter/X', handler: (m) => ({ reply: `Searching X: ${m[1]}`, actions: [{ type: 'navigate', url: `https://x.com/search?q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-maps', cat: 'Navigation', pattern: /^(?:map|maps|directions|find location|locate)\s+(.+)/i, desc: 'Search Google Maps', handler: (m) => ({ reply: `Opening Maps: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/maps/search/${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-images', cat: 'Navigation', pattern: /^(?:image search|search images|find images?)\s+(.+)/i, desc: 'Search Google Images', handler: (m) => ({ reply: `Searching images: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(m[1])}` }] }) },
  { id: 'search-news', cat: 'Navigation', pattern: /^(?:news|search news|latest news|headlines)\s*(.+)?/i, desc: 'Search Google News', handler: (m) => ({ reply: `Searching news: ${m[1] || 'latest'}`, actions: [{ type: 'navigate', url: `https://news.google.com/search?q=${encodeURIComponent(m[1] || 'latest')}` }] }) },
  { id: 'search-wikipedia', cat: 'Navigation', pattern: /^(?:wiki|wikipedia)\s+(.+)/i, desc: 'Search Wikipedia', handler: (m) => ({ reply: `Searching Wikipedia: ${m[1]}`, actions: [{ type: 'navigate', url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(m[1])}` }] }) },
  { id: 'new-tab', cat: 'Navigation', pattern: /^(?:new tab|open tab)/i, desc: 'Open a new tab', handler: () => ({ reply: 'Opening new tab', actions: [{ type: 'new-tab' }] }) },
  { id: 'close-tab', cat: 'Navigation', pattern: /^(?:close tab|close this tab)/i, desc: 'Close current tab', handler: () => ({ reply: 'Closing tab', actions: [{ type: 'close-tab' }] }) },
  { id: 'go-back', cat: 'Navigation', pattern: /^(?:go back|back|previous page)/i, desc: 'Go to previous page', handler: () => ({ reply: 'Going back', actions: [{ type: 'go-back' }] }) },
  { id: 'go-forward', cat: 'Navigation', pattern: /^(?:go forward|forward|next page)/i, desc: 'Go to next page', handler: () => ({ reply: 'Going forward', actions: [{ type: 'go-forward' }] }) },
  { id: 'reload', cat: 'Navigation', pattern: /^(?:reload|refresh|refresh page)/i, desc: 'Reload current page', handler: () => ({ reply: 'Reloading page', actions: [{ type: 'reload' }] }) },

  // ─── Page Interaction (12) ───
  { id: 'click', cat: 'Interaction', pattern: /^click\s+(?:on\s+)?["']?(.+?)["']?\s*$/i, desc: 'Click an element on the page', handler: (m) => ({ reply: `Clicking: ${m[1]}`, actions: [{ type: 'click', selector: m[1] }] }) },
  { id: 'type', cat: 'Interaction', pattern: /^type\s+["'](.+?)["']\s+(?:in|into)\s+["']?(.+?)["']?\s*$/i, desc: 'Type text into an input field', handler: (m) => ({ reply: `Typing "${m[1]}" into ${m[2]}`, actions: [{ type: 'type', text: m[1], selector: m[2] }] }) },
  { id: 'scroll-down', cat: 'Interaction', pattern: /^scroll\s+down/i, desc: 'Scroll the page down', handler: () => ({ reply: 'Scrolling down', actions: [{ type: 'scroll', y: 500 }] }) },
  { id: 'scroll-up', cat: 'Interaction', pattern: /^scroll\s+up/i, desc: 'Scrolling up', handler: () => ({ reply: 'Scrolling up', actions: [{ type: 'scroll', y: -500 }] }) },
  { id: 'scroll-top', cat: 'Interaction', pattern: /^scroll\s+(?:to\s+)?top/i, desc: 'Scroll to top of page', handler: () => ({ reply: 'Scrolling to top', actions: [{ type: 'scroll-to', y: 0 }] }) },
  { id: 'scroll-bottom', cat: 'Interaction', pattern: /^scroll\s+(?:to\s+)?bottom/i, desc: 'Scroll to bottom of page', handler: () => ({ reply: 'Scrolling to bottom', actions: [{ type: 'scroll-to', y: 99999 }] }) },
  { id: 'select-option', cat: 'Interaction', pattern: /^select\s+["'](.+?)["']\s+(?:in|from)\s+["']?(.+?)["']?\s*$/i, desc: 'Select an option from a dropdown', handler: (m) => ({ reply: `Selecting "${m[1]}" from ${m[2]}`, actions: [{ type: 'select', value: m[1], selector: m[2] }] }) },
  { id: 'check-box', cat: 'Interaction', pattern: /^(?:check|tick|enable)\s+["']?(.+?)["']?\s*$/i, desc: 'Check a checkbox', handler: (m) => ({ reply: `Checking: ${m[1]}`, actions: [{ type: 'check', selector: m[1] }] }) },
  { id: 'uncheck-box', cat: 'Interaction', pattern: /^(?:uncheck|untick|disable)\s+["']?(.+?)["']?\s*$/i, desc: 'Uncheck a checkbox', handler: (m) => ({ reply: `Unchecking: ${m[1]}`, actions: [{ type: 'uncheck', selector: m[1] }] }) },
  { id: 'hover', cat: 'Interaction', pattern: /^hover\s+(?:over\s+)?["']?(.+?)["']?\s*$/i, desc: 'Hover over an element', handler: (m) => ({ reply: `Hovering over: ${m[1]}`, actions: [{ type: 'hover', selector: m[1] }] }) },
  { id: 'focus', cat: 'Interaction', pattern: /^focus\s+(?:on\s+)?["']?(.+?)["']?\s*$/i, desc: 'Focus an input element', handler: (m) => ({ reply: `Focusing: ${m[1]}`, actions: [{ type: 'focus', selector: m[1] }] }) },
  { id: 'submit-form', cat: 'Interaction', pattern: /^(?:submit form|submit|press enter|hit enter)/i, desc: 'Submit the current form', handler: () => ({ reply: 'Submitting form', actions: [{ type: 'submit' }] }) },

  // ─── Data Extraction (15) ───
  { id: 'extract-text', cat: 'Extraction', pattern: /^(?:extract text|get text|read page|read text|get page text|page content)/i, desc: 'Extract all text from the current page', handler: () => ({ reply: 'Extracting page text…', actions: [{ type: 'extract-text' }] }) },
  { id: 'extract-links', cat: 'Extraction', pattern: /^(?:extract links|get links|find links|list links|all links)/i, desc: 'Extract all links from the page', handler: () => ({ reply: 'Extracting all links…', actions: [{ type: 'extract-links' }] }) },
  { id: 'extract-images', cat: 'Extraction', pattern: /^(?:extract images|get images|find images|list images|all images)/i, desc: 'Extract all image URLs from the page', handler: () => ({ reply: 'Extracting images…', actions: [{ type: 'extract-images' }] }) },
  { id: 'extract-emails', cat: 'Extraction', pattern: /^(?:extract emails?|find emails?|get emails?|scrape emails?)/i, desc: 'Find email addresses on the page', handler: () => ({ reply: 'Extracting email addresses…', actions: [{ type: 'extract-emails' }] }) },
  { id: 'extract-phones', cat: 'Extraction', pattern: /^(?:extract phones?|find phones?|get phone numbers?)/i, desc: 'Find phone numbers on the page', handler: () => ({ reply: 'Extracting phone numbers…', actions: [{ type: 'extract-phones' }] }) },
  { id: 'extract-table', cat: 'Extraction', pattern: /^(?:extract table|scrape table|get table|read table)/i, desc: 'Extract table data from the page', handler: () => ({ reply: 'Extracting table data…', actions: [{ type: 'extract-table' }] }) },
  { id: 'extract-headings', cat: 'Extraction', pattern: /^(?:extract headings?|get headings?|list headings?|page outline)/i, desc: 'Extract headings (H1-H6) from the page', handler: () => ({ reply: 'Extracting headings…', actions: [{ type: 'extract-headings' }] }) },
  { id: 'extract-meta', cat: 'Extraction', pattern: /^(?:extract meta|get meta|page meta|metadata)/i, desc: 'Extract page metadata (title, description, etc.)', handler: () => ({ reply: 'Extracting page metadata…', actions: [{ type: 'extract-meta' }] }) },
  { id: 'extract-prices', cat: 'Extraction', pattern: /^(?:extract prices?|find prices?|get prices?|scrape prices?)/i, desc: 'Find prices on the page', handler: () => ({ reply: 'Extracting prices…', actions: [{ type: 'extract-prices' }] }) },
  { id: 'extract-structured', cat: 'Extraction', pattern: /^(?:extract data|structured data|extract json|scrape data)\s*(.+)?/i, desc: 'Extract structured data from the page', handler: (m) => ({ reply: `Extracting structured data${m[1] ? ': ' + m[1] : ''}…`, actions: [{ type: 'extract-structured', query: m[1] || '' }] }) },
  { id: 'extract-selected', cat: 'Extraction', pattern: /^(?:get selection|selected text|read selection|what.?s selected)/i, desc: 'Get the currently selected text', handler: () => ({ reply: 'Reading selected text…', actions: [{ type: 'extract-selected' }] }) },
  { id: 'summarize-page', cat: 'Extraction', pattern: /^(?:summarize|summarise|summary|tldr|tl;dr)\s*(?:this page|page|this)?\s*$/i, desc: 'Summarize the current page content', handler: () => ({ reply: 'Summarizing page content…', actions: [{ type: 'summarize-page' }] }) },
  { id: 'extract-forms', cat: 'Extraction', pattern: /^(?:extract forms?|find forms?|list forms?|get forms?)/i, desc: 'List all forms on the page', handler: () => ({ reply: 'Extracting form data…', actions: [{ type: 'extract-forms' }] }) },
  { id: 'count-elements', cat: 'Extraction', pattern: /^(?:count)\s+["']?(.+?)["']?\s*$/i, desc: 'Count elements matching a selector', handler: (m) => ({ reply: `Counting "${m[1]}" elements…`, actions: [{ type: 'count-elements', selector: m[1] }] }) },
  { id: 'read-attribute', cat: 'Extraction', pattern: /^(?:get attribute|read attribute)\s+["'](.+?)["']\s+(?:of|from)\s+["']?(.+?)["']?\s*$/i, desc: 'Read an attribute from an element', handler: (m) => ({ reply: `Reading "${m[1]}" from ${m[2]}…`, actions: [{ type: 'read-attribute', attr: m[1], selector: m[2] }] }) },

  // ─── Screenshot & Visual (6) ───
  { id: 'screenshot', cat: 'Visual', pattern: /^(?:screenshot|capture|snap|take screenshot)/i, desc: 'Take a screenshot of the visible page', handler: () => ({ reply: 'Taking screenshot…', actions: [{ type: 'screenshot' }] }) },
  { id: 'screenshot-element', cat: 'Visual', pattern: /^screenshot\s+(?:element|of)\s+["']?(.+?)["']?\s*$/i, desc: 'Screenshot a specific element', handler: (m) => ({ reply: `Screenshotting element: ${m[1]}`, actions: [{ type: 'screenshot-element', selector: m[1] }] }) },
  { id: 'highlight', cat: 'Visual', pattern: /^highlight\s+["']?(.+?)["']?\s*$/i, desc: 'Highlight an element on the page', handler: (m) => ({ reply: `Highlighting: ${m[1]}`, actions: [{ type: 'highlight', selector: m[1] }] }) },
  { id: 'inspect-element', cat: 'Visual', pattern: /^inspect\s+["']?(.+?)["']?\s*$/i, desc: 'Inspect a DOM element', handler: (m) => ({ reply: `Inspecting: ${m[1]}`, actions: [{ type: 'inspect', selector: m[1] }] }) },
  { id: 'zoom-in', cat: 'Visual', pattern: /^zoom\s+in/i, desc: 'Zoom in on the page', handler: () => ({ reply: 'Zooming in', actions: [{ type: 'zoom', level: 1.25 }] }) },
  { id: 'zoom-out', cat: 'Visual', pattern: /^zoom\s+out/i, desc: 'Zoom out on the page', handler: () => ({ reply: 'Zooming out', actions: [{ type: 'zoom', level: 0.8 }] }) },

  // ─── Form Prefilling (6) ───
  { id: 'fill-days-of-week', cat: 'Forms', pattern: /(?:fill|populate|add|put|enter|write|type).*(?:days?\s+of\s+(?:the\s+)?week|all\s+(?:seven\s+)?days|weekdays?\s+and\s+weekend)/i, desc: 'Fill all 7 days of the week into spreadsheet cells', handler: () => ({ reply: 'Filling days of the week…', actions: [{ type: 'spreadsheet-fill-values', values: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] }] }) },
  { id: 'fill-working-days', cat: 'Forms', pattern: /(?:fill|populate|add|put|enter|write|type).*(?:working\s+days?|weekdays?(?!\s+and))\b/i, desc: 'Fill working days (Mon–Fri) into spreadsheet cells', handler: () => ({ reply: 'Filling working days…', actions: [{ type: 'spreadsheet-fill-values', values: ['Monday','Tuesday','Wednesday','Thursday','Friday'] }] }) },
  { id: 'fill-months', cat: 'Forms', pattern: /(?:fill|populate|add|put|enter|write|type).*(?:all\s+)?(?:(?:12|twelve)\s+)?months?\b/i, desc: 'Fill all 12 months into spreadsheet cells', handler: () => ({ reply: 'Filling months of the year…', actions: [{ type: 'spreadsheet-fill-values', values: ['January','February','March','April','May','June','July','August','September','October','November','December'] }] }) },
  { id: 'fill-numbers', cat: 'Forms', pattern: /(?:fill|populate|add|put|enter|write|type).*numbers?\s+(?:from\s+)?(\d+)\s+(?:to|through|until|-)\s+(\d+)/i, desc: 'Fill a numeric range into spreadsheet cells', handler: (m) => { const a=parseInt(m[1],10),b=parseInt(m[2],10); if(isNaN(a)||isNaN(b)||Math.abs(b-a)>5000) return null; const vals=[]; for(let i=Math.min(a,b);i<=Math.max(a,b);i++) vals.push(i); return { reply: `Filling numbers ${a}–${b}…`, actions: [{ type: 'spreadsheet-fill-values', values: vals }] }; } },
  { id: 'spreadsheet-fill-dates', cat: 'Forms', pattern: /^(?:fill|complete|populate)\s+(?:this\s+)?(?:table|sheet|spreadsheet|google\s*sheet|google\s*sheets|excel)(?:\s+with\s+dates?)?\s+from\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\-]\d{1,2}[\-]\d{1,2})\s+(?:to|until|through|-)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\-]\d{1,2}[\-]\d{1,2})\s*$/i, desc: 'Fill spreadsheet cells with an inclusive date range', handler: (m) => ({ reply: `Filling spreadsheet dates from ${m[1]} to ${m[2]}…`, actions: [{ type: 'spreadsheet-fill-dates', startDate: m[1], endDate: m[2] }] }) },
  { id: 'spreadsheet-dates-short', cat: 'Forms', pattern: /^(?:dates?|fill\s+dates?)\s+from\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\-]\d{1,2}[\-]\d{1,2})\s+(?:to|until|through|-)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\-]\d{1,2}[\-]\d{1,2})\s*$/i, desc: 'Fill date range in current spreadsheet selection', handler: (m) => ({ reply: `Filling dates from ${m[1]} to ${m[2]}…`, actions: [{ type: 'spreadsheet-fill-dates', startDate: m[1], endDate: m[2] }] }) },
  { id: 'fill-form', cat: 'Forms', pattern: /^(?:fill form|fill in|auto-?fill|prefill)\s*(.+)?/i, desc: 'Auto-fill a form using context or scraped data', handler: (m) => ({ reply: `Auto-filling form${m[1] ? ' with: ' + m[1] : ''}…`, actions: [{ type: 'fill-form', data: m[1] || '' }] }) },
  { id: 'fill-field', cat: 'Forms', pattern: /^(?:fill|set)\s+["']?(.+?)["']?\s+(?:to|with|as)\s+["'](.+?)["']/i, desc: 'Fill a specific field with a value', handler: (m) => ({ reply: `Setting ${m[1]} to "${m[2]}"`, actions: [{ type: 'type', selector: m[1], text: m[2] }] }) },
  { id: 'clear-field', cat: 'Forms', pattern: /^clear\s+["']?(.+?)["']?\s*$/i, desc: 'Clear an input field', handler: (m) => ({ reply: `Clearing: ${m[1]}`, actions: [{ type: 'clear', selector: m[1] }] }) },
  { id: 'clear-form', cat: 'Forms', pattern: /^(?:clear form|reset form)/i, desc: 'Clear/reset the current form', handler: () => ({ reply: 'Clearing form', actions: [{ type: 'clear-form' }] }) },
  { id: 'upload-file', cat: 'Forms', pattern: /^(?:upload|attach file)\s+["']?(.+?)["']?\s*$/i, desc: 'Upload a file to an input', handler: (m) => ({ reply: `Uploading: ${m[1]}`, actions: [{ type: 'upload-file', file: m[1] }] }) },
  { id: 'prefill-from-data', cat: 'Forms', pattern: /^(?:prefill from|use data from|import data)\s+(.+)/i, desc: 'Prefill form from previously extracted data', handler: (m) => ({ reply: `Prefilling form from ${m[1]}…`, actions: [{ type: 'prefill-from-data', source: m[1] }] }) },

  // ─── Content Creation (12) ───
  { id: 'write-email', cat: 'Content', pattern: /^(?:write|draft|compose)\s+(?:an?\s+)?email\s+(?:to\s+)?(.+)/i, desc: 'Draft an email', handler: (m) => ({ reply: `Drafting email: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'write-email', prompt: m[1] }] }) },
  { id: 'write-tweet', cat: 'Content', pattern: /^(?:write|draft|compose)\s+(?:a\s+)?(?:tweet|post|thread)\s+(?:about\s+)?(.+)/i, desc: 'Draft a tweet or social post', handler: (m) => ({ reply: `Drafting post: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'write-post', prompt: m[1] }] }) },
  { id: 'write-summary', cat: 'Content', pattern: /^(?:write|create)\s+(?:a\s+)?summary\s+(?:of\s+)?(.+)/i, desc: 'Write a summary of given content', handler: (m) => ({ reply: `Summarizing: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'summarize', prompt: m[1] }] }) },
  { id: 'translate', cat: 'Content', pattern: /^translate\s+(.+?)\s+(?:to|into)\s+(\w+)/i, desc: 'Translate text to another language', handler: (m) => ({ reply: `Translating to ${m[2]}…`, actions: [{ type: 'llm-task', task: 'translate', prompt: m[1], lang: m[2] }] }) },
  { id: 'rewrite', cat: 'Content', pattern: /^(?:rewrite|rephrase|paraphrase)\s+(.+)/i, desc: 'Rewrite or paraphrase text', handler: (m) => ({ reply: 'Rewriting text…', actions: [{ type: 'llm-task', task: 'rewrite', prompt: m[1] }] }) },
  { id: 'expand-text', cat: 'Content', pattern: /^expand\s+(.+)/i, desc: 'Expand/elaborate on text', handler: (m) => ({ reply: 'Expanding text…', actions: [{ type: 'llm-task', task: 'expand', prompt: m[1] }] }) },
  { id: 'shorten-text', cat: 'Content', pattern: /^(?:shorten|condense|make shorter)\s+(.+)/i, desc: 'Shorten text', handler: (m) => ({ reply: 'Shortening text…', actions: [{ type: 'llm-task', task: 'shorten', prompt: m[1] }] }) },
  { id: 'proofread', cat: 'Content', pattern: /^(?:proofread|spellcheck|grammar check|fix grammar)\s+(.+)/i, desc: 'Proofread and fix grammar', handler: (m) => ({ reply: 'Proofreading…', actions: [{ type: 'llm-task', task: 'proofread', prompt: m[1] }] }) },
  { id: 'generate-ideas', cat: 'Content', pattern: /^(?:brainstorm|ideas?|generate ideas?)\s+(?:for\s+)?(.+)/i, desc: 'Generate creative ideas', handler: (m) => ({ reply: `Brainstorming ideas: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'brainstorm', prompt: m[1] }] }) },
  { id: 'write-code', cat: 'Content', pattern: /^(?:write code|code|generate code|programming)\s+(?:for\s+|to\s+)?(.+)/i, desc: 'Generate code for a task', handler: (m) => ({ reply: `Writing code: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'write-code', prompt: m[1] }] }) },
  { id: 'explain-code', cat: 'Content', pattern: /^(?:explain code|explain this code|what does this code do)\s*(.+)?/i, desc: 'Explain a code snippet', handler: (m) => ({ reply: 'Explaining code…', actions: [{ type: 'llm-task', task: 'explain-code', prompt: m[1] || '' }] }) },
  { id: 'write-regex', cat: 'Content', pattern: /^(?:regex|write regex|generate regex|regular expression)\s+(?:for\s+)?(.+)/i, desc: 'Generate a regular expression', handler: (m) => ({ reply: `Generating regex for: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'write-regex', prompt: m[1] }] }) },

  // ─── Research & Analysis (14) ───
  { id: 'compare', cat: 'Research', pattern: /^compare\s+(.+)/i, desc: 'Compare products, services, or topics', handler: (m) => ({ reply: `Comparing: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'compare', prompt: m[1] }] }) },
  { id: 'find-reviews', cat: 'Research', pattern: /^(?:find reviews?|reviews? for|check reviews?)\s+(.+)/i, desc: 'Find reviews for a product or service', handler: (m) => ({ reply: `Finding reviews: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(m[1] + ' reviews')}` }] }) },
  { id: 'analyze-sentiment', cat: 'Research', pattern: /^(?:sentiment|analyze sentiment|mood)\s+(.+)/i, desc: 'Analyze sentiment of text', handler: (m) => ({ reply: 'Analyzing sentiment…', actions: [{ type: 'llm-task', task: 'sentiment', prompt: m[1] }] }) },
  { id: 'fact-check', cat: 'Research', pattern: /^(?:fact check|verify|is it true)\s+(.+)/i, desc: 'Fact-check a claim', handler: (m) => ({ reply: `Fact-checking: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'fact-check', prompt: m[1] }] }) },
  { id: 'find-contacts', cat: 'Research', pattern: /^(?:find contacts?|get contact|contact info)\s+(?:for\s+)?(.+)/i, desc: 'Find contact information', handler: (m) => ({ reply: `Finding contacts for: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(m[1] + ' contact information')}` }] }) },
  { id: 'find-deals', cat: 'Research', pattern: /^(?:find deals?|coupons?|discounts?|promo codes?)\s+(?:for\s+)?(.+)/i, desc: 'Find deals and coupons', handler: (m) => ({ reply: `Finding deals: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(m[1] + ' coupon code deals')}` }] }) },
  { id: 'find-alternatives', cat: 'Research', pattern: /^(?:alternatives?\s+to|find alternatives?)\s+(.+)/i, desc: 'Find alternatives to a product or service', handler: (m) => ({ reply: `Finding alternatives to ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent('alternatives to ' + m[1])}` }] }) },
  { id: 'research-topic', cat: 'Research', pattern: /^(?:research|deep dive|learn about|study)\s+(.+)/i, desc: 'Deep research on a topic', handler: (m) => ({ reply: `Researching: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'research', prompt: m[1] }] }) },
  { id: 'competitor-analysis', cat: 'Research', pattern: /^(?:competitor analysis|competitive analysis|analyze competitors?)\s+(?:for\s+)?(.+)/i, desc: 'Analyze competitors', handler: (m) => ({ reply: `Analyzing competitors: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'competitor-analysis', prompt: m[1] }] }) },
  { id: 'market-research', cat: 'Research', pattern: /^(?:market research|market analysis|market size)\s+(?:for\s+)?(.+)/i, desc: 'Market research for a topic', handler: (m) => ({ reply: `Market research: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'market-research', prompt: m[1] }] }) },
  { id: 'define', cat: 'Research', pattern: /^(?:define|meaning of|what is|what are|whats?)\s+(.+)/i, desc: 'Define a word or concept', handler: (m) => ({ reply: `Looking up: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'define', prompt: m[1] }] }) },
  { id: 'how-to', cat: 'Research', pattern: /^(?:how to|how do i|how can i)\s+(.+)/i, desc: 'Get step-by-step instructions', handler: (m) => ({ reply: `Finding how to: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'how-to', prompt: m[1] }] }) },
  { id: 'pros-cons', cat: 'Research', pattern: /^(?:pros and cons|pros cons|advantages disadvantages)\s+(?:of\s+)?(.+)/i, desc: 'List pros and cons', handler: (m) => ({ reply: `Analyzing pros and cons: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'pros-cons', prompt: m[1] }] }) },
  { id: 'explain', cat: 'Research', pattern: /^explain\s+(.+)/i, desc: 'Explain a concept simply', handler: (m) => ({ reply: `Explaining: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'explain', prompt: m[1] }] }) },

  // ─── Communication (10) ───
  { id: 'send-telegram', cat: 'Communication', pattern: /^(?:send|message)\s+(?:to\s+)?telegram\s+(.+)/i, desc: 'Send a Telegram message', handler: (m) => ({ reply: `Sending Telegram message…`, actions: [{ type: 'api-call', provider: 'telegram', method: 'POST', url: 'https://api.telegram.org/bot{key}/sendMessage', body: { text: m[1] } }] }) },
  { id: 'send-discord', cat: 'Communication', pattern: /^(?:send|message)\s+(?:to\s+)?discord\s+(.+)/i, desc: 'Send a Discord message', handler: (m) => ({ reply: `Sending Discord message…`, actions: [{ type: 'api-call', provider: 'discord', method: 'POST', body: { content: m[1] } }] }) },
  { id: 'send-slack', cat: 'Communication', pattern: /^(?:send|message)\s+(?:to\s+)?slack\s+(.+)/i, desc: 'Send a Slack message', handler: (m) => ({ reply: `Sending Slack message…`, actions: [{ type: 'api-call', provider: 'slack', method: 'POST', body: { text: m[1] } }] }) },
  { id: 'send-email-api', cat: 'Communication', pattern: /^send\s+email\s+(.+)/i, desc: 'Send an email via connected service', handler: (m) => ({ reply: `Sending email…`, actions: [{ type: 'api-call', provider: 'sendgrid', method: 'POST', body: { message: m[1] } }] }) },
  { id: 'compose-reply', cat: 'Communication', pattern: /^(?:compose|draft)\s+(?:a\s+)?reply\s+(?:to\s+)?(.+)/i, desc: 'Draft a reply message', handler: (m) => ({ reply: `Drafting reply…`, actions: [{ type: 'llm-task', task: 'compose-reply', prompt: m[1] }] }) },
  { id: 'summarize-thread', cat: 'Communication', pattern: /^summarize\s+(?:this\s+)?(?:thread|conversation|chat|discussion)/i, desc: 'Summarize a chat thread', handler: () => ({ reply: 'Summarizing conversation…', actions: [{ type: 'llm-task', task: 'summarize-thread' }] }) },
  { id: 'draft-response', cat: 'Communication', pattern: /^draft\s+(?:a\s+)?response\s+(.+)/i, desc: 'Draft a professional response', handler: (m) => ({ reply: 'Drafting response…', actions: [{ type: 'llm-task', task: 'draft-response', prompt: m[1] }] }) },
  { id: 'announce', cat: 'Communication', pattern: /^announce\s+(.+)/i, desc: 'Create an announcement', handler: (m) => ({ reply: 'Creating announcement…', actions: [{ type: 'llm-task', task: 'announce', prompt: m[1] }] }) },
  { id: 'send-webhook', cat: 'Communication', pattern: /^(?:trigger|send)\s+webhook\s+(.+)/i, desc: 'Trigger a webhook', handler: (m) => ({ reply: `Triggering webhook…`, actions: [{ type: 'api-call', provider: 'webhook', method: 'POST', body: { data: m[1] } }] }) },
  { id: 'notify', cat: 'Communication', pattern: /^notify\s+(.+)/i, desc: 'Send a notification', handler: (m) => ({ reply: `Notifying: ${m[1]}`, actions: [{ type: 'notify', message: m[1] }] }) },

  // ─── Finance & Crypto (14) ───
  { id: 'crypto-price', cat: 'Finance', pattern: /^(?:price (?:of )?|check price |what.?s the price of )(.+)/i, desc: 'Check cryptocurrency/stock price', handler: (m) => ({ reply: `Checking price: ${m[1]}…`, actions: [{ type: 'api-call', provider: 'coingecko', url: `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(m[1].toLowerCase())}&vs_currencies=usd`, method: 'GET' }] }) },
  { id: 'market-cap', cat: 'Finance', pattern: /^(?:market cap|mcap|marketcap)\s+(?:of\s+)?(.+)/i, desc: 'Check market capitalization', handler: (m) => ({ reply: `Checking market cap: ${m[1]}…`, actions: [{ type: 'api-call', provider: 'coingecko', url: `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(m[1].toLowerCase())}`, method: 'GET' }] }) },
  { id: 'trending-tokens', cat: 'Finance', pattern: /^(?:trending tokens?|trending crypto|what.?s trending|hot tokens?)/i, desc: 'Show trending cryptocurrency tokens', handler: () => ({ reply: 'Fetching trending tokens…', actions: [{ type: 'api-call', provider: 'coingecko', url: 'https://api.coingecko.com/api/v3/search/trending', method: 'GET' }] }) },
  { id: 'gas-price', cat: 'Finance', pattern: /^(?:gas price|eth gas|gas fees?)/i, desc: 'Check Ethereum gas prices', handler: () => ({ reply: 'Checking gas prices…', actions: [{ type: 'api-call', provider: 'etherscan', url: 'https://api.etherscan.io/api?module=gastracker&action=gasoracle', method: 'GET' }] }) },
  { id: 'check-wallet', cat: 'Finance', pattern: /^(?:check wallet|wallet balance|balance of)\s+(.+)/i, desc: 'Check crypto wallet balance', handler: (m) => ({ reply: `Checking wallet: ${m[1]}…`, actions: [{ type: 'api-call', provider: 'etherscan', url: `https://api.etherscan.io/api?module=account&action=balance&address=${encodeURIComponent(m[1])}&tag=latest`, method: 'GET' }] }) },
  { id: 'token-info', cat: 'Finance', pattern: /^(?:token info|about token|token details?)\s+(.+)/i, desc: 'Get token information', handler: (m) => ({ reply: `Getting token info: ${m[1]}…`, actions: [{ type: 'api-call', provider: 'coingecko', url: `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(m[1].toLowerCase())}`, method: 'GET' }] }) },
  { id: 'swap-quote', cat: 'Finance', pattern: /^(?:swap|trade|exchange)\s+(.+?)\s+(?:to|for)\s+(.+)/i, desc: 'Get a swap quote between tokens', handler: (m) => ({ reply: `Getting swap quote: ${m[1]} → ${m[2]}…`, actions: [{ type: 'api-call', provider: 'oneinch', method: 'GET' }] }) },
  { id: 'defi-portfolio', cat: 'Finance', pattern: /^(?:defi portfolio|my portfolio|portfolio)\s*(.+)?/i, desc: 'Check DeFi portfolio', handler: (m) => ({ reply: 'Checking DeFi portfolio…', actions: [{ type: 'api-call', provider: 'debank', method: 'GET' }] }) },
  { id: 'stock-price', cat: 'Finance', pattern: /^(?:stock price|stock)\s+(.+)/i, desc: 'Check stock price', handler: (m) => ({ reply: `Checking stock: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/finance/quote/${encodeURIComponent(m[1].toUpperCase())}` }] }) },
  { id: 'crypto-chart', cat: 'Finance', pattern: /^(?:chart|crypto chart|price chart)\s+(.+)/i, desc: 'View crypto price chart', handler: (m) => ({ reply: `Opening chart: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.coingecko.com/en/coins/${encodeURIComponent(m[1].toLowerCase())}` }] }) },
  { id: 'nft-search', cat: 'Finance', pattern: /^(?:nft|search nft|find nft)\s+(.+)/i, desc: 'Search for NFTs', handler: (m) => ({ reply: `Searching NFTs: ${m[1]}`, actions: [{ type: 'navigate', url: `https://opensea.io/search?query=${encodeURIComponent(m[1])}` }] }) },
  { id: 'tx-history', cat: 'Finance', pattern: /^(?:transactions?|tx history|transaction history)\s+(.+)/i, desc: 'View transaction history for an address', handler: (m) => ({ reply: `Viewing transactions: ${m[1]}`, actions: [{ type: 'navigate', url: `https://etherscan.io/address/${encodeURIComponent(m[1])}` }] }) },
  { id: 'defi-yields', cat: 'Finance', pattern: /^(?:defi yields?|best yields?|apy|yield farming)/i, desc: 'Find best DeFi yields', handler: () => ({ reply: 'Checking DeFi yields…', actions: [{ type: 'navigate', url: 'https://defillama.com/yields' }] }) },
  { id: 'convert-currency', cat: 'Finance', pattern: /^convert\s+(\d+\.?\d*)\s+(\w+)\s+to\s+(\w+)/i, desc: 'Convert between currencies', handler: (m) => ({ reply: `Converting ${m[1]} ${m[2]} to ${m[3]}…`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=${m[1]}+${m[2]}+to+${m[3]}` }] }) },

  // ─── Scheduling & Automation (10) ───
  { id: 'schedule', cat: 'Automation', pattern: /^(?:schedule|cron|every)\s+(.+)/i, desc: 'Schedule a recurring task', handler: (m) => ({ reply: `Scheduling: ${m[1]}. Opening scheduler…`, actions: [{ type: 'open-scheduler', task: m[1] }] }) },
  { id: 'remind', cat: 'Automation', pattern: /^(?:remind me|reminder|set reminder)\s+(.+)/i, desc: 'Set a reminder', handler: (m) => ({ reply: `Reminder set: ${m[1]}`, actions: [{ type: 'reminder', text: m[1] }] }) },
  { id: 'list-automations', cat: 'Automation', pattern: /^(?:list automations?|show automations?|my automations?|scheduled tasks?)/i, desc: 'List all scheduled automations', handler: () => ({ reply: 'Listing your automations…', actions: [{ type: 'list-automations' }] }) },
  { id: 'pause-all', cat: 'Automation', pattern: /^(?:pause all|pause automations?|stop automations?)/i, desc: 'Pause all automations', handler: () => ({ reply: 'Pausing all automations', actions: [{ type: 'pause-all' }] }) },
  { id: 'resume-all', cat: 'Automation', pattern: /^(?:resume all|resume automations?|start automations?|unpause)/i, desc: 'Resume all automations', handler: () => ({ reply: 'Resuming all automations', actions: [{ type: 'resume-all' }] }) },
  { id: 'create-routine', cat: 'Automation', pattern: /^(?:create routine|new routine|morning routine|daily routine)\s*(.+)?/i, desc: 'Create a multi-step routine', handler: (m) => ({ reply: `Creating routine${m[1] ? ': ' + m[1] : ''}…`, actions: [{ type: 'create-routine', desc: m[1] || '' }] }) },
  { id: 'run-workflow', cat: 'Automation', pattern: /^(?:run workflow|execute workflow|trigger workflow)\s+(.+)/i, desc: 'Run a saved workflow', handler: (m) => ({ reply: `Running workflow: ${m[1]}`, actions: [{ type: 'run-workflow', name: m[1] }] }) },
  { id: 'save-workflow', cat: 'Automation', pattern: /^(?:save (?:as )?workflow|remember this|save skill|create skill)\s+["']?(.+?)["']?\s*$/i, desc: 'Save current steps as a reusable workflow', handler: (m) => ({ reply: `Saved as workflow: "${m[1]}"`, actions: [{ type: 'save-workflow', name: m[1] }] }) },
  { id: 'monitor-page', cat: 'Automation', pattern: /^(?:monitor|watch|track changes?)\s+(.+)/i, desc: 'Monitor a page for changes', handler: (m) => ({ reply: `Monitoring: ${m[1]}`, actions: [{ type: 'monitor', target: m[1] }] }) },
  { id: 'wait', cat: 'Automation', pattern: /^wait\s+(\d+)\s*(?:s|sec|seconds?|ms)?/i, desc: 'Wait for a specified time', handler: (m) => ({ reply: `Waiting ${m[1]}s…`, actions: [{ type: 'wait', ms: parseInt(m[1]) * 1000 }] }) },

  // ─── Productivity (14) ───
  { id: 'calculate', cat: 'Productivity', pattern: /^(?:calc|calculate|math|compute)\s+(.+)/i, desc: 'Calculate a math expression', handler: (m) => { try { const r = Function('"use strict"; return (' + m[1].replace(/[^0-9+\-*/.()%\s]/g,'') + ')')(); return { reply: `${m[1]} = ${r}` }; } catch { return { reply: `Could not calculate: ${m[1]}` }; } } },
  { id: 'convert-units', cat: 'Productivity', pattern: /^convert\s+(\d+\.?\d*)\s+(\w+)\s+to\s+(\w+)/i, desc: 'Convert between units', handler: (m) => ({ reply: `Converting ${m[1]} ${m[2]} to ${m[3]}…`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=${m[1]}+${m[2]}+to+${m[3]}` }] }) },
  { id: 'weather', cat: 'Productivity', pattern: /^(?:weather|forecast|temperature)\s*(?:in|for|at)?\s*(.+)?/i, desc: 'Check weather forecast', handler: (m) => ({ reply: `Checking weather${m[1] ? ' in ' + m[1] : ''}…`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=weather+${encodeURIComponent(m[1] || '')}` }] }) },
  { id: 'timer', cat: 'Productivity', pattern: /^(?:set timer|timer)\s+(\d+)\s*(?:min|minutes?|sec|seconds?|hrs?|hours?)/i, desc: 'Set a countdown timer', handler: (m) => ({ reply: `Timer set: ${m[1]} ${m[0].match(/min|sec|hr/i)?.[0] || 'min'}`, actions: [{ type: 'timer', duration: m[1], unit: m[0].match(/min|sec|hr/i)?.[0] || 'min' }] }) },
  { id: 'create-note', cat: 'Productivity', pattern: /^(?:note|create note|save note|jot down)\s+(.+)/i, desc: 'Create a quick note', handler: (m) => ({ reply: `Note saved: ${m[1]}`, actions: [{ type: 'save-note', text: m[1] }] }) },
  { id: 'list-notes', cat: 'Productivity', pattern: /^(?:list notes?|show notes?|my notes?)/i, desc: 'List saved notes', handler: () => ({ reply: 'Listing notes…', actions: [{ type: 'list-notes' }] }) },
  { id: 'create-todo', cat: 'Productivity', pattern: /^(?:todo|add todo|add task|task|create task)\s+(.+)/i, desc: 'Add a todo item', handler: (m) => ({ reply: `Todo added: ${m[1]}`, actions: [{ type: 'save-note', text: `TODO: ${m[1]}` }] }) },
  { id: 'bookmark', cat: 'Productivity', pattern: /^(?:bookmark|save page|save this page)/i, desc: 'Bookmark the current page', handler: () => ({ reply: 'Bookmarking page…', actions: [{ type: 'bookmark' }] }) },
  { id: 'qr-code', cat: 'Productivity', pattern: /^(?:qr code|generate qr|qr)\s+(.+)/i, desc: 'Generate a QR code', handler: (m) => ({ reply: `Generating QR code…`, actions: [{ type: 'navigate', url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(m[1])}` }] }) },
  { id: 'shorten-url', cat: 'Productivity', pattern: /^(?:shorten url|short link|shorten)\s+(https?:\/\/.+)/i, desc: 'Shorten a URL', handler: (m) => ({ reply: `URL noted: ${m[1]}. Use a URL shortener service to shorten it.` }) },
  { id: 'random-number', cat: 'Productivity', pattern: /^(?:random number|roll dice|flip coin|random)\s*(.+)?/i, desc: 'Generate random number or flip a coin', handler: (m) => { if (/coin|flip/i.test(m[0])) return { reply: Math.random() > 0.5 ? 'Heads!' : 'Tails!' }; if (/dice|die/i.test(m[0])) return { reply: `You rolled: ${Math.floor(Math.random() * 6) + 1}` }; const max = parseInt(m[1]) || 100; return { reply: `Random number (1-${max}): ${Math.floor(Math.random() * max) + 1}` }; } },
  { id: 'date-time', cat: 'Productivity', pattern: /^(?:what time|current time|what.?s the time|what.?s the date|today.?s date|date today)/i, desc: 'Show current date and time', handler: () => ({ reply: `Current date/time: ${new Date().toLocaleString()}` }) },
  { id: 'countdown', cat: 'Productivity', pattern: /^(?:countdown to|days until|how (?:many|long) until)\s+(.+)/i, desc: 'Countdown to a date', handler: (m) => { try { const d = new Date(m[1]); const diff = Math.ceil((d - Date.now()) / 86400000); return { reply: `${diff} days until ${m[1]}` }; } catch { return { reply: `I couldn't parse the date: ${m[1]}` }; } } },
  { id: 'timezone', cat: 'Productivity', pattern: /^(?:time in|timezone|what time in)\s+(.+)/i, desc: 'Check time in different timezone', handler: (m) => ({ reply: `Checking time in ${m[1]}…`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=time+in+${encodeURIComponent(m[1])}` }] }) },

  // ─── Development (10) ───
  { id: 'test-api', cat: 'Development', pattern: /^(?:test api|api test|curl|fetch)\s+(https?:\/\/.+)/i, desc: 'Test an API endpoint', handler: (m) => ({ reply: `Testing API: ${m[1]}…`, actions: [{ type: 'api-call', url: m[1], method: 'GET' }] }) },
  { id: 'format-json', cat: 'Development', pattern: /^(?:format json|prettify json|pretty print)\s+(.+)/i, desc: 'Format/prettify JSON', handler: (m) => { try { return { reply: '```json\n' + JSON.stringify(JSON.parse(m[1]), null, 2) + '\n```' }; } catch { return { reply: 'Invalid JSON' }; } } },
  { id: 'encode-url', cat: 'Development', pattern: /^(?:url encode|encode url|urlencode)\s+(.+)/i, desc: 'URL-encode a string', handler: (m) => ({ reply: `Encoded: ${encodeURIComponent(m[1])}` }) },
  { id: 'decode-url', cat: 'Development', pattern: /^(?:url decode|decode url|urldecode)\s+(.+)/i, desc: 'URL-decode a string', handler: (m) => ({ reply: `Decoded: ${decodeURIComponent(m[1])}` }) },
  { id: 'base64-encode', cat: 'Development', pattern: /^(?:base64 encode|encode base64|btoa)\s+(.+)/i, desc: 'Base64 encode a string', handler: (m) => ({ reply: `Base64: ${Buffer.from(m[1]).toString('base64')}` }) },
  { id: 'base64-decode', cat: 'Development', pattern: /^(?:base64 decode|decode base64|atob)\s+(.+)/i, desc: 'Base64 decode a string', handler: (m) => { try { return { reply: `Decoded: ${Buffer.from(m[1], 'base64').toString('utf8')}` }; } catch { return { reply: 'Invalid base64' }; } } },
  { id: 'hash-text', cat: 'Development', pattern: /^(?:hash|sha256|md5|sha1)\s+(.+)/i, desc: 'Hash a string', handler: (m) => { const algo = /md5/i.test(m[0]) ? 'md5' : /sha1/i.test(m[0]) ? 'sha1' : 'sha256'; return { reply: `${algo}: ${crypto.createHash(algo).update(m[1]).digest('hex')}` }; } },
  { id: 'uuid', cat: 'Development', pattern: /^(?:uuid|generate uuid|new uuid|guid)/i, desc: 'Generate a UUID', handler: () => ({ reply: `UUID: ${crypto.randomUUID()}` }) },
  { id: 'run-js', cat: 'Development', pattern: /^(?:run js|execute js|javascript|eval)\s+(.+)/i, desc: 'Execute JavaScript on the page', handler: (m) => ({ reply: `Executing JS…`, actions: [{ type: 'run-js', code: m[1] }] }) },
  { id: 'check-console', cat: 'Development', pattern: /^(?:console|check console|console errors?|page errors?)/i, desc: 'Check page console errors', handler: () => ({ reply: 'Checking console…', actions: [{ type: 'check-console' }] }) },

  // ─── Social Media (8) ───
  { id: 'open-twitter', cat: 'Social', pattern: /^(?:open|go to)\s+(?:twitter|x)\s+(?:profile\s+)?@?(.+)/i, desc: 'Open a Twitter/X profile', handler: (m) => ({ reply: `Opening X profile: ${m[1]}`, actions: [{ type: 'navigate', url: `https://x.com/${m[1].replace(/^@/, '')}` }] }) },
  { id: 'open-linkedin', cat: 'Social', pattern: /^(?:open|go to)\s+linkedin\s+(.+)/i, desc: 'Search LinkedIn', handler: (m) => ({ reply: `Searching LinkedIn: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(m[1])}` }] }) },
  { id: 'open-instagram', cat: 'Social', pattern: /^(?:open|go to)\s+instagram\s+@?(.+)/i, desc: 'Open Instagram profile', handler: (m) => ({ reply: `Opening Instagram: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.instagram.com/${m[1].replace(/^@/, '')}` }] }) },
  { id: 'monitor-hashtag', cat: 'Social', pattern: /^(?:monitor hashtag|track hashtag|follow hashtag)\s+#?(.+)/i, desc: 'Monitor a hashtag', handler: (m) => ({ reply: `Monitoring #${m[1]}`, actions: [{ type: 'navigate', url: `https://x.com/search?q=%23${encodeURIComponent(m[1])}&f=live` }] }) },
  { id: 'post-compose', cat: 'Social', pattern: /^(?:compose post|new post|create post)\s+(.+)/i, desc: 'Compose a social media post', handler: (m) => ({ reply: `Composing post…`, actions: [{ type: 'llm-task', task: 'compose-social-post', prompt: m[1] }] }) },
  { id: 'open-github-profile', cat: 'Social', pattern: /^(?:github profile|github user)\s+(.+)/i, desc: 'Open GitHub profile', handler: (m) => ({ reply: `Opening GitHub: ${m[1]}`, actions: [{ type: 'navigate', url: `https://github.com/${encodeURIComponent(m[1])}` }] }) },
  { id: 'product-hunt', cat: 'Social', pattern: /^(?:product hunt|producthunt)\s*(.+)?/i, desc: 'Browse Product Hunt', handler: (m) => ({ reply: `Opening Product Hunt${m[1] ? ': ' + m[1] : ''}`, actions: [{ type: 'navigate', url: m[1] ? `https://www.producthunt.com/search?q=${encodeURIComponent(m[1])}` : 'https://www.producthunt.com' }] }) },
  { id: 'hacker-news', cat: 'Social', pattern: /^(?:hacker news|hn|hackernews)\s*(.+)?/i, desc: 'Browse Hacker News', handler: (m) => ({ reply: `Opening Hacker News`, actions: [{ type: 'navigate', url: m[1] ? `https://hn.algolia.com/?q=${encodeURIComponent(m[1])}` : 'https://news.ycombinator.com' }] }) },

  // ─── Cookie & Session (4) ───
  { id: 'grab-cookies', cat: 'Session', pattern: /^(?:grab cookies?|get cookies?|capture cookies?)\s*(?:for\s+)?(.+)?/i, desc: 'Capture browser cookies for a domain', handler: (m) => ({ reply: `Grabbing cookies${m[1] ? ' for ' + m[1] : ''}…`, actions: [{ type: 'cookie-grab', domain: m[1] || '' }] }) },
  { id: 'clear-cookies', cat: 'Session', pattern: /^(?:clear cookies?|delete cookies?)/i, desc: 'Clear cookies for current site', handler: () => ({ reply: 'Clearing cookies…', actions: [{ type: 'clear-cookies' }] }) },
  { id: 'clear-cache', cat: 'Session', pattern: /^(?:clear cache|clear browser cache|clear data)/i, desc: 'Clear browser cache', handler: () => ({ reply: 'To clear cache: Settings > Privacy > Clear browsing data', actions: [{ type: 'navigate', url: 'chrome://settings/clearBrowserData' }] }) },
  { id: 'incognito', cat: 'Session', pattern: /^(?:incognito|private|private window)/i, desc: 'Open incognito window', handler: () => ({ reply: 'Opening incognito window…', actions: [{ type: 'incognito' }] }) },

  // ─── Memory & Learning (8) ───
  { id: 'remember', cat: 'Memory', pattern: /^(?:remember|save|store)\s+(?:that\s+)?(.+)/i, desc: 'Remember a fact for future use', handler: (m) => ({ reply: `Remembered: ${m[1]}`, actions: [{ type: 'remember', text: m[1] }] }) },
  { id: 'recall', cat: 'Memory', pattern: /^(?:recall|what did i|do you remember|what (?:do you|did you) (?:know|remember))\s*(.+)?/i, desc: 'Recall saved memories', handler: (m) => ({ reply: 'Searching memories…', actions: [{ type: 'recall', query: m[1] || '' }] }) },
  { id: 'forget', cat: 'Memory', pattern: /^(?:forget|clear memory|delete memory|erase memory)\s*(.+)?/i, desc: 'Clear saved memories', handler: (m) => ({ reply: `Memory cleared${m[1] ? ': ' + m[1] : ''}`, actions: [{ type: 'forget', query: m[1] || '' }] }) },
  { id: 'learn-page', cat: 'Memory', pattern: /^(?:learn from|study|memorize)\s+(?:this\s+)?page/i, desc: 'Learn and remember page content', handler: () => ({ reply: 'Learning from this page…', actions: [{ type: 'learn-page' }] }) },
  { id: 'list-skills', cat: 'Memory', pattern: /^(?:list skills?|show skills?|what can you do|help|skills?|commands?|capabilities)/i, desc: 'List all available skills', handler: () => {
    const cats = {};
    SKILLS.forEach(s => { if (!cats[s.cat]) cats[s.cat] = []; cats[s.cat].push(s); });
    let text = `**AMI Agent Skills (${SKILLS.length} total)**\n\n`;
    for (const [cat, skills] of Object.entries(cats)) {
      text += `**${cat}** (${skills.length})\n`;
      skills.forEach(s => { text += `  • \`${s.id}\` — ${s.desc}\n`; });
      text += '\n';
    }
    return { reply: text };
  }},
  { id: 'list-workflows', cat: 'Memory', pattern: /^(?:list workflows?|show workflows?|my workflows?|saved workflows?)/i, desc: 'List saved workflows', handler: () => ({ reply: 'Listing saved workflows…', actions: [{ type: 'list-workflows' }] }) },
  { id: 'show-history', cat: 'Memory', pattern: /^(?:history|chat history|show history|past conversations?)/i, desc: 'Show chat history', handler: () => ({ reply: 'Showing recent history…', actions: [{ type: 'show-history' }] }) },
  { id: 'export-chat', cat: 'Memory', pattern: /^(?:export chat|save chat|download chat)/i, desc: 'Export chat conversation', handler: () => ({ reply: 'Exporting chat…', actions: [{ type: 'export-chat' }] }) },

  // ─── File Generation (4) ───
  { id: 'generate-file', cat: 'File', pattern: /^(?:generate|create|make|write)\s+(?:a\s+)?file\s+(?:named?\s+)?["']?(.+?)["']?\s*$/i, desc: 'Generate and download a file', handler: (m) => ({ reply: `Generating file: ${m[1]}`, actions: [{ type: 'generate-file', filename: m[1], content: '', mime: 'text/plain' }] }) },
  { id: 'generate-csv', cat: 'File', pattern: /^(?:generate|create|export)\s+(?:a\s+)?csv\s+(?:of\s+)?(.+)/i, desc: 'Generate a CSV file', handler: (m) => ({ reply: `Generating CSV: ${m[1]}`, actions: [{ type: 'llm-task', task: 'generate-csv', prompt: m[1] }] }) },
  { id: 'generate-json', cat: 'File', pattern: /^(?:generate|create|export)\s+(?:a\s+)?json\s+(?:of\s+)?(.+)/i, desc: 'Generate a JSON file', handler: (m) => ({ reply: `Generating JSON: ${m[1]}`, actions: [{ type: 'llm-task', task: 'generate-json', prompt: m[1] }] }) },
  { id: 'generate-markdown', cat: 'File', pattern: /^(?:generate|create|write)\s+(?:a\s+)?(?:markdown|md)\s+(?:of\s+|for\s+)?(.+)/i, desc: 'Generate a Markdown file', handler: (m) => ({ reply: `Generating Markdown: ${m[1]}`, actions: [{ type: 'llm-task', task: 'generate-markdown', prompt: m[1] }] }) },

  // ─── Persona & Auto-fill (3) ───
  { id: 'auto-fill', cat: 'Persona', pattern: /^(?:auto.?fill|fill (?:with|using) (?:my|persona)|use my (?:data|info|details|profile))/i, desc: 'Auto-fill forms using your persona', handler: () => ({ reply: 'Auto-filling forms from your persona…', actions: [{ type: 'auto-fill' }] }) },
  { id: 'my-persona', cat: 'Persona', pattern: /^(?:my persona|show persona|who am i|my (?:profile|info|details|identity))/i, desc: 'Show your stored persona', handler: () => ({ reply: 'Fetching your persona…', actions: [{ type: 'show-persona' }] }) },
  { id: 'copy-text', cat: 'Utility', pattern: /^copy\s+["']?(.+?)["']?\s*$/i, desc: 'Copy text to clipboard', handler: (m) => ({ reply: `Copied: "${m[1]}"`, actions: [{ type: 'copy', text: m[1] }] }) },

  // ─── Data Parsing (6) ───
  { id: 'parse-json', cat: 'Data', pattern: /^(?:parse json|read json|decode json)\s+(.+)/i, desc: 'Parse and display JSON data', handler: (m) => { try { return { reply: '```json\n' + JSON.stringify(JSON.parse(m[1]), null, 2) + '\n```' }; } catch { return { reply: 'Invalid JSON input' }; } } },
  { id: 'parse-csv', cat: 'Data', pattern: /^(?:parse csv|read csv|decode csv)\s+(.+)/i, desc: 'Parse CSV data into readable format', handler: (m) => ({ reply: 'Parsing CSV…', actions: [{ type: 'llm-task', task: 'parse-csv', prompt: m[1] }] }) },
  { id: 'extract-json-from-page', cat: 'Data', pattern: /^(?:extract json|scrape json|get json)\s*(?:from)?\s*(?:this)?\s*page/i, desc: 'Extract JSON-LD and structured data from page', handler: () => ({ reply: 'Extracting JSON data from page…', actions: [{ type: 'extract-structured' }] }) },
  { id: 'convert-to-csv', cat: 'Data', pattern: /^(?:convert to csv|table to csv|export as csv)\s*(.+)?/i, desc: 'Convert page table data to CSV', handler: (m) => ({ reply: 'Converting to CSV…', actions: [{ type: 'extract-table' }] }) },
  { id: 'parse-url', cat: 'Data', pattern: /^(?:parse url|decode url|analyze url)\s+(https?:\/\/.+)/i, desc: 'Parse and display URL components', handler: (m) => { try { const u = new URL(m[1]); return { reply: `**URL Analysis**\nProtocol: ${u.protocol}\nHost: ${u.host}\nPath: ${u.pathname}\nQuery: ${u.search}\nHash: ${u.hash}` }; } catch { return { reply: 'Invalid URL' }; } } },
  { id: 'word-count', cat: 'Data', pattern: /^(?:word count|count words|character count)\s+(.+)/i, desc: 'Count words and characters in text', handler: (m) => ({ reply: `Words: ${m[1].split(/\s+/).filter(Boolean).length} | Characters: ${m[1].length} | Lines: ${m[1].split('\n').length}` }) },

  // ─── Security & Privacy (6) ───
  { id: 'check-breach', cat: 'Security', pattern: /^(?:check breach|have i been pwned|data breach|check password)\s+(.+)/i, desc: 'Check if email was in a data breach', handler: (m) => ({ reply: `Checking breach status for ${m[1]}…`, actions: [{ type: 'navigate', url: `https://haveibeenpwned.com/account/${encodeURIComponent(m[1])}` }] }) },
  { id: 'generate-password', cat: 'Security', pattern: /^(?:generate password|new password|random password|strong password)/i, desc: 'Generate a strong random password', handler: () => { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'; let p = ''; for (let i = 0; i < 24; i++) p += c[Math.floor(Math.random() * c.length)]; return { reply: `Generated password: \`${p}\`` }; } },
  { id: 'check-ssl', cat: 'Security', pattern: /^(?:check ssl|ssl check|certificate check)\s+(.+)/i, desc: 'Check SSL certificate for a domain', handler: (m) => ({ reply: `Checking SSL for ${m[1]}…`, actions: [{ type: 'navigate', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(m[1])}` }] }) },
  { id: 'whois', cat: 'Security', pattern: /^(?:whois|domain info|lookup domain)\s+(.+)/i, desc: 'WHOIS lookup for a domain', handler: (m) => ({ reply: `Looking up: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.whois.com/whois/${encodeURIComponent(m[1])}` }] }) },
  { id: 'dns-lookup', cat: 'Security', pattern: /^(?:dns lookup|check dns|dig)\s+(.+)/i, desc: 'DNS lookup for a domain', handler: (m) => ({ reply: `DNS lookup: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.nslookup.io/domains/${encodeURIComponent(m[1])}/dns-records/` }] }) },
  { id: 'privacy-check', cat: 'Security', pattern: /^(?:privacy check|check trackers|privacy scan)/i, desc: 'Check privacy and trackers on current page', handler: () => ({ reply: 'Scanning for trackers…', actions: [{ type: 'privacy-scan' }] }) },

  // ─── Education & Learning (6) ───
  { id: 'flashcards', cat: 'Education', pattern: /^(?:flashcards?|make flashcards?|study cards?)\s+(?:for\s+)?(.+)/i, desc: 'Generate flashcards for a topic', handler: (m) => ({ reply: `Generating flashcards: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'flashcards', prompt: m[1] }] }) },
  { id: 'quiz', cat: 'Education', pattern: /^(?:quiz|test me|pop quiz)\s+(?:on\s+)?(.+)/i, desc: 'Create a quiz on a topic', handler: (m) => ({ reply: `Creating quiz: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'quiz', prompt: m[1] }] }) },
  { id: 'eli5', cat: 'Education', pattern: /^(?:eli5|explain like i.?m 5|simple explanation)\s+(.+)/i, desc: 'Explain like I\'m 5', handler: (m) => ({ reply: `Explaining simply: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'eli5', prompt: m[1] }] }) },
  { id: 'study-plan', cat: 'Education', pattern: /^(?:study plan|learning plan|roadmap)\s+(?:for\s+)?(.+)/i, desc: 'Create a study plan', handler: (m) => ({ reply: `Creating study plan: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'study-plan', prompt: m[1] }] }) },
  { id: 'teach-me', cat: 'Education', pattern: /^(?:teach me|tutorial|lesson)\s+(.+)/i, desc: 'Teach me about a topic', handler: (m) => ({ reply: `Teaching: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'teach', prompt: m[1] }] }) },
  { id: 'practice-problems', cat: 'Education', pattern: /^(?:practice problems?|exercises?|drill)\s+(?:for\s+)?(.+)/i, desc: 'Generate practice problems', handler: (m) => ({ reply: `Generating practice: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'practice', prompt: m[1] }] }) },

  // ─── Health & Wellness (4) ───
  { id: 'pomodoro', cat: 'Wellness', pattern: /^(?:pomodoro|focus timer|start timer|work timer)(?:\s+(\d+))?/i, desc: 'Start a Pomodoro focus timer', handler: (m) => { const mins = m[1] || '25'; return { reply: `Pomodoro timer set for ${mins} minutes. Focus!`, actions: [{ type: 'timer', minutes: parseInt(mins) }] }; } },
  { id: 'break-reminder', cat: 'Wellness', pattern: /^(?:break|take a break|remind me to break|eye break)/i, desc: 'Set a break reminder', handler: () => ({ reply: '⏰ Break reminder set. I\'ll remind you in 20 minutes.', actions: [{ type: 'timer', minutes: 20, message: 'Time for a break! Stand up, stretch, and rest your eyes.' }] }) },
  { id: 'stretch', cat: 'Wellness', pattern: /^(?:stretch|stretching|desk exercises?|ergonomic)/i, desc: 'Get desk stretching exercises', handler: () => ({ reply: 'Generating desk exercise routine…', actions: [{ type: 'llm-task', task: 'stretch-routine' }] }) },
  { id: 'breathe', cat: 'Wellness', pattern: /^(?:breathe|breathing exercise|calm down|relax|deep breath)/i, desc: 'Guided breathing exercise', handler: () => ({ reply: '🧘 4-7-8 Breathing:\n1. Breathe in through nose for 4 seconds\n2. Hold for 7 seconds\n3. Exhale through mouth for 8 seconds\nRepeat 3-4 cycles.' }) },

  // ─── Travel & Location (4) ───
  { id: 'weather', cat: 'Travel', pattern: /^(?:weather|forecast|temperature)\s+(?:in\s+|for\s+|at\s+)?(.+)/i, desc: 'Check weather for a location', handler: (m) => ({ reply: `Checking weather: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=weather+${encodeURIComponent(m[1])}` }] }) },
  { id: 'directions', cat: 'Travel', pattern: /^(?:directions?|route|how to get)\s+(?:to\s+|from\s+)?(.+)/i, desc: 'Get directions to a place', handler: (m) => ({ reply: `Getting directions: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/maps/dir//${encodeURIComponent(m[1])}` }] }) },
  { id: 'flight-status', cat: 'Travel', pattern: /^(?:flight status|track flight|flight)\s+(.+)/i, desc: 'Check flight status', handler: (m) => ({ reply: `Checking flight: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=flight+status+${encodeURIComponent(m[1])}` }] }) },
  { id: 'timezone', cat: 'Travel', pattern: /^(?:time(?:zone)?|what time)\s+(?:in\s+|is it in\s+)?(.+)/i, desc: 'Check time in a timezone or city', handler: (m) => ({ reply: `Checking time in ${m[1]}…`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=time+in+${encodeURIComponent(m[1])}` }] }) },

  // ─── Math & Conversion (4) ───
  { id: 'calculate', cat: 'Math', pattern: /^(?:calc(?:ulate)?|compute|math|solve)\s+(.+)/i, desc: 'Calculate a math expression', handler: (m) => ({ reply: `Calculating: ${m[1]}…`, actions: [{ type: 'llm-task', task: 'calculate', prompt: m[1] }] }) },
  { id: 'convert-units', cat: 'Math', pattern: /^convert\s+(.+)/i, desc: 'Convert units or currencies', handler: (m) => ({ reply: `Converting: ${m[1]}…`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=convert+${encodeURIComponent(m[1])}` }] }) },
  { id: 'exchange-rate', cat: 'Math', pattern: /^(?:exchange rate|forex|currency rate)\s+(.+)/i, desc: 'Check currency exchange rate', handler: (m) => ({ reply: `Checking rate: ${m[1]}`, actions: [{ type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(m[1])}+exchange+rate` }] }) },
  { id: 'random-number', cat: 'Math', pattern: /^(?:random number|roll dice|flip coin|rng)(?:\s+(\d+)\s*-\s*(\d+))?/i, desc: 'Generate random number or flip coin', handler: (m) => { const min = parseInt(m[1]) || 1; const max = parseInt(m[2]) || 100; const val = Math.floor(Math.random() * (max - min + 1)) + min; return { reply: `🎲 Random number (${min}-${max}): **${val}**` }; } },

  // ─── System (8) ───
  { id: 'settings', cat: 'System', pattern: /^(?:settings|preferences|config|configure)/i, desc: 'Open settings', handler: () => ({ reply: 'Opening settings…', actions: [{ type: 'open-settings' }] }) },
  { id: 'connections', cat: 'System', pattern: /^(?:connections|integrations|connected apps|manage connections)/i, desc: 'Manage connections', handler: () => ({ reply: 'Opening connections…', actions: [{ type: 'open-connections' }] }) },
  { id: 'status', cat: 'System', pattern: /^(?:status|system status|health check|check status)/i, desc: 'Check system status', handler: () => ({ reply: 'Checking system status…', actions: [{ type: 'check-status' }] }) },
  { id: 'version', cat: 'System', pattern: /^(?:version|about|what version)/i, desc: 'Show AMI Browser version', handler: () => ({ reply: 'AMI Browser v2.0.0 — AI-powered automation browser with 210+ built-in skills and 240+ integrations.' }) },
  { id: 'clear-chat', cat: 'System', pattern: /^(?:clear chat|new chat|reset chat|fresh start)/i, desc: 'Clear chat history', handler: () => ({ reply: 'Chat cleared.', actions: [{ type: 'clear-chat' }] }) },
  { id: 'theme', cat: 'System', pattern: /^(?:theme|dark mode|light mode|toggle theme)/i, desc: 'Toggle dark/light theme', handler: () => ({ reply: 'Toggling theme…', actions: [{ type: 'toggle-theme' }] }) },
  { id: 'fullscreen', cat: 'System', pattern: /^(?:fullscreen|full screen|maximize)/i, desc: 'Toggle fullscreen', handler: () => ({ reply: 'Toggling fullscreen…', actions: [{ type: 'fullscreen' }] }) },
  { id: 'open-hub', cat: 'System', pattern: /^(?:hub|home|ami hub|dashboard|goto? hub|open hub)/i, desc: 'Open AMI Browser hub page', handler: () => ({ reply: 'Opening AMI Hub…', actions: [{ type: 'open-hub' }] }) },
];

// ── LLM Task Prompts ────────────────────────────────────────────────────────
const TASK_PROMPTS = {
  'write-email': (p) => `Write a professional email: ${p}`,
  'write-post': (p) => `Write an engaging social media post about: ${p}`,
  'translate': (p, extra) => `Translate to ${extra?.lang || 'English'}: ${p}`,
  'rewrite': (p) => `Rewrite keeping same meaning: ${p}`,
  'expand': (p) => `Expand with more details: ${p}`,
  'shorten': (p) => `Shorten keeping key points: ${p}`,
  'proofread': (p) => `Proofread and fix grammar: ${p}`,
  'brainstorm': (p) => `Generate 10 creative ideas for: ${p}`,
  'write-code': (p) => `Write clean code for: ${p}`,
  'explain-code': (p) => `Explain this code simply: ${p}`,
  'write-regex': (p) => `Write a regex for: ${p}. Explain the pattern.`,
  'compare': (p) => `Compare, list differences and similarities: ${p}`,
  'sentiment': (p) => `Analyze sentiment: ${p}. Rate confidence.`,
  'fact-check': (p) => `Fact-check: ${p}. Provide evidence.`,
  'research': (p) => `Detailed research summary: ${p}`,
  'competitor-analysis': (p) => `Competitive landscape for: ${p}`,
  'market-research': (p) => `Market research for: ${p}`,
  'define': (p) => `Define and explain: ${p}`,
  'how-to': (p) => `Step-by-step instructions: ${p}`,
  'pros-cons': (p) => `Pros and cons of: ${p}`,
  'explain': (p) => `Explain simply: ${p}`,
  'summarize': (p) => `Summarize concisely: ${p}`,
  'summarize-page': (p) => `Summarize this page content:\n${p}`,
  'compose-reply': (p) => `Compose a professional reply: ${p}`,
  'summarize-thread': () => 'Summarize our conversation so far.',
  'draft-response': (p) => `Draft a professional response: ${p}`,
  'announce': (p) => `Create an announcement: ${p}`,
  'compose-social-post': (p) => `Create an engaging social post about: ${p}. Include hashtags.`,
  'generate-csv': (p) => `Generate CSV data for: ${p}. Return ONLY raw CSV.`,
  'generate-json': (p) => `Generate JSON for: ${p}. Return ONLY valid JSON.`,
  'generate-markdown': (p) => `Generate Markdown for: ${p}. Return ONLY Markdown.`,
  'flashcards': (p) => `Create 10 flashcards for studying: ${p}. Format: Q: ... A: ...`,
  'quiz': (p) => `Create a 5-question quiz about: ${p}. Include answers.`,
  'eli5': (p) => `Explain like I'm 5: ${p}`,
  'study-plan': (p) => `Create a weekly study plan for: ${p}`,
  'teach': (p) => `Teach me about: ${p}. Start with basics.`,
  'practice': (p) => `Generate 5 practice problems for: ${p}. Include solutions.`,
  'stretch-routine': () => 'Give me a 5-minute desk stretching routine with specific exercises.',
  'parse-csv': (p) => `Parse this CSV into readable format:\n${p}`,
  'calculate': (p) => `Calculate: ${p}. Show work.`,
};

// ── Compound Intent Detection ───────────────────────────────────────────────
function matchCompound(msg) {
  const m = msg.match(/^(?:go to|open|visit|navigate to?|va (?:sur|à)|ouvre|ve a|abre|geh (?:auf|zu)|vai (?:ao?|para))\s+(\S+?)(?:\.com|\.org|\.net|\.io)?\s+(?:and|then|to|et|y|e|und|puis)\s+(.+)$/i);
  if (!m) return null;
  const site = m[1].replace(/\.$/, '');
  const rawTask = m[2].trim();
  const task = rawTask.replace(/^(?:search for|look for|listen to|play|search|watch|find)\s+/i, '').trim() || rawTask;
  const searchUrls = {
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(task)}`,
    spotify: `https://open.spotify.com/search/${encodeURIComponent(task)}`,
    google: `https://duckduckgo.com/?q=${encodeURIComponent(task)}`,
    github: `https://github.com/search?q=${encodeURIComponent(task)}`,
    reddit: `https://www.reddit.com/search/?q=${encodeURIComponent(task)}`,
    amazon: `https://www.amazon.com/s?k=${encodeURIComponent(task)}`,
    soundcloud: `https://soundcloud.com/search?q=${encodeURIComponent(task)}`,
    twitch: `https://www.twitch.tv/search?term=${encodeURIComponent(task)}`,
    netflix: `https://www.netflix.com/search?q=${encodeURIComponent(task)}`,
  };
  const siteMap = { youtube: 'https://www.youtube.com', spotify: 'https://open.spotify.com', google: 'https://www.google.com', github: 'https://github.com', reddit: 'https://www.reddit.com', amazon: 'https://www.amazon.com', twitter: 'https://x.com', x: 'https://x.com' };
  const url = searchUrls[site] || `${siteMap[site] || `https://${site}.com`}/search?q=${encodeURIComponent(task)}`;
  return { reply: `Searching ${site}: ${task}`, actions: [{ type: 'navigate', url }] };
}

// ── Play Intent Detection ───────────────────────────────────────────────────
function matchPlay(msg) {
  const m = msg.match(/^(?:play|listen to|watch|put on|joue|écoute|mets|lance|regarde)\s+(.+?)(?:\s+(?:on|in|sur)\s+(youtube|spotify|soundcloud|netflix|twitch))?$/i);
  if (!m) return null;
  const query = m[1].trim().replace(/^(?:a\s+)?(?:video|song|music)\s+(?:of|about)\s+/i, '').replace(/^(?:some|the|a|an)\s+/i, '').trim();
  const platform = (m[2] || '').toLowerCase();
  const urls = {
    spotify: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    soundcloud: `https://soundcloud.com/search?q=${encodeURIComponent(query)}`,
    netflix: `https://www.netflix.com/search?q=${encodeURIComponent(query)}`,
    twitch: `https://www.twitch.tv/search?term=${encodeURIComponent(query)}`,
  };
  const url = urls[platform] || `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return { reply: `Searching ${platform || 'YouTube'}: ${query}`, actions: [{ type: 'navigate', url }] };
}

// ── Action Executor ─────────────────────────────────────────────────────────
async function executeActions(session, actions) {
  const results = [];
  for (const action of actions || []) {
    try {
      switch (action.type) {
        case 'navigate': {
          const url = /^https?:\/\//i.test(action.url) ? action.url : `https://${action.url}`;
          await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          session.currentUrl = session.page.url();
          session.touch();
          results.push({ type: 'navigate', url: session.currentUrl });
          break;
        }
        case 'go-back':
          await session.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
          session.currentUrl = session.page.url();
          results.push({ type: 'navigation', url: session.currentUrl });
          break;
        case 'go-forward':
          await session.page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
          session.currentUrl = session.page.url();
          results.push({ type: 'navigation', url: session.currentUrl });
          break;
        case 'reload':
          await session.page.reload({ waitUntil: 'domcontentloaded' });
          session.currentUrl = session.page.url();
          results.push({ type: 'navigation', url: session.currentUrl });
          break;
        case 'click': {
          const sel = action.selector;
          // Try CSS selector first, then XPath text match
          try {
            await session.page.click(sel, { timeout: 5000 });
          } catch {
            const el = await session.page.evaluateHandle((text) => {
              const matches = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"]')]
                .filter(e => e.textContent.toLowerCase().includes(text.toLowerCase()) || e.getAttribute('aria-label')?.toLowerCase().includes(text.toLowerCase()));
              return matches[0] || null;
            }, sel);
            if (el) await el.click();
          }
          results.push({ type: 'click', selector: sel });
          break;
        }
        case 'type': {
          try {
            await session.page.click(action.selector, { timeout: 3000 });
          } catch {
            const el = await session.page.evaluateHandle((sel) => {
              return document.querySelector(`input[name="${sel}"], input[placeholder*="${sel}" i], textarea[name="${sel}"], [aria-label*="${sel}" i]`);
            }, action.selector);
            if (el) await el.click();
          }
          await session.page.keyboard.type(action.text || '', { delay: 30 });
          results.push({ type: 'type', selector: action.selector });
          break;
        }
        case 'scroll':
          await session.page.evaluate((y) => window.scrollBy(0, y), action.y || 500);
          results.push({ type: 'scroll', y: action.y });
          break;
        case 'scroll-to':
          await session.page.evaluate((y) => window.scrollTo(0, y), action.y || 0);
          results.push({ type: 'scroll-to', y: action.y });
          break;
        case 'screenshot': {
          const buf = await session.page.screenshot({ type: 'jpeg', quality: 70 });
          results.push({ type: 'screenshot', data: buf.toString('base64') });
          break;
        }
        case 'extract-text': {
          const text = await session.page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
          results.push({ type: 'extract-text', data: text });
          break;
        }
        case 'extract-links': {
          const links = await session.page.evaluate(() =>
            [...document.querySelectorAll('a[href]')].slice(0, 50).map(a => ({ text: a.textContent.trim().slice(0, 80), href: a.href }))
          );
          results.push({ type: 'extract-links', data: links });
          break;
        }
        case 'extract-images': {
          const imgs = await session.page.evaluate(() =>
            [...document.querySelectorAll('img[src]')].slice(0, 30).map(i => ({ src: i.src, alt: i.alt }))
          );
          results.push({ type: 'extract-images', data: imgs });
          break;
        }
        case 'extract-emails': {
          const text = await session.page.evaluate(() => document.body?.innerText || '');
          const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [])];
          results.push({ type: 'extract-emails', data: emails });
          break;
        }
        case 'extract-phones': {
          const text = await session.page.evaluate(() => document.body?.innerText || '');
          const phones = [...new Set(text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [])];
          results.push({ type: 'extract-phones', data: phones });
          break;
        }
        case 'extract-headings': {
          const headings = await session.page.evaluate(() =>
            [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({ level: h.tagName, text: h.textContent.trim() }))
          );
          results.push({ type: 'extract-headings', data: headings });
          break;
        }
        case 'extract-meta': {
          const meta = await session.page.evaluate(() => ({
            title: document.title,
            description: document.querySelector('meta[name="description"]')?.content || '',
            ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
            ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
            canonical: document.querySelector('link[rel="canonical"]')?.href || '',
          }));
          results.push({ type: 'extract-meta', data: meta });
          break;
        }
        case 'extract-table': {
          const tables = await session.page.evaluate(() => {
            const tbl = document.querySelector('table');
            if (!tbl) return null;
            return [...tbl.rows].slice(0, 50).map(r => [...r.cells].map(c => c.textContent.trim()));
          });
          results.push({ type: 'extract-table', data: tables });
          break;
        }
        case 'extract-prices': {
          const text = await session.page.evaluate(() => document.body?.innerText || '');
          const prices = [...new Set(text.match(/\$[\d,]+\.?\d*/g) || [])];
          results.push({ type: 'extract-prices', data: prices });
          break;
        }
        case 'extract-forms': {
          const forms = await session.page.evaluate(() =>
            [...document.querySelectorAll('form')].slice(0, 10).map((f, i) => ({
              index: i, action: f.action, method: f.method,
              fields: [...f.elements].slice(0, 20).map(e => ({ tag: e.tagName, name: e.name, type: e.type, placeholder: e.placeholder }))
            }))
          );
          results.push({ type: 'extract-forms', data: forms });
          break;
        }
        case 'hover':
          try { await session.page.hover(action.selector, { timeout: 5000 }); } catch {}
          results.push({ type: 'hover', selector: action.selector });
          break;
        case 'submit':
          await session.page.keyboard.press('Enter');
          results.push({ type: 'submit' });
          break;
        case 'run-js': {
          const jsResult = await session.page.evaluate(action.code).catch(e => `Error: ${e.message}`);
          results.push({ type: 'run-js', data: jsResult });
          break;
        }
        case 'zoom':
          await session.page.evaluate((l) => document.body.style.zoom = l, action.level || 1);
          results.push({ type: 'zoom', level: action.level });
          break;
        case 'wait':
          await new Promise(r => setTimeout(r, Math.min(action.ms || 1000, 30000)));
          results.push({ type: 'wait', ms: action.ms });
          break;
        default:
          results.push({ type: action.type, message: 'Action noted (client-side)' });
      }
    } catch (err) {
      results.push({ type: action.type, error: err.message });
    }
  }
  return results;
}

// ── Main processMessage ─────────────────────────────────────────────────────
// Signature: processMessage(session, message, history) to match session.js routes
async function processMessage(session, message, history) {
  // Lazy-load aiProxy to avoid circular deps
  let aiProxy;
  try { aiProxy = require('./aiProxy'); } catch {}

  const raw = (message || '').trim();
  if (!raw) return { reply: 'Empty command.' };

  // Normalize: strip conversational preambles
  const normalized = raw
    .replace(/^(?:i\s+want\s+(?:you\s+)?to|i(?:'d|\s+would)\s+like\s+(?:you\s+)?to|can\s+you(?:\s+please)?|could\s+you(?:\s+please)?|please|hey\s+ami|ami)\s+/i, '')
    .replace(/^(?:please)\s+/i, '')
    .trim() || raw;

  // 1 — Compound intent: "go to youtube and play X"
  const compound = matchCompound(normalized);
  if (compound) {
    if (session) compound.results = await executeActions(session, compound.actions);
    return compound;
  }

  // 2 — Play intent: "play bohemian rhapsody"
  const play = matchPlay(normalized);
  if (play) {
    if (session) play.results = await executeActions(session, play.actions);
    return play;
  }

  // 3 — Skills registry match
  for (const skill of SKILLS) {
    const match = normalized.match(skill.pattern) || raw.match(skill.pattern);
    if (match) {
      const result = skill.handler(match);
      if (!result) continue; // handler returned null (e.g. invalid range)

      // Handle LLM tasks
      if (result.actions?.some(a => a.type === 'llm-task') && aiProxy) {
        const taskAction = result.actions.find(a => a.type === 'llm-task');
        const promptFn = TASK_PROMPTS[taskAction.task];
        const prompt = promptFn ? promptFn(taskAction.prompt || '', taskAction) : (taskAction.prompt || raw);
        // If task is summarize-page, inject page context
        let finalPrompt = prompt;
        if (taskAction.task === 'summarize-page' && session) {
          const ctx = await getPageContext(session);
          const pageText = await session.page.evaluate(() => document.body?.innerText?.slice(0, 4000) || '').catch(() => '');
          finalPrompt = TASK_PROMPTS['summarize-page'](pageText || ctx.title || '');
        }
        try {
          const llmReply = await aiProxy.chatCompletion([
            { role: 'system', content: `You are AMI Agent. Respond helpfully and concisely.` },
            { role: 'user', content: finalPrompt },
          ]);
          return { reply: llmReply?.choices?.[0]?.message?.content || llmReply?.reply || result.reply };
        } catch (err) {
          return { reply: `${result.reply}\n\n(LLM unavailable: ${err.message})` };
        }
      }

      // Execute browser actions if session present
      if (session && result.actions?.length) {
        result.results = await executeActions(session, result.actions);
      }
      return result;
    }
  }

  // 4 — LLM fallback for unmatched commands
  if (aiProxy) {
    const ctx = session ? await getPageContext(session) : {};
    const contextStr = ctx.title ? `\nPage: ${ctx.title}\nURL: ${ctx.url}` : '';
    try {
      const llmReply = await aiProxy.chatCompletion([
        { role: 'system', content: `You are AMI Agent, a browser automation AI with ${SKILLS.length}+ skills. Respond with JSON for browser actions: {"reply":"...","actions":[{"type":"navigate","url":"..."}]}. For non-browser queries, respond with {"reply":"your answer"}.${contextStr}` },
        { role: 'user', content: raw },
      ]);
      const text = llmReply?.choices?.[0]?.message?.content || '';
      try {
        const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim());
        if (session && parsed.actions?.length) {
          parsed.results = await executeActions(session, parsed.actions);
        }
        return parsed;
      } catch {
        return { reply: text || 'No response from AI.' };
      }
    } catch (err) {
      return { reply: `I have ${SKILLS.length} built-in skills. Try: "go to <url>", "search <query>", "screenshot", "extract text", "price bitcoin", "help" for full list.\n\n(AI fallback error: ${err.message})` };
    }
  }

  return { reply: `Didn't match any of my ${SKILLS.length} skills. Try: "go to <url>", "search <query>", "screenshot", "extract text", "help" for full list.` };
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  processMessage,
  executeActions,
  enableAdBlocking,
  getPageContext,
  SKILLS,
  TASK_PROMPTS,
  isAdUrl,
};
