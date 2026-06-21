
'use strict';

/**
 * server.js — Aider Rate-Limiting Proxy
 *
 * Listens on localhost and acts as an OpenAI-compatible endpoint for Aider.
 * Applies a fixed-minute-window rate limit before forwarding each request to
 * the real Nvidia API. Excess requests are queued and released on the next
 * clock-minute boundary.
 *
 * Environment variables (all optional with defaults):
 *   UPSTREAM_API_BASE   – Real upstream API base URL
 *                         Default: https://integrate.api.nvidia.com/v1
 *   UPSTREAM_API_KEY    – Bearer token for the upstream API (REQUIRED)
 *   PROXY_PORT          – Port this proxy listens on. Default: 3000
 *   RATE_LIMIT_PER_MIN  – Max requests per calendar minute. Default: 30
 *   QUEUE_TIMEOUT_MS    – Max ms a request waits in queue. Default: 600000 (10 min)
 *   UPSTREAM_TIMEOUT_MS – Per-request upstream timeout in ms. Default: 300000 (5 min)
 *
 * Aider / LiteLLM must be pointed at this proxy:
 *   OPENAI_API_BASE=http://127.0.0.1:<PROXY_PORT>/v1
 */

const express    = require('express');
const RateLimiter = require('./rateLimiter');
const ApiClient   = require('./apiClient');

// ── Configuration ─────────────────────────────────────────────────────────────

const UPSTREAM_BASE   = process.env.UPSTREAM_API_BASE   || 'https://integrate.api.nvidia.com/v1';
const UPSTREAM_KEY    = process.env.UPSTREAM_API_KEY    || process.env.OPENAI_API_KEY || '';
const PORT            = parseInt(process.env.PROXY_PORT          || '3000', 10);
const MAX_PER_MIN     = parseInt(process.env.RATE_LIMIT_PER_MIN  || '30',   10);
const QUEUE_TIMEOUT   = parseInt(process.env.QUEUE_TIMEOUT_MS    || '600000', 10);
const UPSTREAM_TIMEOUT= parseInt(process.env.UPSTREAM_TIMEOUT_MS || '300000', 10);

if (!UPSTREAM_KEY) {
  console.error(
    '[Proxy] FATAL: No upstream API key found.\n' +
    '        Set UPSTREAM_API_KEY (or OPENAI_API_KEY as fallback).'
  );
  process.exit(1);
}

// ── Initialise modules ────────────────────────────────────────────────────────

const app     = express();
const limiter = new RateLimiter({ maxPerMinute: MAX_PER_MIN, queueTimeoutMs: QUEUE_TIMEOUT });
const client  = new ApiClient(UPSTREAM_BASE, UPSTREAM_KEY, UPSTREAM_TIMEOUT);

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json({ limit: '20mb' }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[Proxy] ${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * Health check — useful for workflow readiness polling.
 * Returns 200 with current rate-limiter state.
 */
app.get('/health', (_req, res) => {
  res.json({
    status:       'ok',
    upstreamBase: UPSTREAM_BASE,
    rateLimit:    MAX_PER_MIN,
    queueDepth:   limiter.queueDepth,
    currentCount: limiter.currentCount,
  });
});

/**
 * GET /v1/models
 *
 * Aider / LiteLLM may probe this endpoint to validate the model string.
 * Return a minimal static stub so it doesn't 404 and abort the run.
 */
app.get('/v1/models', (_req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id:         'deepseek-ai/deepseek-v4-pro',
        object:     'model',
        created:    Math.floor(Date.now() / 1000),
        owned_by:   'nvidia',
        permission: [],
        root:       'deepseek-ai/deepseek-v4-pro',
        parent:     null,
      },
    ],
  });
});

/**
 * POST /v1/chat/completions  (and any other /v1/* POST)
 *
 * Core proxy route:
 *  1. Wait for a rate-limit slot (may queue if at 30 req/min cap).
 *  2. Forward to the upstream Nvidia API, preserving stream mode.
 *  3. Pipe the response back to Aider.
 */
app.post('/v1/*', async (req, res) => {
  // Strip the leading /v1 so the ApiClient can append it to the base URL
  // Example: /v1/chat/completions → /chat/completions
  const upstreamPath = req.path.replace(/^\/v1/, '') || '/';

  const label = `${req.method} /v1${upstreamPath} [${new Date().toISOString()}]`;

  try {
    // Block until the rate-limit bucket has space (or next minute opens it)
    await limiter.acquire(label);

    await client.forward(upstreamPath, req.body, res);

  } catch (err) {
    console.error(`[Proxy] Error handling ${label}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: {
          message: err.message,
          type:    'proxy_error',
          code:    502,
        },
      });
    }
  }
});

// Catch-all for any unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Not found', type: 'proxy_error', code: 404 } });
});

// ── Start server ──────────────────────────────────────────────────────────────

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║          Aider Rate-Limiting Proxy               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Listening  : http://127.0.0.1:${PORT}/v1`);
  console.log(`  Upstream   : ${UPSTREAM_BASE}`);
  console.log(`  Rate limit : ${MAX_PER_MIN} requests / minute`);
  console.log(`  Queue t/o  : ${QUEUE_TIMEOUT / 1000}s`);
  console.log(`  Upstream t/o: ${UPSTREAM_TIMEOUT / 1000}s`);
  console.log('');
  console.log('  Configure Aider:');
  console.log(`    OPENAI_API_BASE=http://127.0.0.1:${PORT}/v1`);
  console.log('');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[Proxy] Received ${signal} — shutting down gracefully…`);
  limiter.destroy(); // Reject any pending queue entries
  server.close(() => {
    console.log('[Proxy] HTTP server closed. Exiting.');
    process.exit(0);
  });

  // Force-exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('[Proxy] Forced exit after 10s.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[Proxy] Uncaught exception:', err);
  // Don't crash — keep serving requests
});

process.on('unhandledRejection', (reason) => {
  console.error('[Proxy] Unhandled rejection:', reason);
});
