'use strict';

/**
 * rateLimiter.js
 *
 * Fixed-minute-window rate limiter.
 *
 * Gates ONLY on RPM (requests per minute) — the one limit we know exactly.
 * Token usage is estimated and logged for visibility but does NOT gate requests.
 * TPM-based 429s are handled reactively in apiClient via Retry-After.
 */
class RateLimiter {
  /**
   * @param {object} opts
   * @param {number} [opts.maxPerMinute=30]          - Max requests per calendar minute
   * @param {number} [opts.maxTokensPerMinute=40000] - Logged only, not used for gating
   * @param {number} [opts.queueTimeoutMs=600000]    - Max ms a request waits in queue
   * @param {number} [opts.tickMs=500]               - Minute-rollover poll interval
   */
  constructor({
    maxPerMinute       = 30,
    maxTokensPerMinute = 40_000,
    queueTimeoutMs     = 600_000,
    tickMs             = 500,
  } = {}) {
    this.maxPerMinute       = maxPerMinute;
    this.maxTokensPerMinute = maxTokensPerMinute; // for logging only
    this.queueTimeoutMs     = queueTimeoutMs;

    this._currentMinute = RateLimiter._minuteKey();
    this._reqCount      = 0;
    this._tokenCount    = 0;
    this._queue         = [];

    this._timer = setInterval(() => this._tick(), tickMs);
    if (this._timer.unref) this._timer.unref();

    console.log(
      `[RateLimiter] Initialised — ` +
      `RPM limit: ${maxPerMinute} (enforced), ` +
      `TPM reference: ${maxTokensPerMinute} (logged only), ` +
      `queue timeout: ${queueTimeoutMs / 1000}s`
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  static _minuteKey() {
    const d = new Date();
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  /**
   * Estimate tokens from a request body.
   * Used for logging only — does NOT affect whether a request is queued.
   * Approximation: total message characters / 4 (1 token ≈ 4 chars).
   */
  static estimateTokens(body) {
    if (!body) return 0;

    let chars = 0;

    if (Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        if (typeof msg.content === 'string') {
          chars += msg.content.length;
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part?.text) chars += part.text.length;
          }
        }
      }
    }

    chars = Math.ceil(chars * 1.1); // add ~10% for envelope/role tokens
    return Math.max(0, Math.ceil(chars / 4));
  }

  // ── Gating (RPM only) ─────────────────────────────────────────────────────

  _canFit() {
    // Gate ONLY on RPM. We know this limit exactly.
    // TPM is handled reactively in apiClient via 429 + Retry-After.
    return this._reqCount < this.maxPerMinute;
  }

  _tick() {
    const minute = RateLimiter._minuteKey();
    if (minute !== this._currentMinute) {
      console.log(
        `[RateLimiter] ⏱  Minute rolled over ${this._currentMinute} → ${minute}. ` +
        `Used: ${this._reqCount} req, ~${this._tokenCount} tokens. ` +
        `Queue depth: ${this._queue.length}`
      );
      this._currentMinute = minute;
      this._reqCount      = 0;
      this._tokenCount    = 0;
      this._drainQueue();
    }
  }

  _drainQueue() {
    let released = 0;
    while (this._queue.length > 0 && this._canFit()) {
      const entry = this._queue.shift();
      clearTimeout(entry.timerId);
      this._reqCount++;
      this._tokenCount += entry.tokens;
      released++;
      console.log(
        `[RateLimiter] ↑ Released queued "${entry.label}" ` +
        `(slot ${this._reqCount}/${this.maxPerMinute}, ~${entry.tokens} tokens)`
      );
      entry.resolve();
    }

    if (released > 0) {
      console.log(`[RateLimiter] Drained ${released} request(s) from queue.`);
    }
    if (this._queue.length > 0) {
      console.log(
        `[RateLimiter] ${this._queue.length} request(s) still waiting — ` +
        `RPM full (${this._reqCount}/${this.maxPerMinute}). Will drain next minute.`
      );
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Acquire a rate-limit slot.
   *
   * Resolves immediately if under RPM cap.
   * Queues and resolves at next minute boundary if at cap.
   *
   * @param {string} label - Label for logging
   * @param {object} body  - Request body (used for token estimate logging only)
   * @returns {Promise<void>}
   */
  acquire(label = 'req', body = null) {
    // Sync check in case tick hasn't fired yet
    const minute = RateLimiter._minuteKey();
    if (minute !== this._currentMinute) {
      this._currentMinute = minute;
      this._reqCount      = 0;
      this._tokenCount    = 0;
    }

    const tokens = RateLimiter.estimateTokens(body);

    if (this._canFit()) {
      this._reqCount++;
      this._tokenCount += tokens;
      console.log(
        `[RateLimiter] ✔ Granted "${label}" immediately ` +
        `(slot ${this._reqCount}/${this.maxPerMinute}, ` +
        `~${tokens} tokens, minute total ~${this._tokenCount})`
      );
      return Promise.resolve();
    }

    // RPM cap reached — queue until next minute
    console.log(
      `[RateLimiter] ⏳ Queuing "${label}" — ` +
      `RPM full (${this._reqCount}/${this.maxPerMinute}). ` +
      `~${tokens} estimated tokens. ` +
      `Queue depth after enqueue: ${this._queue.length + 1}`
    );

    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        this._queue = this._queue.filter((e) => e.timerId !== timerId);
        reject(new Error(
          `[RateLimiter] "${label}" timed out after ` +
          `${this.queueTimeoutMs / 1000}s in queue.`
        ));
      }, this.queueTimeoutMs);

      this._queue.push({ resolve, reject, label, tokens, timerId });
    });
  }

  get queueDepth()        { return this._queue.length; }
  get currentReqCount()   { return this._reqCount; }
  get currentTokenCount() { return this._tokenCount; }

  destroy() {
    clearInterval(this._timer);
    const remaining = this._queue.splice(0);
    for (const { reject, timerId } of remaining) {
      clearTimeout(timerId);
      reject(new Error('[RateLimiter] Proxy shutting down.'));
    }
    console.log(`[RateLimiter] Destroyed. Rejected ${remaining.length} queued request(s).`);
  }
}

module.exports = RateLimiter;
