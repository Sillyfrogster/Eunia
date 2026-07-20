import type { Awaitable } from "./types";

export interface CooldownRequest {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly now: number;
}

export interface CooldownResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
  readonly saturated?: boolean;
}

export interface CooldownStore {
  /** Count and test one command use as one atomic operation. */
  consume(request: CooldownRequest): Awaitable<CooldownResult>;
}

export interface MemoryCooldownStoreOptions {
  readonly maxEntries?: number;
  readonly sweepIntervalMs?: number;
}

interface CooldownEntry {
  count: number;
  resetAt: number;
}

export class MemoryCooldownStore implements CooldownStore {
  private readonly entries = new Map<string, CooldownEntry>();
  private readonly maxEntries: number;
  private readonly sweepIntervalMs: number;
  private nextSweepAt = 0;

  constructor(options: MemoryCooldownStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 50_000;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 30_000;

    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive integer.");
    }
    if (!Number.isFinite(this.sweepIntervalMs) || this.sweepIntervalMs < 0) {
      throw new RangeError("sweepIntervalMs must be zero or greater.");
    }
  }

  get size(): number {
    return this.entries.size;
  }

  consume(request: CooldownRequest): CooldownResult {
    validateRequest(request);
    this.sweepIfDue(request.now);

    const current = this.entries.get(request.key);
    if (current !== undefined && current.resetAt > request.now) {
      if (current.count >= request.limit) {
        return { allowed: false, remaining: 0, resetAt: current.resetAt };
      }

      current.count += 1;
      return {
        allowed: true,
        remaining: Math.max(0, request.limit - current.count),
        resetAt: current.resetAt,
      };
    }

    if (current !== undefined) this.entries.delete(request.key);
    if (this.entries.size >= this.maxEntries) this.sweep(request.now);

    if (this.entries.size >= this.maxEntries) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: this.earliestResetAt(request.now + request.windowMs),
        saturated: true,
      };
    }

    const resetAt = request.now + request.windowMs;
    this.entries.set(request.key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, request.limit - 1),
      resetAt,
    };
  }

  clear(): void {
    this.entries.clear();
    this.nextSweepAt = 0;
  }

  private sweepIfDue(now: number): void {
    if (now < this.nextSweepAt) return;
    this.sweep(now);
    this.nextSweepAt = now + this.sweepIntervalMs;
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }

  private earliestResetAt(fallback: number): number {
    let earliest = Number.POSITIVE_INFINITY;
    for (const entry of this.entries.values()) {
      earliest = Math.min(earliest, entry.resetAt);
    }
    return Number.isFinite(earliest) ? earliest : fallback;
  }
}

function validateRequest(request: CooldownRequest): void {
  if (request.key.length === 0) throw new RangeError("Cooldown keys cannot be empty.");
  if (!Number.isSafeInteger(request.limit) || request.limit < 1) {
    throw new RangeError("Cooldown limits must be positive integers.");
  }
  if (!Number.isSafeInteger(request.windowMs) || request.windowMs <= 0) {
    throw new RangeError("Cooldown windows must be positive integers.");
  }
  if (!Number.isFinite(request.now)) throw new RangeError("Cooldown time must be finite.");
}
