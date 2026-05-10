// ============================================================================
// Browser Session Routes — /api/session
// REST endpoints + WebSocket upgrade for screencast streaming
// ============================================================================

const express = require("express");
const router = express.Router();
const { requireAuth, requirePremium } = require("../middleware/auth");
const sm = require("../services/sessionManager");

// ── Create session ──────────────────────────────────────────────────────────
router.post("/create", requireAuth, requirePremium, async (req, res) => {
  try {
    const { width, height } = req.body || {};
    const viewport = {
      width: Math.min(Math.max(width || 390, 320), 1920),
      height: Math.min(Math.max(height || 844, 480), 1080),
    };
    const session = await sm.createSession(req.user._id.toString(), viewport);
    res.json({
      id: session.id,
      viewport: session.viewport,
      url: session.currentUrl,
    });
  } catch (err) {
    const code = err.message.includes("capacity") ? 503 : 400;
    res.status(code).json({ error: err.message });
  }
});

// ── Destroy session ─────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, requirePremium, async (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });

  await sm.destroySession(req.params.id);
  res.json({ ok: true });
});

// ── Session status ──────────────────────────────────────────────────────────
router.get("/:id/status", requireAuth, requirePremium, (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });

  res.json({
    id: session.id,
    url: session.currentUrl,
    viewport: session.viewport,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    screencastActive: session.screencastActive,
    connectedClients: session.wsClients.size,
  });
});

// ── List user sessions ──────────────────────────────────────────────────────
router.get("/", requireAuth, requirePremium, (req, res) => {
  const userSessions = sm.getUserSessions(req.user._id.toString());
  res.json({
    sessions: userSessions.map((s) => ({
      id: s.id,
      url: s.currentUrl,
      viewport: s.viewport,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
    })),
    capacity: { used: sm.sessions.size, max: sm.MAX_SESSIONS },
  });
});

// ── Navigate ────────────────────────────────────────────────────────────────
router.post("/:id/navigate", requireAuth, requirePremium, async (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  try {
    const finalUrl = await sm.navigate(session, url);
    res.json({ url: finalUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Go back / forward / reload ──────────────────────────────────────────────
router.post("/:id/back", requireAuth, requirePremium, async (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });
  const url = await sm.goBack(session);
  res.json({ url });
});

router.post("/:id/forward", requireAuth, requirePremium, async (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });
  const url = await sm.goForward(session);
  res.json({ url });
});

router.post("/:id/reload", requireAuth, requirePremium, async (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });
  const url = await sm.reload(session);
  res.json({ url });
});

// ── Input events ────────────────────────────────────────────────────────────
router.post("/:id/input", requireAuth, requirePremium, async (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });

  try {
    await sm.handleInput(session, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Resize viewport ─────────────────────────────────────────────────────────
router.post("/:id/resize", requireAuth, requirePremium, async (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });

  const { width, height } = req.body;
  if (!width || !height) return res.status(400).json({ error: "width and height required" });
  await sm.resize(session, width, height);
  res.json({ viewport: session.viewport });
});

// ── Screenshot (single frame) ───────────────────────────────────────────────
router.get("/:id/screenshot", requireAuth, requirePremium, async (req, res) => {
  const session = sm.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.userId !== req.user._id.toString())
    return res.status(403).json({ error: "Not your session" });

  try {
    const data = await sm.screenshot(session);
    res.json({ screenshot: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ── WebSocket handler (attached in server.js) ───────────────────────────────
module.exports.handleWebSocketUpgrade = function handleWebSocketUpgrade(
  wss,
  resolveUser
) {
  wss.on("connection", async (ws, req) => {
    // Extract session ID and auth token from URL: /api/session/:id/stream?token=xxx
    const urlParts = req.url.split("/");
    const streamIdx = urlParts.indexOf("stream");
    const sessionId = streamIdx >= 1 ? urlParts[streamIdx - 1] : null;

    const params = new URL(req.url, "http://localhost").searchParams;
    const token = params.get("token");

    if (!sessionId || !token) {
      ws.send(JSON.stringify({ type: "error", message: "Missing session ID or token" }));
      ws.close();
      return;
    }

    // Authenticate
    let user;
    try {
      user = await resolveUser(`Bearer ${token}`);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Authentication failed" }));
      ws.close();
      return;
    }

    if (!user || !user.isPremium()) {
      ws.send(JSON.stringify({ type: "error", message: "Premium required" }));
      ws.close();
      return;
    }

    const session = sm.getSession(sessionId);
    if (!session) {
      ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
      ws.close();
      return;
    }

    if (session.userId !== user._id.toString()) {
      ws.send(JSON.stringify({ type: "error", message: "Not your session" }));
      ws.close();
      return;
    }

    // Register this client
    session.wsClients.add(ws);
    console.log(
      `[ws] Client connected to session ${sessionId} (${session.wsClients.size} clients)`
    );

    // Start screencast if not already running
    try {
      await sm.startScreencast(session);
    } catch (err) {
      ws.send(
        JSON.stringify({ type: "error", message: "Screencast failed: " + err.message })
      );
    }

    ws.send(
      JSON.stringify({
        type: "connected",
        sessionId: session.id,
        url: session.currentUrl,
        viewport: session.viewport,
      })
    );

    // Handle incoming messages (input events)
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        switch (msg.type) {
          case "tap":
          case "click":
          case "scroll":
          case "keydown":
          case "keyup":
          case "type":
          case "longpress":
            await sm.handleInput(session, msg);
            break;
          case "navigate":
            if (msg.url) {
              const url = await sm.navigate(session, msg.url);
              ws.send(JSON.stringify({ type: "navigation", url }));
            }
            break;
          case "back":
            ws.send(
              JSON.stringify({ type: "navigation", url: await sm.goBack(session) })
            );
            break;
          case "forward":
            ws.send(
              JSON.stringify({
                type: "navigation",
                url: await sm.goForward(session),
              })
            );
            break;
          case "reload":
            ws.send(
              JSON.stringify({ type: "navigation", url: await sm.reload(session) })
            );
            break;
          case "resize":
            if (msg.width && msg.height) {
              await sm.resize(session, msg.width, msg.height);
              ws.send(
                JSON.stringify({ type: "resized", viewport: session.viewport })
              );
            }
            break;
          default:
            break;
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      }
    });

    ws.on("close", () => {
      session.wsClients.delete(ws);
      console.log(
        `[ws] Client disconnected from session ${sessionId} (${session.wsClients.size} clients)`
      );
      // Stop screencast if no clients left
      if (session.wsClients.size === 0) {
        sm.stopScreencast(session).catch(() => {});
      }
    });
  });
};
