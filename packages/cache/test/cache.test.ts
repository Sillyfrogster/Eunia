import { describe, expect, test } from "bun:test";
import {
  Cache,
  CacheBackpressureError,
  CacheStore,
  DEFAULT_CACHE_READ_THROUGH_TTL,
  MemoryStore,
  RedisCacheAdapter,
  ValkeyCacheAdapter,
  type CacheAdapter,
  type CacheErrorContext,
  type RedisClientLike,
} from "../src";

class FakeAdapter implements CacheAdapter {
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

class Deferred<T = void> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolve = resolve;
    });
  }
}

describe("MemoryStore", () => {
  test("stores, lists, deletes, and clears values", () => {
    const store = new MemoryStore<number>({ maxSize: 3 });
    store.set("one", 1);
    store.set("two", 2);

    expect(store.resolve("one")).toBe(1);
    expect(store.has("two")).toBe(true);
    expect([...store.values()]).toEqual([1, 2]);
    expect([...store.keys()]).toEqual(["one", "two"]);
    expect([...store.entries()]).toEqual([
      ["one", 1],
      ["two", 2],
    ]);
    expect(store.delete("one")).toBe(true);
    expect(store.size).toBe(1);

    store.clear();
    expect(store.size).toBe(0);
  });

  test("evicts the least recently used value", () => {
    const store = new MemoryStore<string>({ maxSize: 2 });
    store.set("first", "first");
    store.set("second", "second");
    store.get("first");
    store.set("third", "third");

    expect(store.get("first")).toBe("first");
    expect(store.get("second")).toBeUndefined();
    expect(store.get("third")).toBe("third");
  });

  test("expires values without timers", () => {
    let now = 1_000;
    const store = new MemoryStore<string>({
      maxSize: 3,
      ttl: 100,
      now: () => now,
    });
    store.set("short", "gone", 20);
    store.set("default", "kept");

    now = 1_020;
    expect(store.get("short")).toBeUndefined();
    expect(store.get("default")).toBe("kept");

    now = 1_100;
    expect(store.size).toBe(0);
    expect([...store.values()]).toEqual([]);
  });

  test("rejects unbounded or invalid policies", () => {
    expect(() => new MemoryStore({ maxSize: 0 })).toThrow(RangeError);
    expect(() => new MemoryStore({ maxSize: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
    expect(() => new MemoryStore({ ttl: 0 })).toThrow(RangeError);
    expect(() => new MemoryStore({ ttl: 1.5 })).toThrow(RangeError);
  });
});

describe("CacheStore", () => {
  test("updates the hot store before persistence", async () => {
    const adapter = new FakeAdapter();
    const store = new CacheStore<string>({
      namespace: "users",
      adapter,
      policy: { maxSize: 2 },
    });

    store.set("1", "Ada");
    expect(store.resolve("1")).toBe("Ada");
    expect(await store.get("1")).toBe("Ada");

    await store.flush();
    expect(adapter.data.get("users")?.get("1")).toBe("Ada");
  });

  test("reads through once for concurrent misses", async () => {
    const adapter = new FakeAdapter();
    const gate = new Deferred();
    adapter.seed("users", "1", { id: "1" });
    const originalGet = adapter.get.bind(adapter);
    adapter.get = async (namespace, key) => {
      await gate.promise;
      return originalGet(namespace, key);
    };
    const store = new CacheStore<{ id: string }>({
      namespace: "users",
      adapter,
      policy: { maxSize: 2 },
    });

    const first = store.get("1");
    const second = store.get("1");
    gate.resolve();

    expect(await first).toEqual({ id: "1" });
    expect(await second).toEqual({ id: "1" });
    expect(adapter.getCount).toBe(1);
    expect(store.resolve("1")).toEqual({ id: "1" });
  });

  test("bounds concurrent adapter reads and still coalesces the same key", async () => {
    const adapter = new FakeAdapter();
    const gate = new Deferred();
    adapter.seed("users", "1", "one");
    adapter.seed("users", "2", "two");
    adapter.seed("users", "3", "three");
    const originalGet = adapter.get.bind(adapter);
    adapter.get = async (namespace, key) => {
      await gate.promise;
      return originalGet(namespace, key);
    };
    const store = new CacheStore<string>({
      namespace: "users",
      adapter,
      policy: { maxSize: 3, maxPendingOperations: 2 },
    });

    const first = store.get("1");
    const duplicate = store.get("1");
    const second = store.get("2");

    expect(store.pendingOperations).toBe(2);
    const rejected = store.get("3");
    await expect(rejected).rejects.toBeInstanceOf(CacheBackpressureError);
    await expect(rejected).rejects.toMatchObject({
      namespace: "users",
      operation: "get",
      limit: 2,
      pendingOperations: 2,
    });

    gate.resolve();
    expect(await first).toBe("one");
    expect(await duplicate).toBe("one");
    expect(await second).toBe("two");
    expect(adapter.getCount).toBe(2);

    expect(await store.get("3")).toBe("three");
    expect(store.pendingOperations).toBe(0);
  });

  test("bounds writes while keeping the active and latest same-key change", async () => {
    const adapter = new FakeAdapter();
    const gate = new Deferred();
    const events: string[] = [];
    adapter.set = async (namespace, key, value) => {
      events.push(`start:${String(value)}`);
      if (value === "first") await gate.promise;
      adapter.seed(namespace, key, value);
      events.push(`finish:${String(value)}`);
    };
    adapter.delete = async (namespace, key) => {
      events.push("delete");
      adapter.data.get(namespace)?.delete(key);
    };
    const store = new CacheStore<string>({
      namespace: "messages",
      adapter,
      policy: { maxSize: 3, maxPendingOperations: 2 },
    });

    store.set("1", "first");
    store.set("1", "superseded");
    store.delete("1");

    expect(store.pendingOperations).toBe(2);
    expect(store.resolve("1")).toBeUndefined();
    expect(() => store.set("2", "rejected")).toThrow(
      CacheBackpressureError,
    );
    expect(store.resolve("2")).toBeUndefined();

    gate.resolve();
    await store.flush();

    expect(events).toEqual(["start:first", "finish:first", "delete"]);
    expect(adapter.data.get("messages")?.has("1")).toBe(false);
    expect(store.pendingOperations).toBe(0);

    store.set("2", "accepted");
    await store.flush();
    expect(adapter.data.get("messages")?.get("2")).toBe("accepted");
  });

  test("rejects saturated mutations before changing hot state", async () => {
    const adapter = new FakeAdapter();
    const gate = new Deferred();
    adapter.set = async (namespace, key, value) => {
      await gate.promise;
      adapter.seed(namespace, key, value);
    };
    const store = new CacheStore<string>({
      namespace: "users",
      adapter,
      policy: { maxSize: 2, maxPendingOperations: 1 },
    });

    store.set("1", "kept");

    expect(() => store.delete("1")).toThrow(CacheBackpressureError);
    expect(store.resolve("1")).toBe("kept");
    expect(() => store.clear()).toThrow(CacheBackpressureError);
    expect([...store.entries()]).toEqual([["1", "kept"]]);

    gate.resolve();
    await store.flush();
  });

  test("expires read-through values without extending them on hot reads", async () => {
    let now = 1_000;
    const adapter = new FakeAdapter();
    adapter.seed("users", "1", "old");
    const store = new CacheStore<string>({
      namespace: "users",
      adapter,
      policy: { maxSize: 2, readThroughTtl: 100 },
      now: () => now,
    });

    expect(await store.get("1")).toBe("old");
    adapter.seed("users", "1", "new");

    now = 1_050;
    expect(await store.get("1")).toBe("old");
    expect(store.resolve("1")).toBe("old");
    expect(adapter.getCount).toBe(1);

    now = 1_100;
    expect(await store.get("1")).toBe("new");
    expect(adapter.getCount).toBe(2);
    expect(adapter.calls.filter((call) => call.startsWith("set:"))).toEqual(
      [],
    );

    adapter.seed("users", "1", "newest");
    now = 1_150;
    expect(store.resolve("1")).toBe("new");
    now = 1_200;
    expect(await store.get("1")).toBe("newest");
    expect(adapter.getCount).toBe(3);
  });

  test("uses safe adapter defaults and rejects invalid limits", () => {
    const defaults = new CacheStore({ namespace: "users" });
    const inherited = new CacheStore({
      namespace: "messages",
      policy: { ttl: 2_500 },
    });

    expect(defaults.policy.readThroughTtl).toBe(
      DEFAULT_CACHE_READ_THROUGH_TTL,
    );
    expect(defaults.policy.maxPendingOperations).toBeGreaterThan(0);
    expect(inherited.policy.readThroughTtl).toBe(2_500);
    expect(
      () =>
        new CacheStore({
          namespace: "users",
          policy: { readThroughTtl: 0 },
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new CacheStore({
          namespace: "users",
          policy: { maxPendingOperations: 0 },
        }),
    ).toThrow(RangeError);
  });

  test("preserves write order for each key", async () => {
    const gate = new Deferred();
    const events: string[] = [];
    const adapter = new FakeAdapter();
    adapter.set = async (namespace, key, value) => {
      events.push(`start:${String(value)}`);
      if (value === "first") await gate.promise;
      adapter.seed(namespace, key, value);
      events.push(`finish:${String(value)}`);
    };
    const store = new CacheStore<string>({
      namespace: "messages",
      adapter,
      policy: { maxSize: 2 },
    });

    store.set("1", "first");
    store.set("1", "second");
    expect(store.resolve("1")).toBe("second");

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["start:first"]);
    gate.resolve();
    await store.flush();

    expect(events).toEqual([
      "start:first",
      "finish:first",
      "start:second",
      "finish:second",
    ]);
    expect(adapter.data.get("messages")?.get("1")).toBe("second");
  });

  test("persists different keys without waiting on each other", async () => {
    const gate = new Deferred();
    const started: string[] = [];
    const adapter = new FakeAdapter();
    adapter.set = async (_namespace, key) => {
      started.push(key);
      if (key === "slow") await gate.promise;
    };
    const store = new CacheStore<string>({
      namespace: "messages",
      adapter,
      policy: { maxSize: 2 },
    });

    store.set("slow", "first");
    store.set("fast", "second");
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toEqual(["slow", "fast"]);
    gate.resolve();
    await store.flush();
  });

  test("orders clear between earlier and later writes", async () => {
    const adapter = new FakeAdapter();
    const store = new CacheStore<string>({
      namespace: "roles",
      adapter,
      policy: { maxSize: 2 },
    });

    store.set("1", "old");
    store.clear();
    store.set("1", "new");
    await store.flush();

    expect(adapter.calls).toEqual([
      "set:roles:1:undefined",
      "clear:roles",
      "set:roles:1:undefined",
    ]);
    expect(adapter.data.get("roles")?.get("1")).toBe("new");
  });

  test("reports failed background writes and keeps the hot value", async () => {
    const failure = new Error("storage unavailable");
    const errors: Array<{ error: unknown; context: CacheErrorContext }> = [];
    const adapter = new FakeAdapter();
    adapter.set = async () => {
      throw failure;
    };
    const store = new CacheStore<string>({
      namespace: "channels",
      adapter,
      policy: { maxSize: 2 },
      onError: (error, context) => errors.push({ error, context }),
    });

    store.set("1", "general");
    await store.flush();

    expect(store.resolve("1")).toBe("general");
    expect(errors).toEqual([
      {
        error: failure,
        context: { operation: "set", namespace: "channels", key: "1" },
      },
    ]);
  });

  test("contains errors thrown by the error handler", async () => {
    const adapter = new FakeAdapter();
    adapter.set = async () => {
      throw new Error("storage unavailable");
    };
    const store = new CacheStore<string>({
      namespace: "channels",
      adapter,
      policy: { maxSize: 2 },
      onError: async () => {
        throw new Error("reporter unavailable");
      },
    });

    store.set("1", "general");
    await expect(store.flush()).resolves.toBeUndefined();
  });

  test("does not restore an external value over a local delete", async () => {
    const adapter = new FakeAdapter();
    const gate = new Deferred();
    adapter.seed("users", "1", "old");
    const originalGet = adapter.get.bind(adapter);
    adapter.get = async (namespace, key) => {
      const value = await originalGet(namespace, key);
      await gate.promise;
      return value;
    };
    const store = new CacheStore<string>({
      namespace: "users",
      adapter,
      policy: { maxSize: 2 },
    });

    const read = store.get("1");
    await Promise.resolve();
    await Promise.resolve();
    store.delete("1");
    gate.resolve();

    expect(await read).toBeUndefined();
    expect(store.resolve("1")).toBeUndefined();
  });
});

describe("Cache", () => {
  test("bounds every default domain and gives messages a TTL", () => {
    const cache = new Cache();

    for (const store of [
      cache.users,
      cache.guilds,
      cache.channels,
      cache.messages,
      cache.members,
      cache.roles,
    ]) {
      expect(store.policy.maxSize).toBeGreaterThan(0);
      expect(Number.isFinite(store.policy.maxSize)).toBe(true);
    }
    expect(cache.messages.policy.maxSize).toBeLessThan(
      cache.channels.policy.maxSize,
    );
    expect(cache.messages.policy.ttl).toBeGreaterThan(0);
  });

  test("keeps custom and built-in domains separate", async () => {
    const adapter = new FakeAdapter();
    const cache = new Cache({ adapter });
    const sessions = cache.domain<{ userId: string }>("plugin:sessions", {
      maxSize: 4,
      ttl: 1_000,
    });

    cache.users.set("same", { id: "user" });
    sessions.set("same", { userId: "user" });
    await cache.flush();

    expect(adapter.data.get("users")?.get("same")).toEqual({ id: "user" });
    expect(adapter.data.get("plugin:sessions")?.get("same")).toEqual({
      userId: "user",
    });
    expect(cache.domain("plugin:sessions")).toBe(sessions);
    expect(sessions.policy.ttl).toBe(1_000);
  });

  test("flushes and closes a shared adapter once", async () => {
    const adapter = new FakeAdapter();
    const cache = new Cache({ adapter });
    cache.guilds.set("1", { id: "1" });

    await Promise.all([cache.close(), cache.close()]);

    expect(adapter.data.get("guilds")?.get("1")).toEqual({ id: "1" });
    expect(adapter.closed).toBe(1);
  });
});

class FakeRedisClient implements RedisClientLike {
  readonly data = new Map<string, string>();
  readonly setCalls: Array<
    [string, string, "PX" | undefined, number | undefined]
  > = [];
  readonly scanPatterns: string[] = [];
  readonly delCalls: string[][] = [];
  closed = false;

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    px?: "PX",
    milliseconds?: number,
  ): Promise<unknown> {
    this.setCalls.push([key, value, px, milliseconds]);
    this.data.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    this.delCalls.push(keys);
    let deleted = 0;
    for (const key of keys) {
      if (this.data.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async scan(
    _cursor: string | number,
    _match: "MATCH",
    pattern: string,
    _count: "COUNT",
    _hint: number,
  ): Promise<[string, string[]]> {
    this.scanPatterns.push(pattern);
    const prefix = pattern.slice(0, -1);
    return ["0", [...this.data.keys()].filter((key) => key.startsWith(prefix))];
  }

  close(): void {
    this.closed = true;
  }
}

class PagedRedisClient extends FakeRedisClient {
  readonly events: string[] = [];
  private scannedKeys: string[] = [];

  override async scan(
    cursor: string | number,
    _match: "MATCH",
    pattern: string,
    _count: "COUNT",
    _hint: number,
  ): Promise<[string, string[]]> {
    this.events.push(`scan:${String(cursor)}`);
    this.scanPatterns.push(pattern);

    if (String(cursor) === "0") {
      const prefix = pattern.slice(0, -1);
      this.scannedKeys = [...this.data.keys()].filter((key) =>
        key.startsWith(prefix),
      );
      return ["1", this.scannedKeys.slice(0, 510)];
    }
    if (String(cursor) === "1") return ["2", []];

    const duplicate = this.scannedKeys[0];
    return [
      "0",
      [
        ...(duplicate === undefined ? [] : [duplicate]),
        ...this.scannedKeys.slice(510),
      ],
    ];
  }

  override async del(...keys: string[]): Promise<number> {
    this.events.push(`del:${keys.length}`);
    return super.del(...keys);
  }
}

describe("RedisCacheAdapter", () => {
  test("serializes values and writes millisecond TTLs", async () => {
    const client = new FakeRedisClient();
    const adapter = new RedisCacheAdapter({ client, prefix: "my-app:" });

    await adapter.set("users", "1", { id: "1", bot: false }, 2_500);

    const call = client.setCalls[0];
    expect(call?.[0].startsWith("my-app:")).toBe(true);
    expect(call?.slice(1)).toEqual([
      JSON.stringify({ id: "1", bot: false }),
      "PX",
      2_500,
    ]);
    expect(await adapter.get("users", "1")).toEqual({ id: "1", bot: false });
  });

  test("encodes namespaces and keys without collisions", async () => {
    const client = new FakeRedisClient();
    const adapter = new RedisCacheAdapter({ client });

    await adapter.set("a:b", "c", "first");
    await adapter.set("a", "b:c", "second");

    expect(client.data.size).toBe(2);
    expect(await adapter.get("a:b", "c")).toBe("first");
    expect(await adapter.get("a", "b:c")).toBe("second");
  });

  test("clears one namespace with SCAN", async () => {
    const client = new FakeRedisClient();
    const adapter = new RedisCacheAdapter({ client });
    await adapter.set("users", "1", { id: "1" });
    await adapter.set("guilds", "1", { id: "1" });

    await adapter.clear("users");

    expect(client.scanPatterns).toHaveLength(1);
    expect(await adapter.get("users", "1")).toBeUndefined();
    expect(await adapter.get("guilds", "1")).toEqual({ id: "1" });
  });

  test("deletes each scan page before requesting the next one", async () => {
    const client = new PagedRedisClient();
    const adapter = new RedisCacheAdapter({ client });
    for (let index = 0; index < 600; index += 1) {
      await adapter.set("users", String(index), { id: String(index) });
    }
    await adapter.set("guilds", "1", { id: "1" });

    await adapter.clear("users");

    expect(client.events.slice(0, 5)).toEqual([
      "scan:0",
      "del:250",
      "del:250",
      "del:10",
      "scan:1",
    ]);
    expect(client.events).toContain("scan:2");
    expect(client.delCalls.every((keys) => keys.length <= 250)).toBe(true);
    expect(client.scanPatterns).toHaveLength(3);
    expect(await adapter.get("users", "599")).toBeUndefined();
    expect(await adapter.get("guilds", "1")).toEqual({ id: "1" });
  });

  test("rejects values that JSON cannot store", async () => {
    const adapter = new RedisCacheAdapter({ client: new FakeRedisClient() });
    await expect(adapter.set("users", "1", undefined)).rejects.toThrow(
      "Cache values must be JSON serializable.",
    );
  });

  test("uses the same protocol for Valkey", async () => {
    const client = new FakeRedisClient();
    const adapter = new ValkeyCacheAdapter({ client });
    await adapter.set("roles", "1", { id: "1" });
    await adapter.close();

    expect(await adapter.get("roles", "1")).toEqual({ id: "1" });
    expect(client.closed).toBe(true);
  });
});
