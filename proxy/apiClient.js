'use strict';

/**
 * apiClient.js
 *
 * Forwards OpenAI-compatible requests to the upstream Nvidia API.
 *
 * Key behaviour:
 *  - 429 from Nvidia is caught and retried internally with exponential backoff.
 *    Aider never sees a 429 — the proxy absorbs it transparently.
 *  - Streaming (SSE) and non-streaming responses are both supported.
 *  - Per-request timeout kills the upstream connection after `timeoutMs`.
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

// ── Retry config for upstream 429s ────────────────────────────────────────────
const RETRY_429_MAX        = 6;       // max attempts before giving up
const RETRY_429_BASE_MS    = 30_000;  // 30s base delay (doubles each attempt)
const RETRY_429_CAP_MS     = 300_000; // 5 min maximum delay

class ApiClient {
  /**
   * @param {string} apiBase   – Upstream base URL, e.g. "https://integrate.api.nvidia.com/v1"
   * @param {string} apiKey    – Bearer token for the upstream API.
   * @param {number} [timeoutMs=300000] – Per-request timeout in ms (default 5 min).
   */
  constructor(apiBase, apiKey, timeoutMs = 300_000) {
    if (!apiBase) throw new Error('[ApiClient] apiBase is required.');
    if (!apiKey)  throw new Error('[ApiClient] apiKey is required.');

    this.apiBase   = apiBase.replace(/\/+$/, '');
    this.apiKey    = apiKey;
    this.timeoutMs = timeoutMs;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  _buildOptions(targetUrlStr, bodyLength, isStream) {
    const u = new URL(targetUrlStr);
    return {
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${this.apiKey}`,
        'Content-Length': bodyLength,
        'Accept':         isStream ? 'text/event-stream' : 'application/json',
        'User-Agent':     'aider-rate-limit-proxy/1.0',
      },
    };
  }

  _sendError(expressRes, statusCode, message) {
    if (expressRes.headersSent) { expressRes.end(); return; }
    expressRes.status(statusCode).json({
      error: { message, type:  'upstream_error', code:  statusCode },
    });
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
 
  _retryDelay(attempt) {
    // Exponential backoff: 30s, 60s, 120s, 240s … capped at 5 min
    return Math.min(RETRY_429_CAP_MS, RETRY_429_BASE_MS * Math.pow(2, attempt - 1));
  }
  
  /**
   * Make ONE upstream HTTP request.
   * Resolves with { statusCode, headers, body } for non-stream.
   * For streaming, pipes directly to expressRes and resolves when done.
   * Rejects on network / timeout errors.
   *
   * @returns {Promise<{ statusCode: number, body: object|null }>}
   *          body is null for streaming (already sent to client).
   */
  _attempt(upstreamPath, body, expressRes, isStream, payload) {
    const targetUrl = `${this.apiBase}${upstreamPath}`;
    const options   = this._buildOptions(targetUrl, Buffer.byteLength(payload), isStream);
    const transport = targetUrl.startsWith('https') ? https : http;
 
    return new Promise((resolve, reject) => {
      const req = transport.request(options, (upstream) => {
        const { statusCode, statusMessage } = upstream;
        console.log(`[ApiClient] ← ${statusCode} ${statusMessage}`);
 
        // Buffer non-2xx and 429 responses so caller can decide to retry
        if (statusCode >= 400) {
          const chunks = [];
          upstream.on('data', (c) => chunks.push(c));
          upstream.on('end', () => {
            let parsed;
            try   { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
            catch { parsed = { status: statusCode, title: statusMessage }; }
            resolve({ statusCode, headers: upstream.headers, body: parsed });
          });
          upstream.on('error', reject);
          return;
        }
 
        // ── Streaming: pipe SSE directly, resolve on end ─────────────────
        if (isStream) {
          expressRes.status(statusCode);
          expressRes.setHeader('Content-Type',  'text/event-stream');
          expressRes.setHeader('Cache-Control', 'no-cache');
          expressRes.setHeader('Connection',    'keep-alive');
          for (const h of ['x-request-id', 'openai-version', 'openai-processing-ms']) {
            const v = upstream.headers[h];
            if (v) expressRes.setHeader(h, v);
          }
          upstream.pipe(expressRes);
          upstream.on('end',   () => resolve({ statusCode, body: null }));
          upstream.on('error', reject);
          return;
        }
 
        // ── Non-streaming: buffer → parse → resolve ──────────────────────
        const chunks = [];
        upstream.on('data', (c) => chunks.push(c));
        upstream.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            console.log(
              `[ApiClient] Tokens used — prompt: ${json.usage?.prompt_tokens ?? '?'}, ` +
              `completion: ${json.usage?.completion_tokens ?? '?'}`
            );
            resolve({ statusCode, body: json });
          } catch (err) {
            reject(new Error(`Failed to parse upstream JSON: ${err.message}`));
          }
        });
        upstream.on('error', reject);
      });
 
      req.on('error', reject);
 
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error(`Upstream timed out after ${this.timeoutMs / 1000}s`));
      });
 
      req.write(payload);
      req.end();
    });
  }

  // ── Public ────────────────────────────────────────────────────────────────

  /**
   * Forward a parsed request body to the upstream API and stream/return
   * the response directly to the Express `res` object.
   *
   * @param {string} upstreamPath  – Path relative to apiBase, e.g. "/chat/completions"
   * @param {object} body          – Parsed JSON body from Aider/LiteLLM.
   * @param {object} expressRes    – Express response object to write into.
   */
  async forward(upstreamPath, body, expressRes) {
    const isStream = !!body?.stream;
    const payload  = JSON.stringify(body);
    const targetUrl = `${this.apiBase}${upstreamPath}`;
 
    console.log(
      `[ApiClient] → POST ${targetUrl} ` +
      `(stream=${isStream}, model=${body?.model ?? 'unknown'})`
    );
 
    for (let attempt = 1; attempt <= RETRY_429_MAX; attempt++) {
      let result;
 
      try {
        result = await this._attempt(upstreamPath, body, expressRes, isStream, payload);
      } catch (err) {
        // Network / timeout error — don't retry, surface immediately
        console.error(`[ApiClient] Network error: ${err.message}`);
        this._sendError(expressRes, 502, `Proxy upstream error: ${err.message}`);
        return;
      }
 
      const { statusCode, body: responseBody } = result;
 
      // ── 429: absorb and retry — Aider never sees this ───────────────────
      if (statusCode === 429) {
        // Use Retry-After header if the API provides it (in seconds)
        const retryAfterHeader = result.headers?.['retry-after'];
        const retryAfterMs     = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : this._retryDelay(attempt);
 
        console.warn(
          `[ApiClient] ⚠  Upstream 429 on attempt ${attempt}/${RETRY_429_MAX}. ` +
          `Waiting ${retryAfterMs / 1000}s ` +
          `(${retryAfterHeader ? 'from Retry-After header' : 'exponential backoff'}) — ` +
          `Aider is unaware.`
        );
 
        if (attempt === RETRY_429_MAX) {
          console.error(`[ApiClient] ✘ Gave up after ${RETRY_429_MAX} attempts (all 429).`);
          this._sendError(expressRes, 429,
            `Upstream rate limit persists after ${RETRY_429_MAX} retries. Try again later.`
          );
          return;
        }
 
        await this._sleep(retryAfterMs);
        continue; // retry
      }
 
      // ── Other 4xx / 5xx: forward to Aider as-is ─────────────────────────
      if (statusCode >= 400) {
        console.error(`[ApiClient] Upstream error ${statusCode}:`, JSON.stringify(responseBody));
        if (!expressRes.headersSent) {
          expressRes.status(statusCode).json(responseBody);
        }
        return;
      }
 
      // ── Success (2xx) ────────────────────────────────────────────────────
      if (isStream) {
        // Already piped to expressRes inside _attempt
        console.log(`[ApiClient] ✔ Stream complete (attempt ${attempt})`);
      } else {
        if (!expressRes.headersSent) {
          expressRes.status(statusCode).json(responseBody);
        }
        console.log(`[ApiClient] ✔ Response sent (attempt ${attempt})`);
      }
      return;
    }
  }
}

module.exports = ApiClient;
