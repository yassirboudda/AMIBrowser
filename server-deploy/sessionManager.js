// ============================================================================
// Headless Browser Session Manager — AMI Mobile Backend
// Manages Puppeteer CDP sessions for remote browsing via WebSocket
// Includes ad/tracker blocking via CDP network interception
// ============================================================================

const puppeteer = require("puppeteer");
const crypto = require("crypto");

// ── Config ──────────────────────────────────────────────────────────────────
const MAX_SESSIONS = parseInt(process.env.MAX_BROWSER_SESSIONS || "2", 10);
const SESSION_IDLE_TIMEOUT = 15 * 60 * 1000; // 15 min
const SESSION_MAX_LIFETIME = 8 * 60 * 60 * 1000; // 8 hours
const SCREENCAST_FPS = 30;
const SCREENCAST_QUALITY = 60;

// ── Session Store ───────────────────────────────────────────────────────────
const sessions = new Map(); // sessionId → SessionObj

class BrowserSession {
  constructor(userId, viewport) {
    this.id = crypto.randomUUID();
    this.userId = userId;
    this.browser = null;
    this.page = null;
    this.cdp = null;
    this.viewport = viewport || { width: 390, height: 844 };
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.currentUrl = "about:blank";
    this.screencastActive = false;
    this.wsClients = new Set(); // WebSocket connections watching this session
    this.adBlockEnabled = true;
    this.adsBlocked = 0;
  }

  get isExpired() {
    const idle = Date.now() - this.lastActivity > SESSION_IDLE_TIMEOUT;
    const tooOld = Date.now() - this.createdAt > SESSION_MAX_LIFETIME;
    return idle || tooOld;
  }

  touch() {
    this.lastActivity = Date.now();
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

async function createSession(userId, viewport) {
  // Enforce per-user limit (max 2 concurrent)
  const userSessions = [...sessions.values()].filter(
    (s) => s.userId === userId
  );
  if (userSessions.length >= 2) {
    throw new Error("Max 2 concurrent sessions per user");
  }
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error("Server at capacity — try again later");
  }

  const session = new BrowserSession(userId, viewport);

  try {
    session.browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--disable-default-apps",
        "--no-first-run",
        "--single-process",
        `--window-size=${session.viewport.width},${session.viewport.height}`,
      ],
      defaultViewport: session.viewport,
    });

    session.page = await session.browser.newPage();
    await session.page.setViewport(session.viewport);

    // Set up CDP session for screencast + input
    session.cdp = await session.page.createCDPSession();

    // Enable ad/tracker blocking via CDP request interception
    if (session.adBlockEnabled) {
      try {
        const openClaw = require("./openClaw");
        await openClaw.enableAdBlocking(session.cdp);
        console.log(`[session] Ad blocking enabled for ${session.id}`);
      } catch (err) {
        console.warn(`[session] Ad blocking init failed: ${err.message}`);
      }
    }

    // Track navigation
    session.page.on("framenavigated", (frame) => {
      if (frame === session.page.mainFrame()) {
        session.currentUrl = frame.url();
        session.touch();
        broadcastToSession(session, {
          type: "navigation",
          url: session.currentUrl,
        });
      }
    });

    sessions.set(session.id, session);
    console.log(
      `[session] Created ${session.id} for user ${userId} (${sessions.size}/${MAX_SESSIONS})`
    );
    return session;
  } catch (err) {
    if (session.browser) await session.browser.close().catch(() => {});
    throw err;
  }
}

async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    if (session.screencastActive && session.cdp) {
      await session.cdp.send("Page.stopScreencast").catch(() => {});
    }
    if (session.browser) {
      await session.browser.close().catch(() => {});
    }
  } catch {}

  // Notify all WebSocket clients
  for (const ws of session.wsClients) {
    try {
      ws.send(JSON.stringify({ type: "session_ended" }));
      ws.close();
    } catch {}
  }

  sessions.delete(sessionId);
  console.log(
    `[session] Destroyed ${sessionId} (${sessions.size}/${MAX_SESSIONS})`
  );
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function getUserSessions(userId) {
  return [...sessions.values()].filter((s) => s.userId === userId);
}

// ── Screencast ──────────────────────────────────────────────────────────────

