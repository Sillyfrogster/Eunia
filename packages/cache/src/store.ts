import type {
  CacheAdapter,
  CacheAdapterOperation,
  CacheErrorContext,
  CacheErrorHandler,
} from "./adapter";
import { assertTtl, MemoryStore } from "./memory";

export interface CachePolicy {
  maxSize?: number;
  ttl?: number;
  readThroughTtl?: number;
  maxPendingOperations?: number;
}

export interface ResolvedCachePolicy {
  maxSize: number;
  ttl?: number;
  readThroughTtl: number;
  maxPendingOperations: number;
}

export interface CacheStoreOptions {
  namespace: string;
  policy?: CachePolicy;
  adapter?: CacheAdapter;
  onError?: CacheErrorHandler;
  now?: () => number;
}

export type CacheBackpressureOperation = Exclude<
  CacheAdapterOperation,
  "close"
>;

export class CacheBackpressureError extends Error {
  readonly code = "CACHE_BACKPRESSURE";

  constructor(
    readonly namespace: string,
    readonly operation: CacheBackpressureOperation,
    readonly limit: number,
    readonly pendingOperations: number,
  ) {
    super(
      `Cache adapter work for "${namespace}" reached its limit of ${limit}; ${operation} was not accepted.`,
    );
    this.name = "CacheBackpressureError";
  }
}

interface AdapterWrite {
  operation: "set" | "delete";
  run: () => Promise<void>;
}

interface KeyWrite {
  started: boolean;
  readonly clearBarrier: Promise<void>;
  task: AdapterWrite;
  settled: Promise<void>;
}

export const DEFAULT_CACHE_READ_THROUGH_TTL = 5 * 60 * 1_000;
export const DEFAULT_CACHE_MAX_PENDING_OPERATIONS = 1_000;

const DEFAULT_MAX_SIZE = 1_000;

export class CacheStore<T> {
  readonly namespace: string;
  readonly policy: Readonly<ResolvedCachePolicy>;
  readonly hot: MemoryStore<T>;

  private readonly adapter: CacheAdapter | undefined;
  private readonly onError: CacheErrorHandler | undefined;
  private readonly keyWrites = new Map<string, KeyWrite>();
  private readonly pendingWrites = new Set<Promise<void>>();
  private readonly reads = new Map<string, Promise<T | undefined>>();
  private readonly keyVersions = new Map<string, symbol>();
  private clearVersion = Symbol();
  private clearWrite: Promise<void> = Promise.resolve();
  private clearPending = false;

