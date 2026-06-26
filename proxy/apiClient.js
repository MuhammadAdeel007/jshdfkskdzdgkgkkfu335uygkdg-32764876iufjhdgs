'use strict';

const https = require('https');
const http  = require('http');
const { PassThrough } = require('stream');
const { URL } = require('url');

const RETRY_MAX     = 6;     // shared cap for both 429 and network retries
const RETRY_429_BASE_MS   = 30_000;
const RETRY_NETWORK_BASE_MS = 5_000;  // start at 5s for network errors, doubles each attempt
const RETRY_CAP_MS  = 600_000;

// Node.js error codes that are safe to retry (server not reached or dropped us)
const RETRYABLE_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED',
  'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH',
]);

function isRetryableNetworkError(err) {
  return RETRYABLE_CODES.has(err.code) || /timed out/i.test(err.message);
}

// Unicode box-drawing block U+2500–U+257F.
// Minimax-m3 wraps output in decorative borders; aider's wholefile parser
// tries to os.stat() those lines as filenames → OSError [Errno 36] File name too long.
const BOX_DRAWING_RE = /[\u2500-\u257F]/g;

function sanitizeForAider(text) {
  return text.replace(BOX_DRAWING_RE, ch => {
    switch (ch) {
      case '─': case '━': return '-';
      case '│': case '┃': return '|';
      case '┌': case '┍': case '┎': case '┏':
      case '┐': case '┑': case '┒': case '┓':
      case '└': case '┕': case '┖': case '┗':
      case '┘': case '┙': case '┚': case '┛':
      case '├': case '┤': case '┬': case '┴': case '┼': return '+';
      default: return '';
    }
  });
}

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

  _attempt(upstreamPath, body, expressRes, clientWantsStream, payload) {
    const targetUrl = `${this.apiBase}${upstreamPath}`;
    const options   = this._buildOptions(targetUrl, Buffer.byteLength(payload));
    const transport = targetUrl.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (upstream) => {
        const { statusCode, statusMessage } = upstream;
        console.log(`[ApiClient] ← ${statusCode} ${statusMessage}`);

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

        const tap         = new PassThrough();
        let   tokenBuffer = '';
        let   usageData   = null;
        let   firstToken  = true;
        let   lineBuffer  = '';

        tap.on('data', chunk => {
          lineBuffer += chunk.toString();
          const lines = lineBuffer.split('\n');
          lineBuffer  = lines.pop() ?? '';

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
              if (json.usage) usageData = json.usage;
            } catch { /* partial chunk */ }
          }
        });

        tap.on('end', () => {
          if (lineBuffer.startsWith('data: ')) {
            const raw = lineBuffer.slice(6).trim();
            if (raw && raw !== '[DONE]') {
              try { const j = JSON.parse(raw); if (j.usage) usageData = j.usage; } catch {}
            }
          }
          console.log(`\n[ApiClient] ✔ Stream ended. Chars received: ${tokenBuffer.length}`);
        });

        upstream.pipe(tap);

        // ── Streaming client: pipe SSE bytes straight through ────────────
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

        // ── Non-streaming client: buffer → sanitize → JSON ───────────────
        tap.resume();
        tap.on('end', () => {
          if (expressRes.headersSent) return;

          const safeContent = sanitizeForAider(tokenBuffer);
          if (safeContent.length !== tokenBuffer.length) {
            console.log(
              `[ApiClient] ⚠  Sanitized ${tokenBuffer.length - safeContent.length} box-drawing chars`
            );
          }

          const wordCount = safeContent.split(/\s+/).filter(Boolean).length;
          const completion = {
            id:      'chatcmpl-proxy',
            object:  'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model:   body.model,
            choices: [{
              index:         0,
              message:       { role: 'assistant', content: safeContent },
              finish_reason: 'stop',
            }],
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

    for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
      let result;
      try {
        result = await this._attempt(upstreamPath, upstreamBody, expressRes, clientWantsStream, payload);
      } catch (err) {
        // ── Network-level errors: retry with backoff ─────────────────────
        // Previously these bailed out immediately with 502, meaning a single
        // ETIMEDOUT/ECONNRESET would fail the entire aider request with no
        // recovery.  Now they retry just like 429s do.
        if (isRetryableNetworkError(err) && attempt < RETRY_MAX) {
          const waitMs = Math.min(
            RETRY_CAP_MS,
            RETRY_NETWORK_BASE_MS * Math.pow(2, attempt - 1),
          );
          console.warn(
            `[ApiClient] ⚠  Network error on attempt ${attempt}/${RETRY_MAX}: ` +
            `${err.code ?? ''} ${err.message}. ` +
            `Retrying in ${waitMs / 1000}s…`
          );
          await this._sleep(waitMs);
          continue;
        }

        // Non-retryable or exhausted retries
        console.error(`[ApiClient] ✘ Network error (no more retries): ${err.message}`);
        this._sendError(expressRes, 502, `Proxy upstream error: ${err.message}`);
        return;
      }

      const { statusCode, body: responseBody } = result;

      // ── 429 rate-limit: wait and retry ───────────────────────────────
      if (statusCode === 429) {
        const retryAfterHeader = result.headers?.['retry-after'];
        const retryAfterMs     = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : Math.min(RETRY_CAP_MS, RETRY_429_BASE_MS * Math.pow(2, attempt - 1));

        console.warn(
          `[ApiClient] ⚠  Upstream 429 on attempt ${attempt}/${RETRY_MAX}. ` +
          `Waiting ${retryAfterMs / 1000}s ` +
          `(${retryAfterHeader ? 'from Retry-After header' : 'exponential backoff'}) — ` +
          `Aider is unaware.`
        );

        if (attempt === RETRY_MAX) {
          console.error(`[ApiClient] ✘ Gave up after ${RETRY_MAX} attempts (all 429).`);
          this._sendError(expressRes, 429,
            `Upstream rate limit persists after ${RETRY_MAX} retries. Try again later.`
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

      console.log(
        clientWantsStream
          ? `[ApiClient] ✔ Stream complete (attempt ${attempt})`
          : `[ApiClient] ✔ Non-stream response sent (attempt ${attempt})`
      );
      return;
    }
  }
}

module.exports = ApiClient;