async function startScreencast(session) {
  if (session.screencastActive) return;

  await session.cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: SCREENCAST_QUALITY,
    maxWidth: session.viewport.width,
    maxHeight: session.viewport.height,
    everyNthFrame: Math.max(1, Math.round(60 / SCREENCAST_FPS)),
  });

  session.cdp.on("Page.screencastFrame", ({ data, sessionId, metadata }) => {
    session.touch();
    // Broadcast frame to all connected WebSocket clients
    for (const ws of session.wsClients) {
      try {
        if (ws.readyState === 1) {
          // WebSocket.OPEN
          ws.send(
            JSON.stringify({
              type: "frame",
              data, // base64 jpeg
              metadata,
            })
          );
        }
      } catch {}
    }
    // Ack frame
    session.cdp
      .send("Page.screencastFrameAck", { sessionId })
      .catch(() => {});
  });

  session.screencastActive = true;
}

async function stopScreencast(session) {
  if (!session.screencastActive) return;
  await session.cdp.send("Page.stopScreencast").catch(() => {});
  session.screencastActive = false;
}

// ── Input Forwarding ────────────────────────────────────────────────────────

async function handleInput(session, event) {
  session.touch();

  switch (event.type) {
    case "tap":
    case "click": {
      const { x, y } = event;
      await session.cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
      await session.cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
      break;
    }

    case "scroll": {
      const { x, y, deltaX, deltaY } = event;
      await session.cdp.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: x || 0,
        y: y || 0,
        deltaX: deltaX || 0,
        deltaY: deltaY || 0,
      });
      break;
    }

    case "keydown":
    case "keyup": {
      await session.cdp.send("Input.dispatchKeyEvent", {
        type: event.type === "keydown" ? "keyDown" : "keyUp",
        key: event.key,
        code: event.code || "",
        text: event.text || "",
        windowsVirtualKeyCode: event.keyCode || 0,
      });
      break;
    }

    case "type": {
      // Type a string character by character
      for (const char of event.text || "") {
        await session.cdp.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          text: char,
        });
        await session.cdp.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          text: char,
        });
      }
      break;
    }

    case "longpress": {
      const { x, y } = event;
      await session.cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "right",
        clickCount: 1,
      });
      await session.cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "right",
        clickCount: 1,
      });
      break;
    }

    default:
      console.warn(`[session] Unknown input type: ${event.type}`);
  }
}

// ── Navigation ──────────────────────────────────────────────────────────────

async function navigate(session, url) {
  session.touch();
  const resolved = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  await session.page.goto(resolved, { waitUntil: "domcontentloaded", timeout: 30000 });
  session.currentUrl = session.page.url();
  return session.currentUrl;
}

async function goBack(session) {
  session.touch();
  await session.page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  session.currentUrl = session.page.url();
  return session.currentUrl;
}

async function goForward(session) {
  session.touch();
  await session.page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
  session.currentUrl = session.page.url();
  return session.currentUrl;
}

async function reload(session) {
  session.touch();
  await session.page.reload({ waitUntil: "domcontentloaded" });
  session.currentUrl = session.page.url();
  return session.currentUrl;
}

async function resize(session, width, height) {
  session.viewport = { width, height };
  await session.page.setViewport(session.viewport);
  // Restart screencast with new dimensions
  if (session.screencastActive) {
    await stopScreencast(session);
    await startScreencast(session);
  }
}

// ── Screenshot (single frame) ───────────────────────────────────────────────

async function screenshot(session) {
  session.touch();
  const buf = await session.page.screenshot({ type: "jpeg", quality: 80 });
  return buf.toString("base64");
}

// ── Broadcast helper ────────────────────────────────────────────────────────

function broadcastToSession(session, message) {
  const payload = JSON.stringify(message);
  for (const ws of session.wsClients) {
    try {
      if (ws.readyState === 1) ws.send(payload);
    } catch {}
  }
}

// ── Cleanup Timer ───────────────────────────────────────────────────────────

setInterval(() => {
  for (const [id, session] of sessions) {
    if (session.isExpired) {
      console.log(`[session] Expiring idle/old session ${id}`);
      destroySession(id);
    }
  }
}, 60000); // check every minute

module.exports = {
  createSession,
  destroySession,
  getSession,
  getUserSessions,
  startScreencast,
  stopScreencast,
  handleInput,
  navigate,
  goBack,
  goForward,
  reload,
  resize,
  screenshot,
  broadcastToSession,
  sessions,
  MAX_SESSIONS,
};
