#!/usr/bin/env node

/**
 * Chrome DevTools MCP Server
 * 
 * Runs as an MCP server over stdio (for VS Code / GitHub Copilot)
 * and also runs an HTTP server on port 9223 for the Chrome extension
 * to push captured debugging data.
 * 
 * Session data is stored in memory and automatically cleared
 * when the Chrome extension signals that the monitored page was closed.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import http from "node:http";
import { z } from "zod";

// ─── In-memory session store ───────────────────────────────────────────────────

const sessions = new Map(); // tabId -> { logs, errors, network, console, dom, performance, meta }

function getOrCreateSession(tabId) {
  if (!sessions.has(tabId)) {
    sessions.set(tabId, {
      meta: { tabId, url: "", title: "", startedAt: new Date().toISOString() },
      logs: [],      // everything in chronological order
      errors: [],    // JS errors, exceptions
      network: [],   // network requests/responses
      console: [],   // console messages
      dom: [],       // DOM mutations
      performance: [], // performance entries
      sources: [],   // source/script info
    });
  }
  return sessions.get(tabId);
}

function clearSession(tabId) {
  sessions.delete(tabId);
}

function clearAllSessions() {
  sessions.clear();
}

function getAllLogs() {
  const allLogs = [];
  for (const [tabId, session] of sessions) {
    allLogs.push({
      tabId,
      meta: session.meta,
      entries: session.logs,
    });
  }
  return allLogs;
}

function getSessionSummary() {
  const summaries = [];
  for (const [tabId, session] of sessions) {
    summaries.push({
      tabId,
      url: session.meta.url,
      title: session.meta.title,
      startedAt: session.meta.startedAt,
      counts: {
        totalLogs: session.logs.length,
        errors: session.errors.length,
        network: session.network.length,
        console: session.console.length,
        dom: session.dom.length,
        performance: session.performance.length,
      },
    });
  }
  return summaries;
}

// ─── HTTP Server for Chrome Extension ──────────────────────────────────────────

const HTTP_PORT = 9223;

const httpServer = http.createServer((req, res) => {
  // CORS headers for Chrome extension
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      if (req.method === "POST" && req.url === "/events") {
        const data = JSON.parse(body);
        const { tabId, events } = data;
        if (!tabId || !events) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "tabId and events required" }));
          return;
        }
        const session = getOrCreateSession(tabId);
        for (const event of events) {
          const entry = {
            timestamp: event.timestamp || new Date().toISOString(),
            type: event.type || "unknown",
            category: event.category || "general",
            data: event.data || {},
          };
          session.logs.push(entry);

          // Also categorize
          switch (entry.category) {
            case "error":
              session.errors.push(entry);
              break;
            case "network":
              session.network.push(entry);
              break;
            case "console":
              session.console.push(entry);
              break;
            case "dom":
              session.dom.push(entry);
              break;
            case "performance":
              session.performance.push(entry);
              break;
            case "source":
              session.sources.push(entry);
              break;
          }
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, logCount: session.logs.length }));
      } else if (req.method === "POST" && req.url === "/meta") {
        const data = JSON.parse(body);
        const { tabId, url, title } = data;
        if (tabId) {
          const session = getOrCreateSession(tabId);
          if (url) session.meta.url = url;
          if (title) session.meta.title = title;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      } else if (req.method === "DELETE" && req.url?.startsWith("/session/")) {
        const tabId = req.url.split("/session/")[1];
        clearSession(tabId);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, cleared: tabId }));
      } else if (req.method === "DELETE" && req.url === "/sessions") {
        clearAllSessions();
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: "all sessions cleared" }));
      } else if (req.method === "GET" && req.url === "/sessions") {
        res.writeHead(200);
        res.end(JSON.stringify(getSessionSummary()));
      } else if (req.method === "GET" && req.url?.startsWith("/session/")) {
        const parts = req.url.split("/");
        const tabId = parts[2];
        const category = parts[3]; // optional
        const session = sessions.get(tabId);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "session not found" }));
          return;
        }
        if (category && session[category]) {
          res.writeHead(200);
          res.end(JSON.stringify(session[category]));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify(session));
        }
      } else if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200);
        res.end(JSON.stringify({ status: "ok", sessions: sessions.size }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "not found" }));
      }
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
  // Log to stderr so it doesn't interfere with stdio MCP transport
  process.stderr.write(`[chrome-devtools-mcp] HTTP server listening on http://127.0.0.1:${HTTP_PORT}\n`);
});

// ─── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "chrome-devtools",
  version: "1.0.0",
});

// --- Tools ---

server.tool(
  "get_active_sessions",
  "List all active debugging sessions being recorded from the Chrome extension",
  {},
  async () => {
    const summaries = getSessionSummary();
    return {
      content: [
        {
          type: "text",
          text: summaries.length === 0
            ? "No active debugging sessions. Activate the Chrome DevTools MCP Logger extension on a page to start recording."
            : JSON.stringify(summaries, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_all_logs",
  "Get ALL recorded logs from all active debugging sessions (errors, network, console, DOM, performance). Use this to understand what happened on the page.",
  {},
  async () => {
    const allLogs = getAllLogs();
    return {
      content: [
        {
          type: "text",
          text: allLogs.length === 0
            ? "No logs recorded yet."
            : JSON.stringify(allLogs, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_session_logs",
  "Get logs for a specific tab/session. Optionally filter by category.",
  {
    tabId: z.string().describe("The tab ID of the debugging session"),
    category: z
      .enum(["all", "errors", "network", "console", "dom", "performance", "sources"])
      .optional()
      .describe("Filter by log category. Defaults to 'all'."),
  },
  async ({ tabId, category }) => {
    const session = sessions.get(tabId);
    if (!session) {
      return {
        content: [{ type: "text", text: `No session found for tab ${tabId}` }],
      };
    }
    let data;
    switch (category) {
      case "errors":
        data = session.errors;
        break;
      case "network":
        data = session.network;
        break;
      case "console":
        data = session.console;
        break;
      case "dom":
        data = session.dom;
        break;
      case "performance":
        data = session.performance;
        break;
      case "sources":
        data = session.sources;
        break;
      default:
        data = session.logs;
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { meta: session.meta, category: category || "all", count: data.length, entries: data },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  "get_errors",
  "Get only JavaScript errors and exceptions from all active debugging sessions. Useful for quickly understanding what went wrong.",
  {},
  async () => {
    const allErrors = [];
    for (const [tabId, session] of sessions) {
      if (session.errors.length > 0) {
        allErrors.push({
          tabId,
          url: session.meta.url,
          errors: session.errors,
        });
      }
    }
    return {
      content: [
        {
          type: "text",
          text: allErrors.length === 0
            ? "No errors recorded in any active session."
            : JSON.stringify(allErrors, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_network_requests",
  "Get all network requests/responses recorded from active debugging sessions. Includes URLs, status codes, headers, timing, and response bodies when available.",
  {
    tabId: z.string().optional().describe("Optional: filter to a specific tab ID"),
  },
  async ({ tabId }) => {
    const results = [];
    for (const [tid, session] of sessions) {
      if (tabId && tid !== tabId) continue;
      if (session.network.length > 0) {
        results.push({
          tabId: tid,
          url: session.meta.url,
          requests: session.network,
        });
      }
    }
    return {
      content: [
        {
          type: "text",
          text: results.length === 0
            ? "No network requests recorded."
            : JSON.stringify(results, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_console_output",
  "Get all console.log/warn/error/info output from active debugging sessions.",
  {
    tabId: z.string().optional().describe("Optional: filter to a specific tab ID"),
  },
  async ({ tabId }) => {
    const results = [];
    for (const [tid, session] of sessions) {
      if (tabId && tid !== tabId) continue;
      if (session.console.length > 0) {
        results.push({
          tabId: tid,
          url: session.meta.url,
          messages: session.console,
        });
      }
    }
    return {
      content: [
        {
          type: "text",
          text: results.length === 0
            ? "No console output recorded."
            : JSON.stringify(results, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "clear_session",
  "Clear all recorded data for a specific session/tab.",
  {
    tabId: z.string().describe("The tab ID to clear"),
  },
  async ({ tabId }) => {
    clearSession(tabId);
    return {
      content: [{ type: "text", text: `Session ${tabId} cleared.` }],
    };
  }
);

server.tool(
  "clear_all_sessions",
  "Clear ALL recorded debugging data from all sessions.",
  {},
  async () => {
    clearAllSessions();
    return {
      content: [{ type: "text", text: "All sessions cleared." }],
    };
  }
);

// --- Resources ---

server.resource(
  "session-overview",
  "chrome-devtools://overview",
  {
    description: "Overview of all active debugging sessions and their log counts",
    mimeType: "application/json",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(getSessionSummary(), null, 2),
        },
      ],
    };
  }
);

server.resource(
  "all-logs",
  "chrome-devtools://logs",
  {
    description: "All logs from all active Chrome debugging sessions",
    mimeType: "application/json",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(getAllLogs(), null, 2),
        },
      ],
    };
  }
);

server.resource(
  "all-errors",
  "chrome-devtools://errors",
  {
    description: "All JavaScript errors from active debugging sessions",
    mimeType: "application/json",
  },
  async (uri) => {
    const allErrors = [];
    for (const [tabId, session] of sessions) {
      if (session.errors.length > 0) {
        allErrors.push({
          tabId,
          url: session.meta.url,
          errors: session.errors,
        });
      }
    }
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(allErrors, null, 2),
        },
      ],
    };
  }
);

// ─── Start MCP Server ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[chrome-devtools-mcp] MCP server started on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[chrome-devtools-mcp] Fatal error: ${err.message}\n`);
  process.exit(1);
});
