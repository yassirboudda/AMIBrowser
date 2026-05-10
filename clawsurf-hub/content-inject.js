/* AMI Browser – Content inject: floating action button + full chat + page context */
'use strict';

(() => {
  if (location.protocol === 'chrome-extension:' || location.protocol === 'chrome:') return;

  // Keep noisy diagnostics disabled by default for better page performance.
  const AMI_DEBUG = (() => {
    try {
      return localStorage.getItem('ami_fab_debug') === '1';
    } catch {
      return false;
    }
  })();

  /* ── Dev logging with visual toast ── */
  function devLog(...args) {
    if (!AMI_DEBUG) return;
    console.log(`%c[AMI-fab]`, 'color:#f9a8d4;font-weight:bold', ...args);
    showDebugToast(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
  }

  /* ── Visual debug toast (shows automation progress on screen) ── */
  function showDebugToast(text) {
    if (!AMI_DEBUG) return;
    let container = document.getElementById('ami-debug-toasts');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ami-debug-toasts';
      container.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483645;max-width:380px;pointer-events:none;display:flex;flex-direction:column;gap:4px;font-family:monospace;font-size:11px;';
      document.documentElement.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = 'background:rgba(30,30,40,0.92);color:#c4b5fd;padding:6px 10px;border-radius:6px;border:1px solid rgba(139,92,246,0.3);max-width:380px;word-break:break-word;opacity:1;transition:opacity 0.5s;';
    toast.textContent = `🤖 ${text.slice(0, 200)}`;
    container.appendChild(toast);
    // Auto-remove after 6 seconds
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 6000);
    // Keep max 6 toasts
    while (container.children.length > 6) container.firstChild.remove();
  }

  /* ── State ── */
  let expanded = false;
  let chatHistory = [];
  let chatRequestInFlight = false;
  let pageActionQueue = Promise.resolve();

  function enqueuePageActions(actions) {
    pageActionQueue = pageActionQueue
      .then(() => executePageActions(actions))
      .catch(err => {
        addMiniMsg('agent', `⚠️ Action execution failed: ${err?.message || String(err)}`);
      });
    return pageActionQueue;
  }

  async function callGatewayChat(payload, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 20000);
    const retries = Number(options.retries || 1);
    const endpoint = 'http://127.0.0.1:18789/api/chat';

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const raw = await resp.text();
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_) {
          data = { reply: raw || '' };
        }

        if (!resp.ok) {
          const msg = data?.error || data?.message || `HTTP ${resp.status}`;
          // Retry transient gateway/server errors.
          if (resp.status >= 500 && attempt < retries) {
            await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          throw new Error(msg);
        }

        return data;
      } catch (err) {
        lastError = err;
        const aborted = err?.name === 'AbortError';
        const transient = aborted || /network|failed to fetch|timeout/i.test(String(err?.message || err));
        if (attempt < retries && transient) {
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error('Gateway request failed');
  }

  /* ── FAB (Floating Action Button) ── */
  const fab = document.createElement('div');
  fab.id = 'ami-browser-fab';
  fab.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon32.png')}" alt="AMI Browser">`;
  document.documentElement.appendChild(fab);

  fab.addEventListener('click', () => {
    expanded ? hideMiniChat() : showMiniChat();
    expanded = !expanded;
  });

  /* ── Keyboard shortcut: Ctrl+Shift+A ── */
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      expanded ? hideMiniChat() : showMiniChat();
      expanded = !expanded;
    }
    if (e.key === 'Escape' && expanded) {
      hideMiniChat();
      expanded = false;
    }
  });

  /* ── Show mini chat panel ── */
  function showMiniChat() {
    let panel = document.getElementById('ami-browser-mini');
    if (panel) { panel.style.display = 'flex'; focusInput(); return; }

    panel = document.createElement('div');
    panel.id = 'ami-browser-mini';
    panel.innerHTML = `
      <div class="csm-header">
        <div class="csm-header-left">
          <img src="${chrome.runtime.getURL('icons/icon16.png')}" alt="" class="csm-logo">
          <span>AMI Agent</span>
          <span class="csm-skill-count"></span>
        </div>
        <div class="csm-header-btns">
          <button id="csm-hub" title="Open AMI Hub (full page)">⬡</button>
          <button id="csm-context" title="Send page context">📄</button>
          <button id="csm-extract" title="Extract page data">📋</button>
          <button id="csm-close" title="Close (Esc)">&times;</button>
        </div>
      </div>
      <div id="csm-suggestions">
        <button class="csm-chip" data-cmd="summarize this page">Summarize page</button>
        <button class="csm-chip" data-cmd="extract links">Extract links</button>
        <button class="csm-chip" data-cmd="extract emails">Find emails</button>
        <button class="csm-chip" data-cmd="fill form">Fill form</button>
        <button class="csm-chip" data-cmd="screenshot">Screenshot</button>
        <button class="csm-chip" data-cmd="extract text">Read page</button>
      </div>
      <div id="csm-messages"></div>
      <div class="csm-composer">
        <input id="csm-input" type="text" placeholder="Ask AMI Agent… (Ctrl+Shift+A)">
        <button id="csm-send" title="Send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;
    document.documentElement.appendChild(panel);

    // Event listeners
    document.getElementById('csm-close').addEventListener('click', () => { hideMiniChat(); expanded = false; });
    document.getElementById('csm-send').addEventListener('click', miniSend);
    document.getElementById('csm-input').addEventListener('keydown', e => { if (e.key === 'Enter') miniSend(); });
    document.getElementById('csm-hub').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'open-hub' });
    });
    document.getElementById('csm-context').addEventListener('click', sendPageContext);
    document.getElementById('csm-extract').addEventListener('click', () => miniSendText('extract text'));

    // Skill suggestion chips
    panel.querySelectorAll('.csm-chip').forEach(chip => {
      chip.addEventListener('click', () => miniSendText(chip.dataset.cmd));
    });

    // Load skill count
    fetchSkillCount();

    // Load recent chat history from shared storage (synced with hub)
    loadSharedHistory();
    focusInput();
  }

  function loadSharedHistory() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    // Initialize Google auth session monitoring
    if (isGoogleLoginPage()) {
      suggestStaySignedIn();
    }
    if (isGoogleSheetsPage()) {
      ensureSessionPersistence();
      monitorAuthStateChanges();
    }

    chrome.storage.local.get('ami_chat_history', data => {
      const history = data.ami_chat_history || [];
      // Show the last 10 messages from hub for context continuity
      const recent = history.slice(-10);
      if (recent.length > 0) {
        const msgs = document.getElementById('csm-messages');
        if (msgs) msgs.innerHTML = ''; // clear greeting
        chatHistory = [];
        recent.forEach(m => {
          addMiniMsg(m.role === 'assistant' ? 'agent' : m.role, m.text, true);
        });
        addMiniMsg('agent', `💬 Showing last ${recent.length} messages from hub. ${getPageSummary()}`, true);
      } else {
        addMiniMsg('agent', `Hi! I'm AMI Agent on this page. Ask me to extract data, fill forms, automate actions, or anything else. ${getPageSummary()}`, true);
      }
    });
  }

  function hideMiniChat() {
    const p = document.getElementById('ami-browser-mini');
    if (p) p.style.display = 'none';
  }

  function focusInput() {
    setTimeout(() => {
      const input = document.getElementById('csm-input');
      if (input) input.focus();
    }, 100);
  }

  /* ── Page context helpers ── */
  function getPageSummary() {
    const title = document.title || '';
    const desc = document.querySelector('meta[name="description"]')?.content || '';
    const url = location.href;
    return `\n\n📍 **Current page:** ${title}\n${desc ? desc.slice(0, 100) + '…' : url}`;
  }

  function getPageContext() {
    const title = document.title;
    const url = location.href;
    const desc = document.querySelector('meta[name="description"]')?.content || '';
    const selected = window.getSelection()?.toString() || '';
    const headings = [...document.querySelectorAll('h1, h2, h3')].slice(0, 10).map(h => h.textContent.trim());
    const forms = document.querySelectorAll('form').length;
    const links = document.querySelectorAll('a[href]').length;
    const images = document.querySelectorAll('img').length;

    return { title, url, desc, selected, headings, forms, links, images };
  }

  function sendPageContext() {
    const ctx = getPageContext();
    let text = `📍 **Page Context:**\n`;
    text += `Title: ${ctx.title}\nURL: ${ctx.url}\n`;
    if (ctx.desc) text += `Description: ${ctx.desc}\n`;
    if (ctx.selected) text += `\nSelected text: "${ctx.selected.slice(0, 200)}"\n`;
    if (ctx.headings.length) text += `\nHeadings: ${ctx.headings.join(' | ')}\n`;
    text += `\nForms: ${ctx.forms} | Links: ${ctx.links} | Images: ${ctx.images}`;
    addMiniMsg('agent', text);
  }

  async function fetchSkillCount() {
    try {
      const resp = await fetch('http://127.0.0.1:18789/api/skills');
      const data = await resp.json();
      const badge = document.querySelector('.csm-skill-count');
      if (badge) badge.textContent = `${data.total} skills`;
    } catch { /* gateway offline */ }
  }

  /* ── Chat helpers ── */
  function addMiniMsg(role, text, skipStorage) {
    const msgs = document.getElementById('csm-messages');
    if (!msgs) return;
    const d = document.createElement('div');
    d.className = `csm-msg csm-${role}`;
    d.innerHTML = formatMiniText(text);
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    chatHistory.push({ role, text });

    // Sync to shared storage so hub sees FAB messages too
    if (!skipStorage && typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get('ami_chat_history', data => {
        const history = data.ami_chat_history || [];
        history.push({ role: role === 'agent' ? 'agent' : role, text, ts: Date.now() });
        // Keep last 100 messages
        const trimmed = history.slice(-100);
        chrome.storage.local.set({ ami_chat_history: trimmed });
      });
    }
  }

  function formatMiniText(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
      .replace(/\n/g, '<br>');
  }

  function fabAutoRemember(userMsg, agentReply) {
    const trivial = /^(hi|hello|hey|thanks|ok|yes|no|bye|sure|got it)\b/i;
    if (trivial.test(userMsg.trim()) && agentReply.length < 120) return;
    if (/^⚠|^Gateway|^Error/i.test(agentReply)) return;
    const pageUrl = location.href;
    const summary = `[${document.title.slice(0, 60)}] Q: ${userMsg.slice(0, 200)}\nA: ${agentReply.slice(0, 300)}`;
    chrome.storage.local.get('ami_memory', d => {
      let mem = d.ami_memory || [];
      if (mem.length && mem[mem.length - 1].text && mem[mem.length - 1].text.includes(userMsg.slice(0, 50))) return;
      mem.push({ text: summary, ts: Date.now(), source: 'auto-fab', url: pageUrl });
      if (mem.length > 500) mem = mem.slice(-500);
      chrome.storage.local.set({ ami_memory: mem });
    });
  }

  function miniSendText(text) {
    const input = document.getElementById('csm-input');
    if (input) { input.value = text; miniSend(); }
  }

  function miniSend() {
    const input = document.getElementById('csm-input');
    const text = input.value.trim();
    if (!text) return;
    if (chatRequestInFlight) {
      addMiniMsg('agent', '⏳ A request is already running. Please wait for it to finish.');
      return;
    }
    input.value = '';
    chatRequestInFlight = true;

    addMiniMsg('user', text);

    // Send page context along with the message for smarter responses
    const ctx = getPageContext();
    const payload = {
      message: text,
      source: 'fab',
      history: chatHistory.slice(-20).map(m => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.text,
      })),
      pageContext: {
        title: ctx.title,
        url: ctx.url,
        selected: ctx.selected,
        headings: ctx.headings,
        forms: ctx.forms,
        links: ctx.links,
      }
    };

    // Show typing indicator
    const msgs = document.getElementById('csm-messages');
    const typing = document.createElement('div');
    typing.className = 'csm-msg csm-agent csm-typing';
    typing.innerHTML = '<span class="csm-dots"><span>.</span><span>.</span><span>.</span></span>';
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;

    callGatewayChat(payload, { timeoutMs: 20000, retries: 1 })
    .then(async data => {
      typing.remove();
      const reply = data.reply || data.message || JSON.stringify(data);
      addMiniMsg('agent', reply);

      // Execute any returned actions on the page
      if (data.actions) await enqueuePageActions(data.actions);

      // Auto-memory: save exchange to local memory
      fabAutoRemember(text, reply);
    })
    .catch(err => {
      typing.remove();
      addMiniMsg('agent', `⚠️ Gateway request failed: ${err?.message || 'offline/unreachable'}`);
    })
    .finally(() => {
      chatRequestInFlight = false;
    });
  }

  function isGoogleSheetsPage() {
    return location.hostname === 'docs.google.com' && location.pathname.includes('/spreadsheets');
  }

  function isExcelWebPage() {
    const host = location.hostname;
    return host.includes('excel.office.com') || host.includes('office.live.com');
  }

  function isSpreadsheetPage() {
    return isGoogleSheetsPage() || isExcelWebPage();
  }

  /* ══════════════════════════════════════
     Google Sheets Authentication & Session Persistence
     ══════════════════════════════════════ */

  function isGoogleLoginPage() {
    return location.hostname === 'accounts.google.com';
  }

  function isGoogleSheetAuthenticated() {
    // Check if user is logged into Google Sheets by looking for auth-dependent elements
    // 1. User profile button exists (top-right corner)
    const profileBtn = document.querySelector('[aria-label*="Google Account"], [data-tooltip*="Account"]');
    if (profileBtn) return true;

    // 2. Check for presence of sheets toolbar (which only shows when authenticated)
    const sheetsToolbar = document.querySelector('[role="toolbar"], .goog-menu-button');
    if (isGoogleSheetsPage() && sheetsToolbar) return true;

    // 3. Check if we can access file menu (sheets-specific auth check)
    const fileMenu = document.querySelector('[aria-label="File"]');
    if (isGoogleSheetsPage() && fileMenu) return true;

    // 4. If on Google Sheets but no authenticated indicators found, likely logged out
    if (isGoogleSheetsPage()) {
      const noAuthRedirects = document.querySelector('[href*="accounts.google.com"], [href*="/signin"]');
      return !noAuthRedirects;
    }

    return false;
  }

  function hasGoogleSheetSignInBlocker() {
    if (!isGoogleSheetsPage()) return false;
    const signInButton = document.querySelector('a[href*="accounts.google.com"], button[aria-label*="Sign in" i], [role="button"][aria-label*="Sign in" i]');
    const signedOutText = [...document.querySelectorAll('div, span, p, h1, h2')].some(el => {
      const text = (el.textContent || '').trim();
      return text === 'Signed out' || /You have been signed out\./i.test(text);
    });
    return !!signInButton || signedOutText;
  }

  function suggestStaySignedIn() {
    // On Google login page, suggest "Stay signed in" to maintain sessions
    if (!isGoogleLoginPage()) return;

    const staySignedCheckbox = document.querySelector('input[name="TL_stay_signed_in"], input[aria-label*="Stay signed in"]');
    if (staySignedCheckbox && !staySignedCheckbox.checked) {
      devLog('Google: Found "Stay signed in" option. Checking it for session persistence...');
      staySignedCheckbox.click();
      addMiniMsg('agent', '✅ Enabled "Stay signed in" on Google. You will remain logged in even after closing the browser.');
    }

    // Store that we've seen a Google login and should monitor auth state
    chrome.storage.local.set({ 'ami_google_auth_time': Date.now() });
  }

  function ensureSessionPersistence() {
    // Called on Google Sheets pages to ensure session is durable
    if (!isGoogleSheetsPage()) return;

    const isAuthenticated = isGoogleSheetAuthenticated();
    chrome.storage.local.get('ami_google_auth_status', data => {
      const wasAuthenticated = data.ami_google_auth_status?.authenticated;

      if (isAuthenticated && !wasAuthenticated) {
        // Just logged in - store this state
        chrome.storage.local.set({ ami_google_auth_status: { authenticated: true, timestamp: Date.now() } });
        devLog('✅ Google Sheets auth detected and stored in session');
      } else if (!isAuthenticated && wasAuthenticated) {
        // Was logged in but now logged out (e.g., after browser close)
        devLog('⚠️ Google Sheets session lost. User will need to re-login.');
        chrome.storage.local.set({ ami_google_auth_status: { authenticated: false, timestamp: Date.now() } });

        // Show helpful message to user
        addMiniMsg('agent',
          '🔐 Your Google Sheets session has expired. Please log back in:\n' +
          '1. Click your profile icon (top-right)\n' +
          '2. Sign in with your Google account\n' +
          '3. Check "Stay signed in" to keep the session longer\n' +
          '4. Return here and retry your task'
        );
      }
    });
  }

  function monitorAuthStateChanges() {
    // Watch for Google authentication state changes on the page
    if (!isGoogleSheetsPage() && !isGoogleLoginPage()) return;

    // Periodically check auth state and log changes
    setInterval(() => {
      const isAuth = isGoogleSheetAuthenticated();
      chrome.storage.local.get('ami_google_auth_status', data => {
        const stored = data.ami_google_auth_status?.authenticated;
        if (isAuth !== stored) {
          ensureSessionPersistence();
        }
      });
    }, 5000); // Check every 5 seconds

    // Also check on critical DOM changes (login/logout happened)
    const observer = new MutationObserver(() => {
      ensureSessionPersistence();
    });

    // Observe profile area and dialog changes
    const profileArea = document.querySelector('[aria-label*="Account"], [aria-label*="Profile"]');
    if (profileArea) {
      observer.observe(profileArea, { attributes: true, childList: true, subtree: true });
    }

    // Listen for Google's internal sign-out events
    window.addEventListener('storage', (e) => {
      if (e.key?.includes('goog') || e.key?.includes('auth')) {
        ensureSessionPersistence();
      }
    });
  }

  function isVisibleEl(el) {
    return !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  }

  function getSpreadsheetSelectedCell() {
    const selected = document.querySelector('[role="gridcell"][aria-selected="true"]');
    return isVisibleEl(selected) ? selected : null;
  }

  function setMiniComposerLocked(locked) {
    const input = document.getElementById('csm-input');
    const send = document.getElementById('csm-send');
    const panel = document.getElementById('ami-browser-mini');
    if (input) {
      input.disabled = !!locked;
      if (locked) input.blur();
    }
    if (send) send.disabled = !!locked;
    if (panel) {
      panel.style.pointerEvents = locked ? 'none' : '';
      panel.style.opacity = locked ? '0.86' : '';
    }
  }

  function prepareSpreadsheetTypingFocus() {
    // Blur any focused element in the content script (chat input, buttons, etc.)
    // The actual cell focus is handled via trusted CDP mouse click in background.js,
    // because content-script clicks don't reliably transfer OS keyboard focus
    // to Google Sheets' canvas-based grid.
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') active.blur();
  }

  function dispatchSpreadsheetCommit(target) {
    const events = [
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }),
      new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }),
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }),
    ];
    for (const event of events) {
      try { (target || document).dispatchEvent(event); } catch (_) { /* ignore */ }
      try { document.dispatchEvent(event); } catch (_) { /* ignore */ }
    }
  }

  function autoSelectSpreadsheetStartCell() {
    const already = getSpreadsheetSelectedCell();
    if (already) return already;

    // Prefer A2 so we start below headers for typical tabular sheets.
    const preferred = [
      '[role="gridcell"][aria-label^="A2"]',
      '[role="gridcell"][aria-label*="A2"]',
      '[role="gridcell"][data-row="1"][data-col="0"]',
    ];
    for (const sel of preferred) {
      const el = document.querySelector(sel);
      if (isVisibleEl(el)) {
        el.click();
        return el;
      }
    }

    // Fallback: first visible gridcell that is not row 1.
    const cells = [...document.querySelectorAll('[role="gridcell"]')].filter(isVisibleEl);
    const fallback = cells.find(c => {
      const label = (c.getAttribute('aria-label') || '').toUpperCase();
      return !/^[A-Z]+1\b/.test(label);
    }) || cells[0] || null;
    if (fallback) fallback.click();
    return fallback;
  }

  /* ── Write a single value into the currently selected Google Sheets / Excel cell ──
     Google Sheets ignores el.value assignments and generic input/change events.
     The only reliable path is:
       1. Focus the formula bar (#t-formula-bar-input in Sheets)
       2. Select all existing content
       3. document.execCommand('insertText') — this goes through the browser's
          real text-input pipeline which Sheets listens to
       4. Dispatch Enter on document (not the element) to commit + auto-advance row
  ── */
  async function writeToCurrentSheetCell(value) {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const str = String(value);

    // ── Google Sheets: formula bar textarea ──
    // Try all known selectors for the formula bar input
    const formulaBarSelectors = [
      '#t-formula-bar-input',
      'textarea[id^="t-formula-bar"]',
      '[aria-label="Formula bar"]',
      '[aria-label="formula bar"]',
      'textarea[aria-label*="formula" i]',
      'input[aria-label*="formula" i]',
    ];
    let formulaBar = null;
    for (const sel of formulaBarSelectors) {
      const el = document.querySelector(sel);
      if (isVisibleEl(el)) { formulaBar = el; break; }
    }

    if (formulaBar) {
      formulaBar.click();
      formulaBar.focus();
      await sleep(60);
      // Select all existing text so insertText replaces it
      if (typeof formulaBar.select === 'function') formulaBar.select();
      else formulaBar.setSelectionRange(0, (formulaBar.value || formulaBar.textContent || '').length);
      // execCommand('insertText') fires the real input event pipeline that Sheets responds to
      const inserted = document.execCommand('insertText', false, str);
      if (!inserted || formulaBar.value !== str) {
        devLog('writeToCurrentSheetCell: execCommand failed, falling back to InputEvent');
        formulaBar.value = str;
        formulaBar.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: str }));
        formulaBar.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await sleep(60);
      dispatchSpreadsheetCommit(formulaBar);
      await sleep(260);
      return true;
    }

    // ── Fallback: In-cell rich text editor (appears after dblclick) ──
    const richEditor = document.querySelector('#waffle-rich-text-editor');
    if (isVisibleEl(richEditor)) {
      richEditor.click();
      richEditor.focus();
      await sleep(60);
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, str);
      await sleep(60);
      dispatchSpreadsheetCommit(richEditor);
      await sleep(260);
      return true;
    }

    // ── Last resort: click cell, wait for formula bar to appear, then write ──
    const cell = getSpreadsheetSelectedCell();
    if (cell) {
      cell.click();
      await sleep(120);
      for (const sel of formulaBarSelectors) {
        const fb = document.querySelector(sel);
        if (isVisibleEl(fb)) {
          fb.click(); fb.focus();
          await sleep(50);
          if (typeof fb.select === 'function') fb.select();
          document.execCommand('insertText', false, str);
          await sleep(60);
          if (fb.value !== str) {
            fb.value = str;
            fb.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: str }));
            fb.dispatchEvent(new Event('change', { bubbles: true }));
          }
          dispatchSpreadsheetCommit(fb);
          await sleep(260);
          return true;
        }
      }
    }

    devLog('writeToCurrentSheetCell: No writable input found');
    return false;
  }

  // Legacy wrapper — kept for the 'type' action handler
  async function typeIntoSpreadsheetCell(text) {
    const cell = getSpreadsheetSelectedCell();
    if (!cell) autoSelectSpreadsheetStartCell();
    return writeToCurrentSheetCell(text);
  }

  function parseDateValue(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = Number(m[3]);
      return new Date(y, mo - 1, d);
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      return new Date(y, mo - 1, d);
    }
    const parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDateValue(d, template) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear());
    if (String(template || '').includes('-')) return `${year}-${month}-${day}`;
    return `${day}/${month}/${year}`;
  }

  function fillSpreadsheetDateSeries(startDate, endDate, template) {
    const out = [];
    const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    if (s > e) return out;
    for (let cur = s; cur <= e; cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)) {
      out.push(formatDateValue(cur, template));
      if (out.length > 2000) break;
    }
    return out;
  }

  async function typeSpreadsheetSeries(values) {
    if (!Array.isArray(values) || !values.length) {
      addMiniMsg('agent', '⚠️ No values to fill in spreadsheet');
      return;
    }

    if (isGoogleSheetsPage() && (!isGoogleSheetAuthenticated() || hasGoogleSheetSignInBlocker())) {
      addMiniMsg('agent', '⚠️ Google Sheets is signed out. Sign in first, wait for the sheet to reconnect, then retry the spreadsheet action.');
      return;
    }

    devLog(`typeSpreadsheetSeries: filling ${values.length} values`);
    setMiniComposerLocked(true);
    // Blur chat so it cannot intercept keystokes.
    prepareSpreadsheetTypingFocus();

    addMiniMsg('agent', `📝 Typing ${values.length} values into sheet…`);

    try {
      if (!getSpreadsheetSelectedCell()) autoSelectSpreadsheetStartCell();

      let filled = 0;
      for (const value of values) {
        const ok = await writeToCurrentSheetCell(value);
        if (!ok) break;
        filled++;
      }

      if (filled === values.length) {
        addMiniMsg('agent', `✅ Filled all ${filled} cells`);
        return;
      }

      if (filled > 0) {
        addMiniMsg('agent', `⚠️ Filled ${filled} of ${values.length} cells. Click the start cell and retry.`);
        return;
      }

      addMiniMsg('agent', '⚠️ Could not type into spreadsheet cells. Click the first target cell and retry.');
    } finally {
      setMiniComposerLocked(false);
    }
  }

  /* ── Execute actions on the current page ── */
  async function executePageActions(actions) {
    if (!Array.isArray(actions)) return;
    for (const action of actions) {
      switch (action.type) {
        case 'navigate':
          if (action.url) {
            // Store follow-up actions before navigating (same as hub.js)
            if (action.followUp && action.followUp.length > 0 && typeof chrome !== 'undefined' && chrome.storage) {
              devLog('FAB: Storing followUp actions before navigate:', JSON.stringify(action.followUp));
              chrome.storage.local.set({
                ami_pending_actions: { actions: action.followUp, url: action.url, ts: Date.now() }
              }, () => { window.location.href = action.url; });
            } else {
              window.location.href = action.url;
            }
          }
          break;
        case 'click': {
          const el = findElement(action.selector);
          if (el) { highlightElement(el); setTimeout(() => el.click(), 300); addMiniMsg('agent', `✅ Clicked: ${el.textContent?.trim().slice(0, 60) || action.selector}`); }
          else addMiniMsg('agent', `⚠️ Could not find element: "${action.selector}". Try being more specific or use a CSS selector.`);
          break;
        }
        case 'type': {
          const selectorText = String(action.selector || '').toLowerCase();
          const looksGenericInput = !selectorText || /input\[type=['"]text['"]\]|text input|input field|textbox|text field/.test(selectorText);

          if (isSpreadsheetPage() && looksGenericInput) {
            const ok = await typeIntoSpreadsheetCell(action.text || '');
            if (ok) addMiniMsg('agent', '✅ Typed into spreadsheet cell');
            else addMiniMsg('agent', '⚠️ Could not type into spreadsheet cell. Click a target cell and retry.');
            break;
          }

          const el = findElement(action.selector);
          if (el) {
            highlightElement(el);
            el.focus();
            if ('value' in el) el.value = action.text;
            else el.textContent = action.text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            addMiniMsg('agent', `✅ Typed into: ${action.selector}`);
          }
          else addMiniMsg('agent', `⚠️ Could not find input: "${action.selector}"`);
          break;
        }
        case 'spreadsheet-fill-values': {
          if (!isSpreadsheetPage()) {
            addMiniMsg('agent', '⚠️ Spreadsheet fill works on Google Sheets or Excel Web pages only.');
            break;
          }
          const vals = action.values;
          if (!Array.isArray(vals) || !vals.length) {
            addMiniMsg('agent', '⚠️ No values provided for spreadsheet fill.');
            break;
          }
          await typeSpreadsheetSeries(vals);
          break;
        }
        case 'spreadsheet-fill-dates': {
          if (!isSpreadsheetPage()) {
            addMiniMsg('agent', '⚠️ Spreadsheet fill works on Google Sheets or Excel Web pages only.');
            break;
          }
          const s = parseDateValue(action.startDate);
          const e = parseDateValue(action.endDate);
          if (!s || !e) {
            addMiniMsg('agent', `⚠️ Invalid date range: ${action.startDate} → ${action.endDate}`);
            break;
          }
          const values = fillSpreadsheetDateSeries(s, e, action.startDate || '');
          if (!values.length) {
            addMiniMsg('agent', `⚠️ Start date must be <= end date: ${action.startDate} → ${action.endDate}`);
            break;
          }
          addMiniMsg('agent', `📅 Filling ${values.length} dates from ${values[0]} to ${values[values.length - 1]}`);
          await typeSpreadsheetSeries(values);
          break;
        }
        case 'scroll':
          window.scrollBy(0, action.y || 300);
          break;
        case 'scroll-to':
          window.scrollTo(0, action.y || 0);
          break;
        case 'highlight': {
          const el = findElement(action.selector);
          if (el) highlightElement(el);
          break;
        }
        case 'extract-text': {
          const text = document.body.innerText.slice(0, 3000);
          addMiniMsg('agent', `📄 Page text (first 3000 chars):\n\`\`\`\n${text}\n\`\`\``);
          break;
        }
        case 'extract-links': {
          const links = [...document.querySelectorAll('a[href]')].slice(0, 50).map(a => `${a.textContent.trim().slice(0, 50)} → ${a.href}`);
          addMiniMsg('agent', `🔗 Links found (${links.length}):\n${links.join('\n')}`);
          break;
        }
        case 'extract-emails': {
          const text = document.body.innerText;
          const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])];
          addMiniMsg('agent', emails.length ? `📧 Emails found: ${emails.join(', ')}` : '📧 No emails found on this page');
          break;
        }
        case 'extract-images': {
          const imgs = [...document.querySelectorAll('img[src]')].slice(0, 20).map(i => i.src);
          addMiniMsg('agent', `🖼️ Images found (${imgs.length}):\n${imgs.join('\n')}`);
          break;
        }
        case 'extract-table': {
          const table = document.querySelector('table');
          if (!table) { addMiniMsg('agent', 'No table found on this page'); break; }
          const rows = [...table.querySelectorAll('tr')].slice(0, 20).map(tr =>
            [...tr.querySelectorAll('td, th')].map(c => c.textContent.trim()).join(' | ')
          );
          addMiniMsg('agent', `📊 Table data:\n${rows.join('\n')}`);
          break;
        }
        case 'extract-headings': {
          const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => `${h.tagName}: ${h.textContent.trim()}`);
          addMiniMsg('agent', headings.length ? `📑 Headings:\n${headings.join('\n')}` : 'No headings found');
          break;
        }
        case 'extract-meta': {
          const meta = {
            title: document.title,
            description: document.querySelector('meta[name="description"]')?.content || '',
            keywords: document.querySelector('meta[name="keywords"]')?.content || '',
            author: document.querySelector('meta[name="author"]')?.content || '',
            canonical: document.querySelector('link[rel="canonical"]')?.href || '',
          };
          addMiniMsg('agent', `🏷️ Metadata:\n${Object.entries(meta).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join('\n')}`);
          break;
        }
        case 'extract-prices': {
          const text = document.body.innerText;
          const prices = [...new Set(text.match(/[$€£¥][\d,.]+|\d+[.,]\d{2}\s*(?:USD|EUR|GBP|ETH|BTC)/gi) || [])];
          addMiniMsg('agent', prices.length ? `💰 Prices found: ${prices.join(', ')}` : '💰 No prices found');
          break;
        }
        case 'extract-phones': {
          const text = document.body.innerText;
          const phones = [...new Set(text.match(/(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [])];
          addMiniMsg('agent', phones.length ? `📱 Phones found: ${phones.join(', ')}` : '📱 No phone numbers found');
          break;
        }
        case 'extract-selected': {
          const sel = window.getSelection()?.toString();
          addMiniMsg('agent', sel ? `Selected: "${sel}"` : 'No text selected');
          break;
        }
        case 'extract-forms': {
          const forms = [...document.querySelectorAll('form')];
          if (!forms.length) { addMiniMsg('agent', 'No forms found'); break; }
          const info = forms.map((f, i) => {
            const inputs = [...f.querySelectorAll('input, select, textarea')].map(inp =>
              `  ${inp.tagName.toLowerCase()}[name="${inp.name || ''}"] type="${inp.type || ''}" placeholder="${inp.placeholder || ''}"`
            );
            return `Form ${i + 1} (${f.action || 'no action'}):\n${inputs.join('\n')}`;
          });
          addMiniMsg('agent', `📝 Forms:\n${info.join('\n\n')}`);
          break;
        }
        case 'fill-form': {
          const forms = document.querySelectorAll('form');
          if (!forms.length) { addMiniMsg('agent', 'No form found to fill'); break; }
          // Auto-fill visible inputs — try explicit data first, then persona
          chrome.storage.local.get('ami_persona', d => {
            const persona = d.ami_persona || {};
            const fieldMap = {
              name: ['name', 'full_name', 'fullname', 'your-name', 'customer_name'],
              firstName: ['first_name', 'firstname', 'fname', 'given-name', 'prenom'],
              lastName: ['last_name', 'lastname', 'lname', 'family-name', 'nom'],
              email: ['email', 'e-mail', 'mail', 'your-email', 'customer_email'],
              phone: ['phone', 'tel', 'telephone', 'mobile', 'cell'],
              company: ['company', 'organization', 'org', 'business'],
              address: ['address', 'street', 'addr', 'address1'],
              city: ['city', 'town', 'locality'],
              zip: ['zip', 'postal', 'postcode', 'zipcode'],
              country: ['country', 'nation'],
              website: ['website', 'url', 'site', 'homepage'],
            };
            let filled = 0;
            forms[0].querySelectorAll('input, select, textarea').forEach(inp => {
              if (inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button') return;
              if (inp.value) return;
              const key = (inp.name || inp.id || inp.placeholder || '').toLowerCase();
              const autocomp = (inp.autocomplete || '').toLowerCase();
              // Try explicit data first
              if (action.data && typeof action.data === 'object' && action.data[inp.name]) {
                inp.value = action.data[inp.name];
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                highlightElement(inp);
                filled++;
                return;
              }
              // Then try persona data
              for (const [field, aliases] of Object.entries(fieldMap)) {
                if (persona[field] && (aliases.some(a => key.includes(a)) || autocomp.includes(field))) {
                  inp.value = persona[field];
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                  highlightElement(inp);
                  filled++;
                  break;
                }
              }
            });
            addMiniMsg('agent', filled ? `✅ Filled ${filled} fields` : (() => {
              const hasPersona = Object.values(persona).filter(Boolean).length > 0;
              if (!hasPersona) {
                const personaUrl = chrome.runtime.getURL('persona.html');
                return `Form detected but no persona data. <a href="${personaUrl}" target="_blank" style="color:#7c3aed;font-weight:600">Set up your Persona</a> to enable auto-filling.`;
              }
              return 'Form detected but no fields matched your persona data.';
            })());
          });
          break;
        }
        case 'run-js': {
          // Sandboxed execution - only report result, don't eval arbitrary code from network
          addMiniMsg('agent', '⚠️ Direct JS execution is restricted for security. Use specific action types instead.');
          break;
        }
        case 'submit': {
          const form = document.querySelector('form');
          if (form) { form.submit(); addMiniMsg('agent', 'Form submitted'); }
          else addMiniMsg('agent', 'No form found');
          break;
        }
        case 'hover': {
          const el = findElement(action.selector);
          if (el) { highlightElement(el); el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }
          break;
        }
        case 'select': {
          const el = findElement(action.selector);
          if (el && el.tagName === 'SELECT') {
            el.value = action.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            highlightElement(el);
          }
          break;
        }
        case 'summarize-page': {
          const text = document.body.innerText.slice(0, 5000);
          addMiniMsg('agent', `Sending page text to AI for summary…`);
          try {
            const d = await callGatewayChat({ message: `Summarize this page content:\n\n${text}`, source: 'fab-summarize' }, { timeoutMs: 25000, retries: 1 });
            addMiniMsg('agent', d.reply || d.message || 'Could not summarize');
          } catch (err) {
            addMiniMsg('agent', `⚠️ Gateway request failed: ${err?.message || 'offline/unreachable'}`);
          }
          break;
        }
        case 'open-hub': {
          chrome.runtime.sendMessage({ type: 'open-hub' });
          break;
        }
        case 'screenshot': {
          chrome.runtime.sendMessage({ type: 'screenshot' }, resp => {
            if (resp?.dataUrl) {
              addMiniMsg('agent', '📸 Screenshot captured!');
              // Show inline preview and download link
              const img = document.createElement('img');
              img.src = resp.dataUrl;
              img.style.cssText = 'max-width:100%;border-radius:8px;margin:4px 0;cursor:pointer';
              img.title = 'Click to download';
              img.addEventListener('click', () => {
                const a = document.createElement('a');
                a.href = resp.dataUrl;
                a.download = `ami-screenshot-${Date.now()}.png`;
                a.click();
              });
              const msgs = document.getElementById('csm-messages');
              if (msgs) { msgs.appendChild(img); msgs.scrollTop = msgs.scrollHeight; }
            } else {
              addMiniMsg('agent', '⚠️ Could not capture screenshot. Make sure the page is fully loaded.');
            }
          });
          break;
        }
        case 'screenshot-element': {
          const el = findElement(action.selector);
          if (el) {
            highlightElement(el);
            addMiniMsg('agent', `📸 Highlighted element: ${action.selector}. Full element screenshot requires DevTools.`);
          } else {
            addMiniMsg('agent', `⚠️ Could not find element: "${action.selector}"`);
          }
          break;
        }
        case 'generate-file': {
          try {
            const blob = new Blob([action.content || ''], { type: action.mime || 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = action.filename || `ami-file-${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            addMiniMsg('agent', `💾 File generated: ${a.download}`);
          } catch (e) {
            addMiniMsg('agent', `⚠️ Could not generate file: ${e.message}`);
          }
          break;
        }
        case 'download': {
          if (action.url) {
            const a = document.createElement('a');
            a.href = action.url;
            a.download = action.filename || '';
            a.target = '_blank';
            a.click();
            addMiniMsg('agent', `⬇️ Download started: ${action.filename || action.url}`);
          }
          break;
        }
        case 'copy': {
          const text = action.text || '';
          navigator.clipboard.writeText(text).then(
            () => addMiniMsg('agent', `📋 Copied to clipboard`),
            () => addMiniMsg('agent', `⚠️ Could not copy to clipboard`)
          );
          break;
        }
        case 'wait': {
          const ms = action.ms || action.duration || 1000;
          addMiniMsg('agent', `⏳ Waiting ${ms}ms…`);
          break;
        }
        case 'remember': {
          chrome.storage.local.get('ami_memory', d => {
            const mem = d.ami_memory || [];
            mem.push({ text: action.text, ts: Date.now(), source: location.hostname });
            chrome.storage.local.set({ ami_memory: mem });
            addMiniMsg('agent', `🧠 Remembered: "${action.text}"`);
          });
          break;
        }
        case 'recall': {
          chrome.storage.local.get('ami_memory', d => {
            const mem = d.ami_memory || [];
            if (!mem.length) { addMiniMsg('agent', '🧠 No memories stored yet.'); return; }
            const q = (action.query || '').toLowerCase();
            const list = q ? mem.filter(m => m.text.toLowerCase().includes(q)) : mem.slice(-15);
            addMiniMsg('agent', `🧠 Memories (${list.length}):\n${list.map(m => `• ${m.text}`).join('\n')}`);
          });
          break;
        }
        case 'auto-fill': {
          // Use persona data from storage for smart form filling
          chrome.storage.local.get('ami_persona', d => {
            const persona = d.ami_persona || {};
            if (!Object.values(persona).filter(Boolean).length) {
              const personaUrl = chrome.runtime.getURL('persona.html');
              addMiniMsg('agent', `👤 No persona set up yet. <a href="${personaUrl}" target="_blank" style="color:#7c3aed;font-weight:600">Set up your Persona</a> first so I can auto-fill forms for you.`);
              return;
            }
            const forms = document.querySelectorAll('form');
            if (!forms.length) { addMiniMsg('agent', '⚠️ No forms found on this page'); return; }
            let filled = 0;
            const fieldMap = {
              name: ['name', 'full_name', 'fullname', 'your-name', 'username', 'customer_name'],
              firstName: ['first_name', 'firstname', 'fname', 'given-name', 'prenom'],
              lastName: ['last_name', 'lastname', 'lname', 'family-name', 'nom'],
              email: ['email', 'e-mail', 'mail', 'your-email', 'customer_email'],
              phone: ['phone', 'tel', 'telephone', 'mobile', 'cell', 'your-phone'],
              company: ['company', 'organization', 'org', 'business', 'employer'],
              jobTitle: ['job_title', 'jobtitle', 'title', 'position', 'role'],
              address: ['address', 'street', 'addr', 'address1', 'street_address'],
              city: ['city', 'town', 'locality'],
              zip: ['zip', 'postal', 'postcode', 'zipcode', 'zip_code'],
              country: ['country', 'nation'],
              website: ['website', 'url', 'site', 'homepage'],
            };
            forms.forEach(form => {
              form.querySelectorAll('input, textarea, select').forEach(inp => {
                if (inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button') return;
                if (inp.value) return;
                const key = (inp.name || inp.id || inp.placeholder || '').toLowerCase();
                const type = (inp.type || '').toLowerCase();
                const autocomp = (inp.autocomplete || '').toLowerCase();
                for (const [field, aliases] of Object.entries(fieldMap)) {
                  if (persona[field] && (aliases.some(a => key.includes(a)) || autocomp.includes(field) || type === field)) {
                    inp.value = persona[field];
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    highlightElement(inp);
                    filled++;
                    break;
                  }
                }
              });
            });
            addMiniMsg('agent', filled ? `✅ Auto-filled ${filled} fields from your persona profile` : 'No matching fields found. Set up your persona in AMI Hub settings.');
          });
          break;
        }
        case 'show-persona': {
          chrome.storage.local.get('ami_persona', d => {
            const p = d.ami_persona || {};
            const personaUrl = chrome.runtime.getURL('persona.html');
            if (!Object.keys(p).length || !Object.values(p).filter(Boolean).length) {
              addMiniMsg('agent', `👤 No persona set up yet. <a href="${personaUrl}" target="_blank" style="color:#7c3aed;font-weight:600">Set up your Persona</a> to enable auto-filling forms.`);
              return;
            }
            const lines = Object.entries(p).filter(([,v]) => v).map(([k,v]) => `**${k}:** ${v}`);
            addMiniMsg('agent', `👤 Your Persona:\n${lines.join('\n')}\n\n<a href="${personaUrl}" target="_blank" style="color:#7c3aed;font-size:11px">Edit Persona →</a>`);
          });
          break;
        }
      }
    }
  }

  /* ── DOM helpers ── */
  function findElement(selector) {
    if (!selector) return null;

    // 0. Handle Playwright-style "text=..." selectors from LLM
    if (typeof selector === 'string' && /^text=/i.test(selector)) {
      selector = selector.replace(/^text=/i, '').trim();
    }

    const host = location.hostname;

    // LLM sometimes emits Google-specific nth selector on YouTube pages.
    if (typeof selector === 'string' && host.includes('youtube.com')) {
      const gNth = selector.match(/^#search\s+\.g:nth-of-type\((\d+)\)\s+a$/i);
      if (gNth) {
        const n = Math.max(1, parseInt(gNth[1], 10) || 1);
        const ytCards = [...document.querySelectorAll('ytd-playlist-renderer, ytd-video-renderer, ytd-radio-renderer')]
          .filter(el => el.offsetParent !== null)
          .map(card => card.querySelector('a#video-title, a#thumbnail, a[href*="watch"], a[href*="playlist"]'))
          .filter(Boolean);
        if (ytCards[n - 1]) return ytCards[n - 1];
      }
    }

    // 1. Try CSS selector first
    try {
      const el = document.querySelector(selector);
      if (el) {
        if (isGoogleSheetsPage()) {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          if (el.id === 'docs-title-input' || aria.includes('rename')) {
            if (/input\[type=['"]text['"]\]|text input|input field|textbox/i.test(String(selector))) {
              const spreadsheetEditor = getSpreadsheetEditorCandidate();
              if (spreadsheetEditor && spreadsheetEditor !== el) return spreadsheetEditor;
            }
          }
        }
        return el;
      }
    } catch {}

    // 2. Handle coordinate-based clicking (from LLM: {x, y})
    if (typeof selector === 'object' && selector.x != null && selector.y != null) {
      return document.elementFromPoint(selector.x, selector.y);
    }

    // 3. Handle "nth result/link/item/playlist" patterns
    const nthMatch = selector.match(/(?:(\d+)(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\s*(?:result|link|item|entry|option|button|element|playlist)/i);
    if (nthMatch) {
      const ordinals = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };
      let n = nthMatch[1] ? parseInt(nthMatch[1]) : ordinals[nthMatch[0].split(/\s+/)[0].toLowerCase()] || 1;
      const wantPlaylist = /playlist/i.test(selector);

      // YouTube results (playlist/video cards)
      if (host.includes('youtube.com')) {
        const ytRenderers = wantPlaylist
          ? [...document.querySelectorAll('ytd-playlist-renderer, ytd-radio-renderer')]
          : [...document.querySelectorAll('ytd-playlist-renderer, ytd-video-renderer, ytd-radio-renderer')];
        const ytResults = ytRenderers
          .filter(el => el.offsetParent !== null)
          .map(card => card.querySelector('a#video-title, a#thumbnail, a[href*="watch"], a[href*="playlist"]'))
          .filter(Boolean);
        if (ytResults.length) {
          const idx = n === -1 ? ytResults.length - 1 : n - 1;
          if (ytResults[idx]) return ytResults[idx];
        }
      }

      // Google search results
      const googleResults = document.querySelectorAll('#search .g h3, #search .g a[href]:not([href^="javascript"]):not([role])');
      if (googleResults.length) {
        const idx = n === -1 ? googleResults.length - 1 : n - 1;
        if (googleResults[idx]) return googleResults[idx].closest('a') || googleResults[idx];
      }
      // Bing/DuckDuckGo results
      const bingResults = document.querySelectorAll('.b_algo h2 a, .result__a, .react-results--main a[data-testid]');
      if (bingResults.length) {
        const idx = n === -1 ? bingResults.length - 1 : n - 1;
        if (bingResults[idx]) return bingResults[idx];
      }
      // Generic: visible main links
      const mainLinks = document.querySelectorAll('main a[href], article a[href], .results a[href], [role="main"] a[href], #content a[href]');
      if (mainLinks.length) {
        const visible = [...mainLinks].filter(el => el.offsetParent !== null);
        const idx = n === -1 ? visible.length - 1 : n - 1;
        if (visible[idx]) return visible[idx];
      }
      // Fallback: body links excluding nav/header/footer
      const bodyLinks = [...document.querySelectorAll('body a[href]')].filter(
        el => el.offsetParent !== null && !el.closest('nav, header, footer, .nav, .header, .footer, [role="navigation"]')
      );
      if (bodyLinks.length) {
        const idx = n === -1 ? bodyLinks.length - 1 : n - 1;
        if (bodyLinks[idx]) return bodyLinks[idx];
      }
    }

    // 4. Exact text match on interactive elements (case-insensitive)
    const sLower = selector.toLowerCase().trim();
    const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [tabindex]');
    // Exact match first
    for (const el of interactive) {
      if (el.offsetParent === null) continue;
      const txt = (el.textContent || '').trim().toLowerCase();
      if (txt === sLower) return el;
    }
    // Contains match
    for (const el of interactive) {
      if (el.offsetParent === null) continue;
      const txt = (el.textContent || '').trim().toLowerCase();
      if (txt.includes(sLower)) return el;
      if (el.getAttribute('aria-label')?.toLowerCase().includes(sLower)) return el;
      if (el.getAttribute('title')?.toLowerCase().includes(sLower)) return el;
      if (el.getAttribute('data-tooltip')?.toLowerCase().includes(sLower)) return el;
      if (el.getAttribute('alt')?.toLowerCase().includes(sLower)) return el;
    }

    // 5. Try by placeholder, name, id, or label
    const inputs = document.querySelectorAll('input, textarea, select');
    for (const el of inputs) {
      if (el.offsetParent === null) continue;
      if (el.placeholder?.toLowerCase().includes(sLower)) return el;
      if (el.name?.toLowerCase().includes(sLower)) return el;
      if (el.id?.toLowerCase().includes(sLower)) return el;
    }
    // Check labels
    const labels = document.querySelectorAll('label');
    for (const lbl of labels) {
      if (lbl.textContent.trim().toLowerCase().includes(sLower) && lbl.htmlFor) {
        const inp = document.getElementById(lbl.htmlFor);
        if (inp) return inp;
      }
    }

    // 6. Partial href match for links
    const links = document.querySelectorAll('a[href]');
    for (const el of links) {
      if (el.offsetParent === null) continue;
      if (el.href?.toLowerCase().includes(sLower)) return el;
    }

    // 7. DOM text-node search as last resort (visual OCR alternative)
    // Walks all visible text nodes to find elements containing the text
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        if (!node.parentElement || node.parentElement.offsetParent === null) return NodeFilter.FILTER_REJECT;
        const tag = node.parentElement.tagName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.toLowerCase().includes(sLower)) {
        const parent = walker.currentNode.parentElement;
        // Return the closest clickable ancestor, or the text node's parent
        return parent.closest('a, button, [role="button"], [onclick], [tabindex]') || parent;
      }
    }

    return null;
  }

  function highlightElement(el) {
    const prev = el.style.outline;
    const prevBg = el.style.backgroundColor;
    el.style.outline = '3px solid #c4b5fd';
    el.style.backgroundColor = 'rgba(196, 181, 253, 0.15)';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      el.style.outline = prev;
      el.style.backgroundColor = prevBg;
    }, 2000);
  }

  /* ══════════════════════════════════════
     Cookie consent auto-dismiss
     ══════════════════════════════════════ */
  function dismissCookieConsent() {
    devLog('Attempting to dismiss cookie consent...');
    // Common cookie consent button selectors across popular sites
    const selectors = [
      // YouTube / Google
      'button[aria-label="Accept all"]',
      'button[aria-label="Accept the use of cookies and other data for the purposes described"]',
      '[aria-label="Accept all"]',
      'form[action*="consent"] button[value="true"]',
      'tp-yt-paper-dialog #content .eom-buttons button.yt-spec-button-shape-next--filled',
      'button.yt-spec-button-shape-next--filled[aria-label*="Accept"]',
      '#yDmH0d button:last-of-type',  // Google consent
      // Generic consent patterns
      'button[id*="accept"]', 'button[id*="Accept"]',
      'button[class*="accept"]', 'button[class*="Accept"]',
      'a[id*="accept"]', 'a[class*="accept"]',
      '[data-testid="accept-button"]',
      '[data-testid*="cookie"] button',
      '.consent-bump button', '.consent-form button',
      '#CookieBoxSaveButton',
      '#onetrust-accept-btn-handler',
      '.cc-accept', '.cc-btn.cc-dismiss',
      '#didomi-notice-agree-button',
      '.cmpboxbtn.cmpboxbtnyes',
      '[class*="cookie"] button[class*="accept"]',
      '[class*="cookie"] button[class*="agree"]',
      '[class*="consent"] button[class*="accept"]',
      '[class*="consent"] button[class*="agree"]',
    ];

    for (const sel of selectors) {
      try {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetParent !== null) { // visible
          devLog(`Cookie consent found via selector: "${sel}" — clicking it`);
          btn.click();
          return true;
        }
      } catch (e) { /* invalid selector, skip */ }
    }

    // Fallback: search for buttons/links by text content
    const acceptTexts = ['accept all', 'accept cookies', 'i agree', 'agree', 'allow all', 'allow cookies', 'ok', 'got it', 'consent', 'accept & continue', 'accept and continue', 'agree and proceed'];
    const allButtons = [...document.querySelectorAll('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]')];
    for (const btn of allButtons) {
      const txt = (btn.textContent || btn.value || '').trim().toLowerCase();
      if (acceptTexts.some(at => txt === at || txt.includes(at)) && btn.offsetParent !== null) {
        devLog(`Cookie consent found by text: "${txt}" — clicking it`);
        btn.click();
        return true;
      }
    }

    devLog('No cookie consent dialog found');
    return false;
  }

  /* ══════════════════════════════════════
     Click first result (YouTube, Google, etc.)
     ══════════════════════════════════════ */
  function clickFirstResult() {
    devLog('Attempting to click first result on:', location.hostname);
    const host = location.hostname;
    const humanizedDelay = 1100 + Math.floor(Math.random() * 1100);

    // YouTube
    if (host.includes('youtube.com')) {
      // Try video renderer links
      const ytSelectors = [
        'ytd-video-renderer a#video-title',           // desktop search results
        'ytd-video-renderer h3 a',                     // alternate
        'a.ytd-video-renderer',                        // any video link
        '#contents ytd-video-renderer a#thumbnail',    // thumbnail click
        'ytd-item-section-renderer ytd-video-renderer a#video-title',
        '#dismissible a#video-title',
      ];
      for (const sel of ytSelectors) {
        const el = document.querySelector(sel);
        if (el && el.href) {
          devLog(`YouTube first result found: "${el.textContent?.trim().slice(0, 60)}" → ${el.href}`);
          highlightElement(el);
          setTimeout(() => el.click(), 500);
          return true;
        }
      }
      devLog('No YouTube video result found with known selectors');
      return false;
    }

    // Google
    if (host.includes('google.')) {
      const captchaDetected = !!document.querySelector('#captcha, form#captcha-form, div.g-recaptcha, iframe[src*="recaptcha"]');
      if (captchaDetected) {
        devLog('Google captcha detected; skipping automated click to avoid bot escalation');
        return false;
      }
      const googleCandidates = [...document.querySelectorAll('#search .g a, #rso .g a, .yuRUbf a')]
        .filter(a => {
          if (!a.href) return false;
          try { return !/google\./i.test(new URL(a.href).hostname); }
          catch { return false; }
        });
      const el = googleCandidates[0] || null;
      if (el) {
        devLog(`Google first result found: "${el.textContent?.trim().slice(0, 60)}" → ${el.href}`);
        highlightElement(el);
        setTimeout(() => el.click(), humanizedDelay);
        return true;
      }
      return false;
    }

    // Generic: click first major link in results area
    const generic = document.querySelector('main a[href], #content a[href], .results a[href], [role="main"] a[href]');
    if (generic) {
      devLog(`Generic first result: "${generic.textContent?.trim().slice(0, 60)}" → ${generic.href}`);
      highlightElement(generic);
      setTimeout(() => generic.click(), 500);
      return true;
    }
    return false;
  }

  /* ══════════════════════════════════════
     Pending actions: execute follow-up after navigation
     ══════════════════════════════════════ */
  function checkPendingActions() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('ami_pending_actions', data => {
      const pending = data.ami_pending_actions;
      if (!pending || !pending.actions || !pending.actions.length) return;

      // Expire stale pending actions (older than 60 seconds)
      if (Date.now() - pending.ts > 60000) {
        devLog('Pending actions expired (>60s), clearing');
        chrome.storage.local.remove('ami_pending_actions');
        return;
      }

      devLog('Found pending actions:', JSON.stringify(pending.actions));
      // Clear immediately to prevent re-execution on SPA navigations
      chrome.storage.local.remove('ami_pending_actions');

      // Execute each action with its specified delay
      pending.actions.forEach(action => {
        const delay = action.delay || 1000;
        devLog(`Scheduling action "${action.type}" with delay ${delay}ms`);

        setTimeout(() => {
          switch (action.type) {
            case 'dismiss-cookies':
              devLog('Executing: dismiss-cookies');
              dismissCookieConsent();
              // Retry once more after a short delay (some consents render late)
              setTimeout(() => dismissCookieConsent(), 1500);
              break;

            case 'click':
              devLog(`Executing: click "${action.selector}"`);
              if (action.selector === 'first result') {
                // Retry with increasing delays since SPA pages may render results late
                let attempts = 0;
                const tryClick = () => {
                  attempts++;
                  devLog(`clickFirstResult attempt ${attempts}`);
                  const clicked = clickFirstResult();
                  if (!clicked && attempts < 10) {
                    // Increasing delay: 1s, 1.5s, 2s, 2s, 2s...
                    const nextDelay = attempts < 3 ? 1000 + attempts * 500 : 2000;
                    setTimeout(tryClick, nextDelay);
                  } else if (!clicked) {
                    devLog('Failed to click first result after 10 attempts');
                  }
                };
                tryClick();
              } else {
                const el = findElement(action.selector);
                if (el) {
                  highlightElement(el);
                  setTimeout(() => el.click(), 300);
                } else {
                  devLog(`Could not find element: "${action.selector}"`);
                }
              }
              break;

            case 'type':
              devLog(`Executing: type in "${action.selector}": "${action.text}"`);
              const input = findElement(action.selector);
              if (input) {
                input.focus();
                input.value = action.text;
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
              break;

            default:
              devLog(`Unknown pending action type: "${action.type}"`);
          }
        }, delay);
      });
    });
  }

  // Listen for messages from background.js to execute actions
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'execute-pending-actions' && msg.actions) {
      devLog('Received pending actions from background:', JSON.stringify(msg.actions));
      msg.actions.forEach(action => {
        const delay = action.delay || 1000;
        setTimeout(() => {
          if (action.type === 'dismiss-cookies') dismissCookieConsent();
          else if (action.type === 'click' && action.selector === 'first result') clickFirstResult();
          else if (action.type === 'click') {
            const el = findElement(action.selector);
            if (el) el.click();
          }
        }, delay);
      });
      sendResponse({ ok: true });
    }
    return false;
  });

  // Check for pending actions when page loads
  devLog('Content script loaded on:', location.href);
  const shouldAutoDismissOnLoad = /(^|\.)youtube\.com$|(^|\.)google\./i.test(location.hostname);

  if (document.readyState === 'complete') {
    checkPendingActions();
    if (shouldAutoDismissOnLoad) {
      setTimeout(() => dismissCookieConsent(), 2000);
      setTimeout(() => dismissCookieConsent(), 5000); // retry for late-rendering dialogs
    }
  } else {
    window.addEventListener('load', () => {
      devLog('Page load complete, checking pending actions...');
      checkPendingActions();
      if (shouldAutoDismissOnLoad) {
        setTimeout(() => dismissCookieConsent(), 2000);
        setTimeout(() => dismissCookieConsent(), 5000); // retry for late-rendering dialogs
      }
    });
  }

  /* ══════════════════════════════════════
     Initialize Google Sheets Session Persistence
     ══════════════════════════════════════ */
  if (isGoogleSheetsPage()) {
    ensureSessionPersistence();
    monitorAuthStateChanges();
  }
  if (isGoogleLoginPage()) {
    suggestStaySignedIn();
  }

  /* ══════════════════════════════════════
     AMI Shield: YouTube ad auto-skip
     ══════════════════════════════════════ */
  if (location.hostname.includes('youtube.com')) {
    const skipAdSelectors = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      'button.ytp-skip-ad-button',
      '.ytp-ad-skip-button-slot button',
      '.ytp-ad-skip-button-slot',
      '.ytp-ad-overlay-close-button',
      'button[class*="skip-ad"]',
      '.videoAdUiSkipButton',
      // Newer YouTube ad UI (2024+)
      '.ytp-ad-skip-button-container button',
      '.ytp-ad-skip-button-container',
      'button.ytp-ad-skip-button-modern',
      '.ytp-preview-ad__link-button',
      '.ytp-skip-ad-button-text',
      '[id="skip-button:8"] button',
      '[id^="skip-button"] button',
      'button[id^="skip-button"]',
      '.ytp-ad-skip-button-modern.ytp-button',
      // 2025 YouTube button labels
      '[class*="SkipButton"]',
      '[class*="skip-button"]',
    ];

    // Detect if an ad indicator is present in the player
    const adIndicatorSelectors = [
      '.ytp-ad-player-overlay-layout',
      '.ytp-ad-simple-ad-badge',
      '.ytp-ad-duration-remaining',
      '.ytp-ad-skip-button-slot',
      '.ytp-ad-module',
      '.video-ads.ytp-ad-module',
      '.ytp-ad-skip-button-modern',
    ];

    function isAdPlaying() {
      return adIndicatorSelectors.some(s => {
        try { return !!document.querySelector(s); } catch { return false; }
      });
    }

    let lastAdCheckTs = 0;
    function trySkipAd() {
      const now = Date.now();
      if (now - lastAdCheckTs < 600) return false;
      lastAdCheckTs = now;

      if (!isAdPlaying()) return false;

      // 1. Try known CSS selectors — use isConnected + computedStyle instead of offsetParent
      for (const sel of skipAdSelectors) {
        try {
          const btn = document.querySelector(sel);
          if (btn && btn.isConnected) {
            const cs = getComputedStyle(btn);
            // Accept if not explicitly hidden; offsetParent check is unreliable inside fixed containers
            if (cs.display !== 'none' && cs.visibility !== 'hidden') {
              devLog('AMI Shield: Skipping YouTube ad via selector:', sel);
              btn.click();
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              return true;
            }
            // Even if computed style hidden, try clicking — YouTube sometimes hides then shows
            devLog('AMI Shield: Force-clicking potentially hidden skip btn:', sel);
            btn.click();
            return true;
          }
        } catch (e) { /* invalid selector */ }
      }

      // 2. Text-based fallback: find any button containing "Skip" text
      const playerArea = document.querySelector('.html5-video-player') || document.querySelector('#movie_player') || document.body;
      const candidates = playerArea.querySelectorAll('button, [role="button"], a.ytp-button, div[class*="skip"], span[class*="skip"]');
      for (const el of candidates) {
        const txt = (el.textContent || '').trim();
        if (/^skip/i.test(txt) && el.isConnected) {
          devLog('AMI Shield: Skipping YouTube ad via text match:', txt);
          el.click();
          return true;
        }
      }

      // 3. Last resort: seek video past the ad if it's a short unskippable ad
      try {
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (video && video.duration && !isNaN(video.duration) && video.duration > 0 && video.duration < 60) {
          devLog('AMI Shield: Seeking video to end to skip unskippable short ad, duration:', video.duration);
          video.currentTime = video.duration;
          return true;
        }
      } catch (e) { /* ignore */ }

      return false;
    }

    // Use MutationObserver to detect ad skip buttons as soon as they appear
    const adObserver = new MutationObserver(() => trySkipAd());
    const startObserving = () => {
      adObserver.observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      startObserving();
    } else {
      document.addEventListener('DOMContentLoaded', startObserving);
    }
    // Also poll periodically as a fallback (MutationObserver can miss some SPA transitions)
    setInterval(trySkipAd, 1500);
  }

})()