  constructor(options: CacheStoreOptions) {
    if (options.namespace.trim().length === 0) {
      throw new TypeError("Cache namespaces cannot be empty.");
    }

    this.namespace = options.namespace;
    this.adapter = options.adapter;
    this.onError = options.onError;

    const maxSize = options.policy?.maxSize ?? DEFAULT_MAX_SIZE;
    const ttl = options.policy?.ttl;
    const readThroughTtl =
      options.policy?.readThroughTtl ??
      ttl ??
      DEFAULT_CACHE_READ_THROUGH_TTL;
    const maxPendingOperations =
      options.policy?.maxPendingOperations ??
      DEFAULT_CACHE_MAX_PENDING_OPERATIONS;

    assertTtl(readThroughTtl);
    assertPositiveSafeInteger(
      maxPendingOperations,
      "maxPendingOperations",
    );

    this.policy =
      ttl === undefined
        ? { maxSize, readThroughTtl, maxPendingOperations }
        : { maxSize, ttl, readThroughTtl, maxPendingOperations };
    this.hot = new MemoryStore<T>({
      maxSize,
      ...(ttl === undefined ? {} : { ttl }),
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  }

  resolve(id: string): T | undefined {
    return this.hot.resolve(id);
  }

  async get(id: string): Promise<T | undefined> {
    const cached = this.resolve(id);
    if (cached !== undefined || this.adapter === undefined) return cached;

    const activeRead = this.reads.get(id);
    if (activeRead !== undefined) return activeRead;

    this.assertCapacity("get");
    const read = this.readThrough(id);
    this.reads.set(id, read);
    void read.then(
      () => this.finishRead(id, read),
      () => this.finishRead(id, read),
    );
    return read;
  }

  has(id: string): boolean {
    return this.hot.has(id);
  }

  set(id: string, value: T, ttl = this.policy.ttl): void {
    if (ttl !== undefined) assertTtl(ttl);
    if (this.adapter !== undefined && !this.canCoalesceKeyWrite(id)) {
      this.assertCapacity("set");
    }

    this.hot.set(id, value, ttl);

    if (this.adapter === undefined) return;
    this.bumpVersion(id);
    this.enqueueKeyWrite(id, {
      operation: "set",
      run: () => this.adapter!.set(this.namespace, id, value, ttl),
    });
  }

  delete(id: string): boolean {
    if (this.adapter !== undefined && !this.canCoalesceKeyWrite(id)) {
      this.assertCapacity("delete");
    }

    const existed = this.hot.delete(id);

    if (this.adapter !== undefined) {
      this.bumpVersion(id);
      this.enqueueKeyWrite(id, {
        operation: "delete",
        run: () => this.adapter!.delete(this.namespace, id),
      });
    }

    return existed;
  }

  clear(): void {
    if (this.adapter !== undefined) this.assertCapacity("clear");

    this.hot.clear();
    this.clearVersion = Symbol();

    if (this.adapter === undefined) return;

    const priorWrites = [
      ...[...this.keyWrites.values()].map((write) => write.settled),
      this.clearWrite,
    ];
    const started = Promise.all(priorWrites).then(() =>
      this.adapter!.clear(this.namespace),
    );
    const settled = this.settleWrite(started, { operation: "clear" });
    this.clearWrite = settled;
    this.clearPending = true;
    this.trackWrite(settled);
    void settled.then(() => {
      if (this.clearWrite === settled) this.clearPending = false;
    });
  }

  get size(): number {
    return this.hot.size;
  }

  get pendingOperations(): number {
    return this.pendingWrites.size + this.reads.size;
  }

  values(): IterableIterator<T> {
    return this.hot.values();
  }

  keys(): IterableIterator<string> {
    return this.hot.keys();
  }

  async list(prefix = ""): Promise<readonly string[]> {
    const keys = new Set([...this.hot.keys()].filter((key) => key.startsWith(prefix)));
    if (this.adapter === undefined) return [...keys];

    await this.flush();
    try {
      for (const key of await this.adapter.keys(this.namespace, prefix)) keys.add(key);
      return [...keys];
    } catch (error) {
      await this.report(error, { operation: "keys" });
      throw error;
    }
  }

  entries(): IterableIterator<[string, T]> {
    return this.hot.entries();
  }

  async flush(): Promise<void> {
    while (this.pendingWrites.size > 0) {
      await Promise.all(this.pendingWrites);
    }
  }

  private async readThrough(id: string): Promise<T | undefined> {
    if (this.adapter === undefined) return undefined;

    try {
      for (;;) {
        await this.waitForWrites(id);
        if (this.keyWrites.has(id) || this.clearPending) continue;
        const keyVersion = this.keyVersions.get(id);
        const clearVersion = this.clearVersion;
        const value = (await this.adapter.get(this.namespace, id)) as
          | T
          | undefined;
        await this.waitForWrites(id);

        if (
          keyVersion !== this.keyVersions.get(id) ||
          clearVersion !== this.clearVersion
        ) {
          continue;
        }

        if (value !== undefined) {
          this.hot.set(id, value, this.policy.readThroughTtl);
        }
        return value;
      }
    } catch (error) {
      await this.report(error, { operation: "get", key: id });
      throw error;
    }
  }

  private enqueueKeyWrite(id: string, task: AdapterWrite): void {
    const priorKeyWrite = this.keyWrites.get(id);
    const clearBarrier = this.clearWrite;

    if (
      priorKeyWrite !== undefined &&
      !priorKeyWrite.started &&
      priorKeyWrite.clearBarrier === clearBarrier
    ) {
      priorKeyWrite.task = task;
      return;
    }

    const write: KeyWrite = {
      started: false,
      clearBarrier,
      task,
      settled: Promise.resolve(),
    };

    if (priorKeyWrite === undefined && !this.clearPending) {
      write.started = true;
      write.settled = this.executeKeyWrite(id, write);
    } else {
      write.settled = Promise.all([
        priorKeyWrite?.settled,
        clearBarrier,
      ]).then(() => {
        write.started = true;
        return this.executeKeyWrite(id, write);
      });
    }

    this.keyWrites.set(id, write);
    this.trackWrite(write.settled);
    void write.settled.then(() => {
      if (this.keyWrites.get(id) === write) {
        this.keyWrites.delete(id);
        this.removeVersionWhenIdle(id);
      }
    });
  }

  private async executeKeyWrite(id: string, write: KeyWrite): Promise<void> {
    try {
      await write.task.run();
    } catch (error) {
      await this.report(error, { operation: write.task.operation, key: id });
    }
  }

  private settleWrite(
    write: Promise<void>,
    context: Pick<CacheErrorContext, "operation" | "key">,
  ): Promise<void> {
    return write.catch(async (error: unknown) => {
      await this.report(error, context);
    });
  }

  private trackWrite(write: Promise<void>): void {
    this.pendingWrites.add(write);
    void write.then(
      () => this.pendingWrites.delete(write),
      () => this.pendingWrites.delete(write),
    );
  }

  private async waitForWrites(id: string): Promise<void> {
    for (;;) {
      const keyWrite = this.keyWrites.get(id);
      const clearWrite = this.clearWrite;
      await Promise.all([keyWrite?.settled, clearWrite]);
      if (
        keyWrite === this.keyWrites.get(id) &&
        clearWrite === this.clearWrite
      ) {
        return;
      }
    }
  }

  private canCoalesceKeyWrite(id: string): boolean {
    const write = this.keyWrites.get(id);
    return (
      write !== undefined &&
      !write.started &&
      write.clearBarrier === this.clearWrite
    );
  }

  private assertCapacity(operation: CacheBackpressureOperation): void {
    const pending = this.pendingOperations;
    if (pending < this.policy.maxPendingOperations) return;
    throw new CacheBackpressureError(
      this.namespace,
      operation,
      this.policy.maxPendingOperations,
      pending,
    );
  }

  private bumpVersion(id: string): void {
    this.keyVersions.set(id, Symbol());
  }

  private finishRead(id: string, read: Promise<T | undefined>): void {
    if (this.reads.get(id) === read) this.reads.delete(id);
    this.removeVersionWhenIdle(id);
  }

  private removeVersionWhenIdle(id: string): void {
    if (!this.reads.has(id) && !this.keyWrites.has(id)) {
      this.keyVersions.delete(id);
    }
  }

  private async report(
    error: unknown,
    context: Pick<CacheErrorContext, "operation" | "key">,
  ): Promise<void> {
    if (this.onError === undefined) return;
    try {
      await this.onError(error, { ...context, namespace: this.namespace });
    } catch {
      return;
    }
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
