import type { CacheAdapter } from "../src";

export class FakeAdapter implements CacheAdapter {
  readonly data = new Map<string, Map<string, unknown>>();
  readonly calls: string[] = [];
  getCount = 0;
  closed = 0;

  async get(namespace: string, key: string): Promise<unknown | undefined> {
    this.calls.push(`get:${namespace}:${key}`);
    this.getCount += 1;
    return this.data.get(namespace)?.get(key);
  }

  async set(
    namespace: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<void> {
    this.calls.push(`set:${namespace}:${key}:${String(ttl)}`);
    this.namespace(namespace).set(key, value);
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.calls.push(`delete:${namespace}:${key}`);
    this.data.get(namespace)?.delete(key);
  }

  async keys(namespace: string, prefix = ""): Promise<string[]> {
    return [...(this.data.get(namespace)?.keys() ?? [])].filter((key) =>
      key.startsWith(prefix),
    );
  }

  async clear(namespace: string): Promise<void> {
    this.calls.push(`clear:${namespace}`);
    this.data.delete(namespace);
  }

  async close(): Promise<void> {
    this.closed += 1;
  }

  seed(namespace: string, key: string, value: unknown): void {
    this.namespace(namespace).set(key, value);
  }

  private namespace(name: string): Map<string, unknown> {
    let values = this.data.get(name);
    if (values === undefined) {
      values = new Map();
      this.data.set(name, values);
    }
    return values;
  }
}

export class Deferred<T = void> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolve = resolve;
    });
  }
}
