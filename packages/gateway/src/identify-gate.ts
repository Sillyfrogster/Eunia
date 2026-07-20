import { IDENTIFY_COOLDOWN_MS } from "./constants";

const wait = (ms: number): Promise<void> => Bun.sleep(ms);

/** Coordinates identify calls across concurrency buckets. */
export class IdentifyGate {
  private readonly chains: Promise<void>[];
  private readonly lastIdentifiedAt: number[];

  constructor(readonly maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new RangeError("maxConcurrency must be a positive integer.");
    }
    this.chains = Array.from({ length: maxConcurrency }, () => Promise.resolve());
    this.lastIdentifiedAt = Array.from({ length: maxConcurrency }, () => 0);
  }

  async acquire(shardId: number): Promise<void> {
    if (!Number.isInteger(shardId) || shardId < 0) {
      throw new RangeError("shardId must be a non-negative integer.");
    }
    const bucket = shardId % this.maxConcurrency;
    const previous = this.chains[bucket] ?? Promise.resolve();
    const next = previous.then(async () => {
      const last = this.lastIdentifiedAt[bucket] ?? 0;
      const delay = IDENTIFY_COOLDOWN_MS - (Date.now() - last);
      if (delay > 0) await wait(delay);
      this.lastIdentifiedAt[bucket] = Date.now();
    });
    this.chains[bucket] = next.catch(() => undefined);
    await next;
  }
}
