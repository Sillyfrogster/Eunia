/**
 * The bot-wide request ceiling above every per-route bucket (default
 * 50 requests/second). A request must clear both its bucket's window and
 * this limiter before it is sent; all buckets share one instance.
 */
export class GlobalLimiter {
  private readonly sentAt: number[] = [];
  private firstLive = 0;
  /** Set by a global 429: nothing may be sent before this timestamp. */
  private blockedUntil = 0;

  constructor(private readonly requestsPerSecond: number) {
    if (
      requestsPerSecond !== Number.POSITIVE_INFINITY &&
      (!Number.isSafeInteger(requestsPerSecond) || requestsPerSecond < 1)
    ) {
      throw new RangeError("Global request limits must be positive safe integers.");
    }
  }

  /** Returns how long to wait before sending; 0 means go now. */
  delayMs(): number {
    const now = Date.now();
    if (now < this.blockedUntil) return this.blockedUntil - now;
    if (this.requestsPerSecond === Number.POSITIVE_INFINITY) return 0;
    this.removeExpired(now);
    if (this.sentAt.length - this.firstLive < this.requestsPerSecond) return 0;
    return Math.max(1, (this.sentAt[this.firstLive] ?? now) + 1_000 - now);
  }

  /**
   * Records one request sent. Must be called synchronously after a
   * `delayMs() === 0` check so two buckets can't claim the same last slot.
   */
  recordSend(): void {
    if (this.requestsPerSecond === Number.POSITIVE_INFINITY) return;
    const now = Date.now();
    this.removeExpired(now);
    this.sentAt.push(now);
  }

  /** Blocks all sending for this long. Called on a global 429. */
  blockFor(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms);
  }

  private removeExpired(now: number): void {
    while (
      this.sentAt[this.firstLive] !== undefined &&
      this.sentAt[this.firstLive]! <= now - 1_000
    ) {
      this.firstLive += 1;
    }
    if (this.firstLive > 1_024 && this.firstLive * 2 > this.sentAt.length) {
      this.sentAt.splice(0, this.firstLive);
      this.firstLive = 0;
    }
  }
}
