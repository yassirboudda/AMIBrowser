/**
 * DevTools MCP Logger - Background Service Worker
 * 
 * Attaches to Chrome DevTools Protocol via chrome.debugger API,
 * captures all page events, and sends them to the MCP server's HTTP endpoint.
 */

const MCP_SERVER_URL = "http://127.0.0.1:9223";
const FLUSH_INTERVAL_MS = 1000; // Flush events every second
const MAX_BATCH_SIZE = 50;

// Track active debugging sessions: tabId -> { attached, eventBuffer, flushTimer }
const activeSessions = new Map();

// ─── Badge & Icon Management ───────────────────────────────────────────────────

function updateBadge(tabId, isActive) {
  if (isActive) {
    chrome.action.setBadgeText({ text: "REC", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#e53935", tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId });
  }
}

// ─── MCP Server Communication ──────────────────────────────────────────────────

async function sendToMcpServer(path, method, body) {
  try {
    const resp = await fetch(`${MCP_SERVER_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await resp.json();
  } catch (err) {
    console.error("[DevTools MCP Logger] Failed to send to MCP server:", err.message);
    return null;
  }
}

async function flushEvents(tabId) {
  const session = activeSessions.get(tabId);
  if (!session || session.eventBuffer.length === 0) return;

  const events = session.eventBuffer.splice(0, MAX_BATCH_SIZE);
  await sendToMcpServer("/events", "POST", {
    tabId: String(tabId),
    events,
  });
}

function startFlushTimer(tabId) {
  const session = activeSessions.get(tabId);
  if (!session) return;
  session.flushTimer = setInterval(() => flushEvents(tabId), FLUSH_INTERVAL_MS);
}

function stopFlushTimer(tabId) {
  const session = activeSessions.get(tabId);
  if (session?.flushTimer) {
    clearInterval(session.flushTimer);
    session.flushTimer = null;
  }
}

// ─── Event Recording ───────────────────────────────────────────────────────────

function recordEvent(tabId, category, type, data) {
  const session = activeSessions.get(tabId);
  if (!session) return;

  const event = {
    timestamp: new Date().toISOString(),
    type,
    category,
    data,
  };

  session.eventBuffer.push(event);

  // Also store in local journal for the popup
  if (!session.journal) session.journal = [];
  session.journal.push(event);

  // Keep journal capped at 5000 entries to prevent memory issues
  if (session.journal.length > 5000) {
    session.journal = session.journal.slice(-4000);
  }
}

// ─── Chrome Debugger Event Handler ─────────────────────────────────────────────

function onDebuggerEvent(source, method, params) {
  const tabId = source.tabId;
  if (!activeSessions.has(tabId)) return;

  // Network events
  if (method === "Network.requestWillBeSent") {
    recordEvent(tabId, "network", "request", {
      requestId: params.requestId,
      url: params.request?.url,
      method: params.request?.method,
      headers: params.request?.headers,
      type: params.type,
      initiator: params.initiator,
      timestamp: params.timestamp,
    });
  } else if (method === "Network.responseReceived") {
    recordEvent(tabId, "network", "response", {
      requestId: params.requestId,
      url: params.response?.url,
      status: params.response?.status,
      statusText: params.response?.statusText,
      headers: params.response?.headers,
      mimeType: params.response?.mimeType,
      timing: params.response?.timing,
    });
  } else if (method === "Network.loadingFailed") {
    recordEvent(tabId, "network", "loading_failed", {
      requestId: params.requestId,
      errorText: params.errorText,
      canceled: params.canceled,
      type: params.type,
    });
    // Also record as error
    recordEvent(tabId, "error", "network_error", {
      requestId: params.requestId,
      errorText: params.errorText,
    });
  }

  // Console events
  else if (method === "Runtime.consoleAPICalled") {
    const args = (params.args || []).map((arg) => {
      if (arg.type === "string") return arg.value;
      if (arg.type === "number") return arg.value;
      if (arg.type === "boolean") return arg.value;
      if (arg.type === "undefined") return "undefined";
      if (arg.type === "object" && arg.preview) {
        return JSON.stringify(simplifyPreview(arg.preview));
      }
      if (arg.description) return arg.description;
      return `[${arg.type}]`;
    });

    recordEvent(tabId, "console", params.type, {
      level: params.type,
      args,
      text: args.join(" "),
      stackTrace: params.stackTrace
        ? params.stackTrace.callFrames?.map((f) => ({
            function: f.functionName,
            url: f.url,
            line: f.lineNumber,
            column: f.columnNumber,
          }))
        : undefined,
    });

    // Console errors also go to errors
    if (params.type === "error") {
      recordEvent(tabId, "error", "console_error", {
        text: args.join(" "),
        stackTrace: params.stackTrace?.callFrames,
      });
    }
  }

  // Exceptions
  else if (method === "Runtime.exceptionThrown") {
    const ex = params.exceptionDetails;
    recordEvent(tabId, "error", "exception", {
      text: ex?.text,
      description: ex?.exception?.description,
      url: ex?.url,
      line: ex?.lineNumber,
      column: ex?.columnNumber,
      stackTrace: ex?.stackTrace?.callFrames?.map((f) => ({
        function: f.functionName,
        url: f.url,
        line: f.lineNumber,
        column: f.columnNumber,
      })),
    });
  }

  // Page events
  else if (method === "Page.loadEventFired") {
    recordEvent(tabId, "performance", "page_load", {
      timestamp: params.timestamp,
    });
  } else if (method === "Page.domContentEventFired") {
    recordEvent(tabId, "performance", "dom_content_loaded", {
      timestamp: params.timestamp,
    });
  } else if (method === "Page.frameNavigated") {
    recordEvent(tabId, "dom", "frame_navigated", {
      url: params.frame?.url,
      securityOrigin: params.frame?.securityOrigin,
      mimeType: params.frame?.mimeType,
    });
  } else if (method === "Page.javascriptDialogOpening") {
    recordEvent(tabId, "dom", "dialog_opening", {
      type: params.type,
      message: params.message,
      url: params.url,
    });
  }

  // DOM events
  else if (method === "DOM.documentUpdated") {
    recordEvent(tabId, "dom", "document_updated", {});
  } else if (method === "DOM.childNodeInserted") {
    recordEvent(tabId, "dom", "child_node_inserted", {
      parentNodeId: params.parentNodeId,
      nodeName: params.node?.nodeName,
    });
  } else if (method === "DOM.childNodeRemoved") {
    recordEvent(tabId, "dom", "child_node_removed", {
      parentNodeId: params.parentNodeId,
      nodeId: params.nodeId,
    });
  } else if (method === "DOM.attributeModified") {
    recordEvent(tabId, "dom", "attribute_modified", {
      nodeId: params.nodeId,
      name: params.name,
      value: params.value,
    });
  }

  // Script parsing
  else if (method === "Debugger.scriptParsed") {
    // Only record meaningful scripts (not tiny inline ones)
    if (params.url && params.url.length > 0) {
      recordEvent(tabId, "source", "script_parsed", {
        scriptId: params.scriptId,
        url: params.url,
        startLine: params.startLine,
        endLine: params.endLine,
        hash: params.hash,
      });
    }
  }

  // Performance metrics
  else if (method === "Performance.metrics") {
    recordEvent(tabId, "performance", "metrics", {
      metrics: params.metrics,
      title: params.title,
    });
  }

  // Log entries
  else if (method === "Log.entryAdded") {
    const entry = params.entry;
    recordEvent(tabId, entry.level === "error" ? "error" : "console", "log_entry", {
      level: entry.level,
      source: entry.source,
      text: entry.text,
      url: entry.url,
      lineNumber: entry.lineNumber,
      timestamp: entry.timestamp,
    });
  }
}

function simplifyPreview(preview) {
  if (!preview) return null;
  if (preview.type === "object") {
    const obj = {};
    if (preview.properties) {
      for (const prop of preview.properties) {
        obj[prop.name] = prop.value || `[${prop.type}]`;
      }
    }
    return obj;
  }
  return preview.description || `[${preview.type}]`;
}

// ─── Attach / Detach ───────────────────────────────────────────────────────────

async function attachToTab(tabId) {
  if (activeSessions.has(tabId)) {
    return { success: false, error: "Already attached to this tab" };
  }

  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (err) {
    return { success: false, error: err.message };
  }

  activeSessions.set(tabId, {
    attached: true,
    eventBuffer: [],
    journal: [],
    flushTimer: null,
  });

  // Enable CDP domains
  try {
    await Promise.all([
      chrome.debugger.sendCommand({ tabId }, "Network.enable", {}),
      chrome.debugger.sendCommand({ tabId }, "Runtime.enable", {}),
      chrome.debugger.sendCommand({ tabId }, "Page.enable", {}),
      chrome.debugger.sendCommand({ tabId }, "Log.enable", {}),
      chrome.debugger.sendCommand({ tabId }, "DOM.enable", {}),
      chrome.debugger.sendCommand({ tabId }, "Performance.enable", {}),
      chrome.debugger.sendCommand({ tabId }, "Debugger.enable", {}),
    ]);
  } catch (err) {
    console.warn("[DevTools MCP Logger] Some CDP domains failed to enable:", err.message);
  }

  // Get tab info and send meta
  try {
    const tab = await chrome.tabs.get(tabId);
    await sendToMcpServer("/meta", "POST", {
      tabId: String(tabId),
      url: tab.url,
      title: tab.title,
    });
  } catch (err) {
    // ignore
  }

  startFlushTimer(tabId);
  updateBadge(tabId, true);

  recordEvent(tabId, "console", "info", {
    text: "DevTools MCP Logger activated - recording all page activity",
    level: "info",
  });

  return { success: true };
}

async function detachFromTab(tabId) {
  const session = activeSessions.get(tabId);
  if (!session) return;

  stopFlushTimer(tabId);

  // Final flush
  await flushEvents(tabId);

  // Clear the MCP server session
  await sendToMcpServer(`/session/${tabId}`, "DELETE");

  try {
    await chrome.debugger.detach({ tabId });
  } catch (err) {
    // Tab might already be closed
  }

  activeSessions.delete(tabId);
  updateBadge(tabId, false);
}

// ─── Event Listeners ───────────────────────────────────────────────────────────

chrome.debugger.onEvent.addListener(onDebuggerEvent);

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (activeSessions.has(tabId)) {
    recordEvent(tabId, "console", "info", {
      text: `Debugger detached: ${reason}`,
      level: "info",
    });
    // Flush remaining and clean up
    flushEvents(tabId).then(() => {
      sendToMcpServer(`/session/${tabId}`, "DELETE");
      stopFlushTimer(tabId);
      activeSessions.delete(tabId);
    });
  }
});

// Auto-cleanup when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeSessions.has(tabId)) {
    flushEvents(tabId).then(() => {
      sendToMcpServer(`/session/${tabId}`, "DELETE");
      stopFlushTimer(tabId);
      activeSessions.delete(tabId);
    });
  }
});

// Track URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (activeSessions.has(tabId) && changeInfo.url) {
    sendToMcpServer("/meta", "POST", {
      tabId: String(tabId),
      url: changeInfo.url,
      title: changeInfo.title || "",
    });
  }
});

// ─── Message Handler (for popup communication) ────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "activate") {
    attachToTab(msg.tabId).then(sendResponse);
    return true; // async
  }
  if (msg.action === "deactivate") {
    detachFromTab(msg.tabId).then(() => sendResponse({ success: true }));
    return true;
  }
  if (msg.action === "getStatus") {
    const isActive = activeSessions.has(msg.tabId);
    sendResponse({ active: isActive });
    return false;
  }
  if (msg.action === "getJournal") {
    const session = activeSessions.get(msg.tabId);
    sendResponse({
      journal: session?.journal || [],
      active: !!session,
    });
    return false;
  }
  if (msg.action === "getActiveTabs") {
    const tabs = [];
    for (const [tabId, session] of activeSessions) {
      tabs.push(tabId);
    }
    sendResponse({ tabs });
    return false;
  }
  if (msg.action === "checkMcpServer") {
    fetch(`${MCP_SERVER_URL}/health`)
      .then((r) => r.json())
      .then((data) => sendResponse({ connected: true, data }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }
});
