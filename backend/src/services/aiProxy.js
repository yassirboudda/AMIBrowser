// ============================================================================
// AI Provider Proxy — AMI Browser V3
// Fallback chain: Ollama Cloud (free) → Mistral (paid) → Mistral (free)
// ============================================================================

const https = require("https");
const http = require("http");

// ── Provider Configs ────────────────────────────────────────────────────────

function getProviders() {
  return [
    {
      name: "ollama-cloud",
      url: "https://api.ollama.com/v1/chat/completions",
      key: process.env.OLLAMA_API_KEY,
      defaultModel: "llama3.1:8b",
      modelsUrl: "https://api.ollama.com/v1/models",
    },
    {
      name: "mistral-paid",
      url: "https://api.mistral.ai/v1/chat/completions",
      key: process.env.MISTRAL_PAID_API_KEY,
      defaultModel: "mistral-small-latest",
      modelsUrl: "https://api.mistral.ai/v1/models",
    },
    {
      name: "mistral-free",
      url: "https://api.mistral.ai/v1/chat/completions",
      key: process.env.MISTRAL_FREE_API_KEY,
      defaultModel: "mistral-small-latest",
      modelsUrl: "https://api.mistral.ai/v1/models",
    },
  ];
}

// ── HTTP helper (returns Promise<{ status, body }>) ─────────────────────────

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("timeout"));
    });
    if (body) req.write(body);
    req.end();
  });
}

// ── Stream helper (pipes provider SSE → Express response) ───────────────────

function streamRequest(url, options, body, res) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, options, (upstream) => {
      if (upstream.statusCode >= 400) {
        const chunks = [];
        upstream.on("data", (c) => chunks.push(c));
        upstream.on("end", () => {
          reject(
            new Error(
              `Provider returned ${upstream.statusCode}: ${Buffer.concat(chunks).toString()}`
            )
          );
        });
        return;
      }
      // Pipe SSE stream to client
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      upstream.pipe(res);
      upstream.on("end", resolve);
      upstream.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error("timeout"));
    });
    if (body) req.write(body);
    req.end();
  });
}

// ── Chat Completion (with fallback chain) ───────────────────────────────────

async function chatCompletion(messages, opts = {}) {
  const { model, stream = false, temperature, max_tokens } = opts;
  const providers = getProviders().filter((p) => p.key);

  if (providers.length === 0) throw new Error("No AI providers configured");

  let lastError = null;

  for (const provider of providers) {
    const payload = JSON.stringify({
      model: model || provider.defaultModel,
      messages,
      stream: Boolean(stream),
      ...(temperature != null && { temperature }),
      ...(max_tokens != null && { max_tokens }),
    });

    const reqOpts = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
      },
    };

    try {
      const { status, body } = await request(provider.url, reqOpts, payload);
      if (status >= 200 && status < 300) {
        return { provider: provider.name, data: JSON.parse(body) };
      }
      lastError = new Error(
        `${provider.name} returned ${status}: ${body.slice(0, 200)}`
      );
      console.warn(
        `[aiProxy] ${provider.name} failed (${status}), trying next…`
      );
    } catch (err) {
      lastError = err;
      console.warn(
        `[aiProxy] ${provider.name} error: ${err.message}, trying next…`
      );
    }
  }

  throw lastError || new Error("All AI providers failed");
}

// ── Streaming Chat (with fallback) ──────────────────────────────────────────

async function chatCompletionStream(messages, opts, res) {
  const { model, temperature, max_tokens } = opts;
  const providers = getProviders().filter((p) => p.key);

  if (providers.length === 0) {
    res.status(503).json({ error: "No AI providers configured" });
    return;
  }

  let lastError = null;

  for (const provider of providers) {
    const payload = JSON.stringify({
      model: model || provider.defaultModel,
      messages,
      stream: true,
      ...(temperature != null && { temperature }),
      ...(max_tokens != null && { max_tokens }),
    });

    const reqOpts = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
      },
    };

    try {
      await streamRequest(provider.url, reqOpts, payload, res);
      return; // success — stream piped
    } catch (err) {
      lastError = err;
      console.warn(
        `[aiProxy] stream ${provider.name} error: ${err.message}, trying next…`
      );
    }
  }

  // All providers failed
  if (res.headersSent === false) {
    res.status(502).json({
      error: "All AI providers failed",
      detail: lastError ? lastError.message : "unknown",
    });
  }
}

// ── List Models ─────────────────────────────────────────────────────────────

async function listModels() {
  const providers = getProviders().filter((p) => p.key && p.modelsUrl);
  const results = {};

  for (const provider of providers) {
    try {
      const { status, body } = await request(provider.modelsUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${provider.key}` },
      });
      if (status >= 200 && status < 300) {
        const parsed = JSON.parse(body);
        results[provider.name] = parsed.data || parsed.models || parsed;
      }
    } catch (err) {
      console.warn(`[aiProxy] models ${provider.name}: ${err.message}`);
      results[provider.name] = [];
    }
  }

  return results;
}

module.exports = { chatCompletion, chatCompletionStream, listModels, getProviders };
