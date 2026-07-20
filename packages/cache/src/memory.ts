export interface MemoryStoreOptions {
  maxSize?: number;
  ttl?: number;
  now?: () => number;
}

interface MemoryEntry<T> {
  value: T;
  expiresAt?: number;
}

const DEFAULT_MAX_SIZE = 1_000;

export class MemoryStore<T> {
  readonly maxSize: number;
  readonly ttl: number | undefined;

  private readonly items = new Map<string, MemoryEntry<T>>();
  private readonly now: () => number;

  constructor(options: MemoryStoreOptions | number = {}) {
    const resolved =
      typeof options === "number" ? { maxSize: options } : options;

    this.maxSize = resolved.maxSize ?? DEFAULT_MAX_SIZE;
    this.ttl = resolved.ttl;
    this.now = resolved.now ?? Date.now;

    assertMaxSize(this.maxSize);
    if (this.ttl !== undefined) assertTtl(this.ttl);
  }

  resolve(id: string): T | undefined {
    return this.get(id);
  }

  get(id: string): T | undefined {
    const entry = this.items.get(id);
    if (entry === undefined) return undefined;

    if (this.isExpired(entry)) {
      this.items.delete(id);
      return undefined;
    }

    this.items.delete(id);
    this.items.set(id, entry);
    return entry.value;
  }

  set(id: string, value: T, ttl = this.ttl): void {
    if (ttl !== undefined) assertTtl(ttl);

    const entry: MemoryEntry<T> =
      ttl === undefined
        ? { value }
        : { value, expiresAt: this.now() + ttl };

    this.items.delete(id);
    this.items.set(id, entry);
    this.evictOverflow();
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  has(id: string): boolean {
    const entry = this.items.get(id);
    if (entry === undefined) return false;
    if (this.isExpired(entry)) {
      this.items.delete(id);
      return false;
    }

    this.items.delete(id);
    this.items.set(id, entry);
    return true;
  }

  clear(): void {
    this.items.clear();
  }

  get size(): number {
    this.removeExpired();
    return this.items.size;
  }

  *values(): IterableIterator<T> {
    this.removeExpired();
    for (const entry of this.items.values()) yield entry.value;
  }

  *keys(): IterableIterator<string> {
    this.removeExpired();
    yield* this.items.keys();
  }

  *entries(): IterableIterator<[string, T]> {
    this.removeExpired();
    for (const [key, entry] of this.items) yield [key, entry.value];
  }

  private evictOverflow(): void {
    while (this.items.size > this.maxSize) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) return;
      this.items.delete(oldest);
    }
  }

  private isExpired(entry: MemoryEntry<T>): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= this.now();
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [id, entry] of this.items) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        this.items.delete(id);
      }
    }
  }
}

function assertMaxSize(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("maxSize must be a positive safe integer.");
  }
}

export function assertTtl(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("ttl must be a positive whole number of milliseconds.");
  }
}
