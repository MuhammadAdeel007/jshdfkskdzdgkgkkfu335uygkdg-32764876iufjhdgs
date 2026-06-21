'use strict';

/**
 * rateLimiter.js
 *
 * Fixed-minute-window rate limiter.
 *
 * Rules:
 *  - At most `maxPerMinute` requests are RELEASED per calendar minute (UTC).
 *  - Any request arriving when the current-minute bucket is full is queued.
 *  - On each minute boundary, the counter resets and the queue is drained
 *    (up to `maxPerMinute` queued requests are released in FIFO order).
 *  - Queued requests can optionally time out after `queueTimeoutMs`.
 */
class RateLimiter {
  /**
   * @param {object}  [opts]
   * @param {number}  [opts.maxPerMinute=30]       – hard cap per calendar minute
   * @param {number}  [opts.queueTimeoutMs=600000] – max wait time in queue (10 min default)
   * @param {number}  [opts.tickMs=500]            – how often to poll for minute rollover
   */
  constructor({ maxPerMinute = 30, maxTokensPerMinute = 40_000, queueTimeoutMs = 600_000, tickMs = 500 } = {}) {
    this.maxPerMinute   = maxPerMinute;
    this.maxTokensPerMinute = maxTokensPerMinute;
    this.queueTimeoutMs = queueTimeoutMs;

    this._currentMinute = RateLimiter._minuteKey();
    this._count         = 0;
    this._tokenCount    = 0;
    this._queue         = []; // { resolve, reject, label, timerId }

    this._timer = setInterval(() => this._tick(), tickMs);
    if (this._timer.unref) this._timer.unref();

    console.log(
      `[RateLimiter] Initialised — ` +
      `RPM limit: ${maxPerMinute}, ` +
      `TPM limit: ${maxTokensPerMinute}, ` +
      `queue timeout: ${queueTimeoutMs / 1000}s`
    );
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Returns a stable integer that increments every calendar minute (UTC). */
  static _minuteKey() {
    const d = new Date();
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  
  static estimateTokens(body) {
    if (!body) return 2_000;
    let chars = 0;
 
    // Count characters in each message's content (the bulk of tokens)
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
 
    // Add ~10% for JSON envelope, role names, model name, etc.
    chars = Math.ceil(chars * 1.1);
    const estimated = Math.max(100, Math.ceil(chars / 4));
    return estimated;
  }

  /** Called every `tickMs`. Detects minute rollover and drains the queue. */
  _tick() {
    const minute = RateLimiter._minuteKey();
    if (minute !== this._currentMinute) {
      console.log(
        `[RateLimiter] ⏱  Minute rolled over ${this._currentMinute} → ${minute}. ` +
        `Used: ${this._reqCount} req / ${this._tokenCount} tokens. ` +
        `Queue depth: ${this._queue.length}`
      );
      this._currentMinute = minute;
      this._reqCount      = 0;
      this._tokenCount    = 0;
      this._drainQueue();
    }
  }

  _canFit(tokens) {
    return (
      this._reqCount  <  this.maxPerMinute &&
      this._tokenCount + tokens <= this.maxTokensPerMinute
    );
  }

  /**
   * Release as many queued entries as the current-minute bucket allows.
   * Called after a minute rollover.
   */
  _drainQueue() {
    let released = 0;
    while (this._queue.length > 0) {
      const next = this._queue[0];
      if (!this._canFit(next.tokens)) break; // Still no room — stop draining
 
      this._queue.shift();
      clearTimeout(next.timerId);
      this._reqCount++;
      this._tokenCount += next.tokens;
      released++;
 
      console.log(
        `[RateLimiter] ↑ Released queued "${next.label}" ` +
        `(~${next.tokens} tokens, slot ${this._reqCount}/${this.maxPerMinute}, ` +
        `tokens ${this._tokenCount}/${this.maxTokensPerMinute})`
      );
      next.resolve();
    }
 
    if (released > 0) {
      console.log(`[RateLimiter] Drained ${released} request(s) from queue.`);
    }
    if (this._queue.length > 0) {
      const next = this._queue[0];
      console.log(
        `[RateLimiter] ${this._queue.length} request(s) still queued. ` +
        `Next needs ~${next.tokens} tokens ` +
        `(${this.maxTokensPerMinute - this._tokenCount} remaining this minute).`
      );
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Acquire a rate-limit slot.
   *
   * - Resolves immediately when under the per-minute cap.
   * - Queues the caller and resolves on the next minute boundary if at cap.
   * - Rejects with a timeout error if the request waits longer than `queueTimeoutMs`.
   *
   * @param {string} [label='req'] – Descriptive label used in log output.
   * @returns {Promise<void>}
   */
  acquire(label = 'req', body = null) {
        // Sync check for minute rollover between ticks
    const minute = RateLimiter._minuteKey();
    if (minute !== this._currentMinute) {
      this._currentMinute = minute;
      this._reqCount      = 0;
      this._tokenCount    = 0;
    }
 
    const tokens = RateLimiter.estimateTokens(body);
 
    if (this._canFit(tokens)) {
      this._reqCount++;
      this._tokenCount += tokens;
      console.log(
        `[RateLimiter] ✔ Granted "${label}" immediately ` +
        `(~${tokens} tokens, slot ${this._reqCount}/${this.maxPerMinute}, ` +
        `tokens ${this._tokenCount}/${this.maxTokensPerMinute})`
      );
      return Promise.resolve();
    }
 
    // Determine which limit is the bottleneck for the log message
    const reason = this._reqCount >= this.maxPerMinute
      ? `RPM full (${this._reqCount}/${this.maxPerMinute})`
      : `TPM full (${this._tokenCount}+${tokens} > ${this.maxTokensPerMinute})`;
 
    console.log(
      `[RateLimiter] ⏳ Queuing "${label}" — ${reason}. ` +
      `Queue depth after enqueue: ${this._queue.length + 1}`
    );
 
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        this._queue = this._queue.filter((e) => e.timerId !== timerId);
        reject(new Error(
          `[RateLimiter] "${label}" timed out after ${this.queueTimeoutMs / 1000}s in queue.`
        ));
      }, this.queueTimeoutMs);
 
      this._queue.push({ resolve, reject, label, tokens, timerId });
    });
  }
 
  get queueDepth()    { return this._queue.length; }
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
