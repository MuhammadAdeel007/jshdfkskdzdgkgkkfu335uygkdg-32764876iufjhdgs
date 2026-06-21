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
  constructor({ maxPerMinute = 30, queueTimeoutMs = 600_000, tickMs = 500 } = {}) {
    this.maxPerMinute   = maxPerMinute;
    this.queueTimeoutMs = queueTimeoutMs;

    this._currentMinute = RateLimiter._minuteKey();
    this._count         = 0;
    this._queue         = []; // { resolve, reject, label, timerId }

    this._timer = setInterval(() => this._tick(), tickMs);
    // Don't keep the process alive just for this interval
    if (this._timer.unref) this._timer.unref();

    console.log(
      `[RateLimiter] Initialised — limit=${maxPerMinute} req/min, ` +
      `queue timeout=${queueTimeoutMs / 1000}s`
    );
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Returns a stable integer that increments every calendar minute (UTC). */
  static _minuteKey() {
    const d = new Date();
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  /** Called every `tickMs`. Detects minute rollover and drains the queue. */
  _tick() {
    const minute = RateLimiter._minuteKey();
    if (minute !== this._currentMinute) {
      const prev = this._currentMinute;
      this._currentMinute = minute;
      this._count         = 0;
      console.log(
        `[RateLimiter] ⏱  Minute rolled over ${prev} → ${minute}. ` +
        `Queue depth: ${this._queue.length}`
      );
      this._drainQueue();
    }
  }

  /**
   * Release as many queued entries as the current-minute bucket allows.
   * Called after a minute rollover.
   */
  _drainQueue() {
    let released = 0;
    while (this._queue.length > 0 && this._count < this.maxPerMinute) {
      const entry = this._queue.shift();
      clearTimeout(entry.timerId);
      this._count++;
      released++;
      console.log(
        `[RateLimiter] ↑ Released queued "${entry.label}" ` +
        `(slot ${this._count}/${this.maxPerMinute})`
      );
      entry.resolve();
    }

    if (released > 0) {
      console.log(`[RateLimiter] Drained ${released} request(s) from queue.`);
    }
    if (this._queue.length > 0) {
      console.log(
        `[RateLimiter] ${this._queue.length} request(s) still queued ` +
        `(bucket full for this minute — will drain next minute).`
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
  acquire(label = 'req') {
    // Sync check in case the minute rolled over between ticks
    const minute = RateLimiter._minuteKey();
    if (minute !== this._currentMinute) {
      this._currentMinute = minute;
      this._count         = 0;
    }

    if (this._count < this.maxPerMinute) {
      this._count++;
      console.log(
        `[RateLimiter] ✔ Granted "${label}" immediately ` +
        `(slot ${this._count}/${this.maxPerMinute})`
      );
      return Promise.resolve();
    }

    // Bucket full — queue the request
    console.log(
      `[RateLimiter] ⏳ Queuing "${label}" — bucket full ` +
      `(${this._count}/${this.maxPerMinute}). ` +
      `Queue depth after enqueue: ${this._queue.length + 1}`
    );

    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        // Remove from queue so it doesn't get processed later
        this._queue = this._queue.filter((e) => e.timerId !== timerId);
        reject(
          new Error(
            `[RateLimiter] Request "${label}" timed out after ` +
            `${this.queueTimeoutMs / 1000}s in queue.`
          )
        );
      }, this.queueTimeoutMs);

      this._queue.push({ resolve, reject, label, timerId });
    });
  }

  /** Current number of requests waiting in queue. */
  get queueDepth() {
    return this._queue.length;
  }

  /** Current slot usage in the active minute. */
  get currentCount() {
    return this._count;
  }

  /** Tear down: stop polling and reject all queued requests. */
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
