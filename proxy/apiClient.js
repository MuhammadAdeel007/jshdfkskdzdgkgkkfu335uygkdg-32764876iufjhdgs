'use strict';

const https = require('https');
const http  = require('http');
const { PassThrough } = require('stream');
const { URL } = require('url');

const RETRY_429_MAX     = 6;
const RETRY_429_BASE_MS = 30_000;
const RETRY_429_CAP_MS  = 600_000;

class ApiClient {
  constructor(apiBase, apiKey, timeoutMs = 300_000) {
    if (!apiBase) throw new Error('[ApiClient] apiBase is required.');
    if (!apiKey)  throw new Error('[ApiClient] apiKey is required.');
    this.apiBase   = apiBase.replace(/\/+$/, '');
    this.apiKey    = apiKey;
    this.timeoutMs = timeoutMs;
  }

  _buildOptions(targetUrlStr, bodyLength) {
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
        'Accept':         'text/event-stream',
        'User-Agent':     'aider-rate-limit-proxy/1.0',
      },
    };
  }

  _sendError(res, statusCode, message) {
    if (res.headersSent) { res.end(); return; }
    res.status(statusCode).json({
      error: { message, type: 'upstream_error', code: statusCode },
    });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _retryDelay(attempt) {
    return Math.min(RETRY_429_CAP_MS, RETRY_429_BASE_MS * Math.pow(2, attempt - 1));
  }

  /**
   * Always sends stream=true + stream_options.include_usage=true to NVIDIA.
   * If the client (aider) wanted stream=false, we buffer the SSE tokens,
   * reassemble them into a normal chat completion JSON, and send that back.
   * If the client wanted stream=true, we pipe SSE directly.
   */
  _attempt(upstreamPath, body, expressRes, clientWantsStream, payload) {
    const targetUrl = `${this.apiBase}${upstreamPath}`;
    const options   = this._buildOptions(targetUrl, Buffer.byteLength(payload));
    const transport = targetUrl.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (upstream) => {
        const { statusCode, statusMessage } = upstream;
        console.log(`[ApiClient] ← ${statusCode} ${statusMessage}`);

        // Buffer error responses so the retry loop can inspect them
        if (statusCode >= 400) {
          const chunks = [];
          upstream.on('data', c => chunks.push(c));
          upstream.on('end', () => {
            let parsed;
            try   { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
            catch { parsed = { status: statusCode, title: statusMessage }; }
            resolve({ statusCode, headers: upstream.headers, body: parsed });
          });
          upstream.on('error', reject);
          return;
        }

        // ── Tap the stream for live logging ───────────────────────────────
        const tap         = new PassThrough();
        let   tokenBuffer = '';
        let   usageData   = null;
        let   firstToken  = true;

        // FIX: accumulate incomplete lines across TCP chunks so we never
        // try to JSON.parse a line that was split mid-delivery.
        let lineBuffer = '';

        tap.on('data', chunk => {
          lineBuffer += chunk.toString();

          // Split on newlines but keep any incomplete trailing line for the
          // next chunk — pop() removes and returns the last element.
          const lines = lineBuffer.split('\n');
          lineBuffer  = lines.pop() ?? '';   // re-buffer the incomplete tail

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const json  = JSON.parse(raw);
              const token = json.choices?.[0]?.delta?.content ?? '';
              if (token) {
                if (firstToken) { process.stdout.write('\n[ApiClient] Streaming: '); firstToken = false; }
                process.stdout.write(token);
                tokenBuffer += token;
              }
              // Capture usage wherever the API decides to send it
              // (could be a mid-stream chunk or the final one before [DONE])
              if (json.usage) usageData = json.usage;
            } catch { /* malformed chunk — skip */ }
          }
        });

        tap.on('end', () => {
          // Flush any remaining line that arrived without a trailing newline
          if (lineBuffer.startsWith('data: ')) {
            const raw = lineBuffer.slice(6).trim();
            if (raw && raw !== '[DONE]') {
              try {
                const json = JSON.parse(raw);
                if (json.usage) usageData = json.usage;
              } catch { /* ignore */ }
            }
          }
          console.log(`\n[ApiClient] ✔ Stream ended. Chars received: ${tokenBuffer.length}`);
        });

        upstream.pipe(tap);

        // ── Client wanted streaming: pipe SSE straight through ───────────
        if (clientWantsStream) {
          expressRes.status(statusCode);
          expressRes.setHeader('Content-Type',  'text/event-stream');
          expressRes.setHeader('Cache-Control', 'no-cache');
          expressRes.setHeader('Connection',    'keep-alive');
          for (const h of ['x-request-id', 'openai-version', 'openai-processing-ms']) {
            const v = upstream.headers[h];
            if (v) expressRes.setHeader(h, v);
          }
          tap.pipe(expressRes);
          tap.on('end',   () => resolve({ statusCode, body: null }));
          tap.on('error', reject);
          return;
        }

        // ── Client wanted non-streaming: buffer → reassemble → send JSON ──
        tap.resume(); // drain but don't pipe to expressRes yet
        tap.on('end', () => {
          if (expressRes.headersSent) return;

          const wordCount = tokenBuffer.split(/\s+/).filter(Boolean).length;
          const completion = {
            id:      'chatcmpl-proxy',
            object:  'chat.completion',
            model:   body.model,
            choices: [{
              index:         0,
              message:       { role: 'assistant', content: tokenBuffer },
              finish_reason: 'stop',
            }],
            // FIX: usageData is now reliably populated via stream_options.include_usage
            usage: usageData ?? {
              prompt_tokens:     0,
              completion_tokens: wordCount,
              total_tokens:      wordCount,
            },
          };
          console.log(
            `[ApiClient] Tokens used — prompt: ${completion.usage.prompt_tokens}, ` +
            `completion: ${completion.usage.completion_tokens}` +
            (usageData ? '' : ' (estimated — API did not return usage)')
          );
          expressRes.status(200).json(completion);
          resolve({ statusCode, body: completion });
        });
        tap.on('error', reject);
      });

      req.on('error', reject);
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error(`Upstream timed out after ${this.timeoutMs / 1000}s`));
      });
      req.write(payload);
      req.end();
    });
  }

  async forward(upstreamPath, body, expressRes) {
    const clientWantsStream = !!body?.stream;

    // FIX: request usage data in the SSE stream so prompt_tokens is real.
    // stream_options is an OpenAI-compatible extension supported by NVIDIA NIM.
    const upstreamBody = {
      ...body,
      stream: true,
      stream_options: { include_usage: true },
    };
    const payload   = JSON.stringify(upstreamBody);
    const targetUrl = `${this.apiBase}${upstreamPath}`;

    console.log(
      `[ApiClient] → POST ${targetUrl} ` +
      `(clientStream=${clientWantsStream}, upstreamStream=true, model=${body?.model ?? 'unknown'})`
    );

    for (let attempt = 1; attempt <= RETRY_429_MAX; attempt++) {
      let result;
      try {
        result = await this._attempt(upstreamPath, upstreamBody, expressRes, clientWantsStream, payload);
      } catch (err) {
        console.error(`[ApiClient] Network error: ${err.message}`);
        this._sendError(expressRes, 502, `Proxy upstream error: ${err.message}`);
        return;
      }

      const { statusCode, body: responseBody } = result;

      if (statusCode === 429) {
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
        continue;
      }

      if (statusCode >= 400) {
        console.error(`[ApiClient] Upstream error ${statusCode}:`, JSON.stringify(responseBody));
        if (!expressRes.headersSent) expressRes.status(statusCode).json(responseBody);
        return;
      }

      if (clientWantsStream) {
        console.log(`[ApiClient] ✔ Stream complete (attempt ${attempt})`);
      } else {
        console.log(`[ApiClient] ✔ Non-stream response sent (attempt ${attempt})`);
      }
      return;
    }
  }
}

module.exports = ApiClient;
