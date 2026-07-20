import type { GlobalLimiter } from "./global-limiter";

/** Resolves after `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** One queued request: the work plus the resolvers of the caller's promise. */
interface QueuedRequest {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * One rate-limit bucket: a FIFO queue plus the limit state Discord last
 * reported for it.
 *
 * When headers report the window is exhausted, the queue holds requests until
 * the reset instead of letting them hit 429s. Requests run one at a time, so
 * the first request on an unknown route reveals the real limits before the
 * second is sent.
 *
 * The bucket owns timing and ordering. The rest client owns HTTP and reports
 * header state back through observe().
 */
export class Bucket {
  /**
   * This bucket's key in the rest client's map: the route key at first,
   * then `${hash}:${majorParam}` once the real bucket hash is known.
   */
  key: string;

  private readonly queue: QueuedRequest[] = [];
  private draining = false;
  private redirect: Bucket | null = null;
  private lastTouchedAt = Date.now();

  /** Last reported limit state. The initial values never block. */
  private limit = 1;
  private remaining = 1;
  private resetAt = 0;

  constructor(key: string, private readonly global: GlobalLimiter) {
    this.key = key;
  }

  /**
   * Queues a request. The returned promise settles with the task's own
   * result or failure when its turn completes.
   */
  enqueue<T>(run: () => Promise<T>): Promise<T> {
    if (this.redirect !== null) return this.redirect.enqueue(run);
    this.lastTouchedAt = Date.now();
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    this.queue.push({
      run,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    if (!this.draining) void this.drain();
    return promise;
  }

  /** Updates limit state from response headers. Called on every response. */
  observe(limit: number, remaining: number, resetAfterMs: number): void {
    if (this.redirect !== null) {
      this.redirect.observe(limit, remaining, resetAfterMs);
      return;
    }
    this.limit = limit;
    this.remaining = remaining;
    this.resetAt = Date.now() + resetAfterMs;
    this.lastTouchedAt = Date.now();
  }

  get isIdle(): boolean {
    return !this.draining && this.queue.length === 0;
  }

  get lastUsedAt(): number {
    return this.lastTouchedAt;
  }

  /** Moves queued and future work to the canonical bucket. */
  redirectTo(target: Bucket): void {
    const destination = target.redirect ?? target;
    if (destination === this) return;
    this.redirect = destination;
    destination.queue.push(...this.queue.splice(0));
    if (!destination.draining && destination.queue.length > 0) void destination.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        await this.waitForCapacity();
        const next = this.queue.shift();
        if (!next) break;
        // The next observe() replaces this guess with the reported values.
        this.remaining -= 1;
        try {
          // A failing request must not block the requests queued behind it.
          next.resolve(await next.run());
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /** Waits until both the bucket window and the global limiter allow a send. */
  private async waitForCapacity(): Promise<void> {
    if (this.remaining <= 0) {
      const wait = this.resetAt - Date.now();
      if (wait > 0) await sleep(wait);
      this.remaining = this.limit;
    }

    // Other buckets may take global slots while this one sleeps.
    let delay = this.global.delayMs();
    while (delay > 0) {
      await sleep(delay);
      delay = this.global.delayMs();
    }
    this.global.recordSend();
  }
}
