'use strict';

/**
 * apiClient.js
 *
 * Forwards OpenAI-compatible requests from the proxy to the upstream
 * Nvidia API (or any OpenAI-compatible endpoint).
 *
 * Handles:
 *  - Streaming (SSE / text/event-stream) — pipes tokens to Aider as they arrive.
 *  - Non-streaming — buffers the full response, parses JSON, returns to Aider.
 *  - Upstream error status codes — propagates them faithfully to Aider.
 *  - Request timeout — kills the upstream connection after `timeoutMs`.
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

class ApiClient {
  /**
   * @param {string} apiBase   – Upstream base URL, e.g. "https://integrate.api.nvidia.com/v1"
   * @param {string} apiKey    – Bearer token for the upstream API.
   * @param {number} [timeoutMs=300000] – Per-request timeout in ms (default 5 min).
   */
  constructor(apiBase, apiKey, timeoutMs = 300_000) {
    if (!apiBase) throw new Error('[ApiClient] apiBase is required.');
    if (!apiKey)  throw new Error('[ApiClient] apiKey is required.');

    // Normalize: strip trailing slashes
    this.apiBase   = apiBase.replace(/\/+$/, '');
    this.apiKey    = apiKey;
    this.timeoutMs = timeoutMs;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * Build Node.js http/https request options from a target URL string.
   * @private
   */
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

  /**
   * Send a structured OpenAI error to the Express response.
   * Safe to call even if headers have already been partially sent (streaming).
   * @private
   */
  _sendError(expressRes, statusCode, message) {
    if (expressRes.headersSent) {
      // For streaming, we can only close the connection
      expressRes.end();
      return;
    }
    expressRes.status(statusCode).json({
      error: {
        message,
        type:  'upstream_error',
        code:  statusCode,
      },
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
   * @returns {Promise<void>}
   */
  forward(upstreamPath, body, expressRes) {
    return new Promise((resolve, reject) => {
      const isStream     = !!body?.stream;
      const payload      = JSON.stringify(body);
      const targetUrl    = `${this.apiBase}${upstreamPath}`;
      const options      = this._buildOptions(targetUrl, Buffer.byteLength(payload), isStream);
      const transport    = targetUrl.startsWith('https') ? https : http;

      console.log(
        `[ApiClient] → POST ${targetUrl} ` +
        `(stream=${isStream}, model=${body?.model ?? 'unknown'})`
      );

      const req = transport.request(options, (upstream) => {
        const { statusCode, statusMessage } = upstream;
        console.log(`[ApiClient] ← ${statusCode} ${statusMessage}`);

        // ── Non-2xx: buffer and forward the error body ───────────────────
        if (statusCode >= 400) {
          const chunks = [];
          upstream.on('data', (c) => chunks.push(c));
          upstream.on('end', () => {
            let errorBody;
            try {
              errorBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              errorBody = {
                error: {
                  message: `Upstream returned ${statusCode} ${statusMessage}`,
                  type:    'upstream_error',
                  code:    statusCode,
                },
              };
            }
            console.error(`[ApiClient] Upstream error ${statusCode}:`, JSON.stringify(errorBody));
            if (!expressRes.headersSent) {
              expressRes.status(statusCode).json(errorBody);
            }
            resolve(); // Handled — don't propagate as an unhandled rejection
          });
          upstream.on('error', reject);
          return;
        }

        // ── Streaming: pipe SSE directly to Aider ────────────────────────
        if (isStream) {
          expressRes.status(statusCode);
          expressRes.setHeader('Content-Type',  'text/event-stream');
          expressRes.setHeader('Cache-Control', 'no-cache');
          expressRes.setHeader('Connection',    'keep-alive');

          // Forward any OpenAI tracing headers Aider might use
          for (const h of ['x-request-id', 'openai-version', 'openai-processing-ms']) {
            const v = upstream.headers[h];
            if (v) expressRes.setHeader(h, v);
          }

          upstream.pipe(expressRes);

          upstream.on('end', () => {
            console.log(`[ApiClient] Stream complete for ${targetUrl}`);
            resolve();
          });
          upstream.on('error', (err) => {
            console.error(`[ApiClient] Stream error: ${err.message}`);
            this._sendError(expressRes, 502, err.message);
            reject(err);
          });

        // ── Non-streaming: buffer → parse → return JSON ──────────────────
        } else {
          const chunks = [];
          upstream.on('data', (c) => chunks.push(c));
          upstream.on('end', () => {
            try {
              const raw  = Buffer.concat(chunks).toString('utf8');
              const json = JSON.parse(raw);

              console.log(
                `[ApiClient] Non-stream response received. ` +
                `Tokens: prompt=${json.usage?.prompt_tokens ?? '?'}, ` +
                `completion=${json.usage?.completion_tokens ?? '?'}`
              );

              if (!expressRes.headersSent) {
                expressRes.status(statusCode).json(json);
              }
              resolve();
            } catch (err) {
              const msg = `Failed to parse upstream JSON: ${err.message}`;
              console.error(`[ApiClient] ${msg}`);
              this._sendError(expressRes, 502, msg);
              reject(new Error(msg));
            }
          });
          upstream.on('error', reject);
        }
      });

      // ── Request-level errors and timeout ─────────────────────────────────
      req.on('error', (err) => {
        console.error(`[ApiClient] Request error: ${err.message}`);
        this._sendError(expressRes, 502, `Proxy upstream error: ${err.message}`);
        reject(err);
      });

      req.setTimeout(this.timeoutMs, () => {
        const msg = `Upstream request timed out after ${this.timeoutMs / 1000}s`;
        console.error(`[ApiClient] ${msg}`);
        req.destroy(new Error(msg));
        this._sendError(expressRes, 504, msg);
        reject(new Error(msg));
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = ApiClient;
