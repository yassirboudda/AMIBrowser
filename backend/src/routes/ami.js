// ============================================================================
// AMI Browser API Routes — /api/ami
// Premium-gated AI proxy + health + model listing
// ============================================================================

const express = require("express");
const router = express.Router();
const { requireAuth, requirePremium } = require("../middleware/auth");
const aiProxy = require("../services/aiProxy");

// ── Health ──────────────────────────────────────────────────────────────────

router.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ami-browser", version: "1.0.0" });
});

// ── List available models (premium) ─────────────────────────────────────────

router.get("/models", requireAuth, requirePremium, async (req, res) => {
  try {
    const models = await aiProxy.listModels();
    res.json({ models });
  } catch (err) {
    console.error("[ami/models]", err.message);
    res.status(500).json({ error: "Failed to list models" });
  }
});

// ── Chat completion (premium, non-streaming) ────────────────────────────────

router.post("/chat", requireAuth, requirePremium, async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens, stream } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Streaming mode
    if (stream) {
      return aiProxy.chatCompletionStream(messages, { model, temperature, max_tokens }, res);
    }

    // Non-streaming
    const result = await aiProxy.chatCompletion(messages, { model, temperature, max_tokens });
    res.json(result);
  } catch (err) {
    console.error("[ami/chat]", err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "AI request failed", detail: err.message });
    }
  }
});

// ── Provider status (premium) ───────────────────────────────────────────────

router.get("/providers", requireAuth, requirePremium, (_req, res) => {
  const providers = aiProxy.getProviders().map((p) => ({
    name: p.name,
    configured: Boolean(p.key),
    defaultModel: p.defaultModel,
  }));
  res.json({ providers });
});

module.exports = router;
