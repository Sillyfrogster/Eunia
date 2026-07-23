import { describe, expect, test } from "bun:test";
import {
  CacheBackpressureError,
  CacheStore,
  type CacheErrorContext,
} from "../src";
import { Deferred, FakeAdapter } from "./fixtures";

describe("CacheStore.setMany", () => {
  test("accepts a large burst as one pending operation", async () => {
    const adapter = new FakeAdapter();
    const gate = new Deferred();
    let active = 0;
    let peak = 0;

    adapter.set = async (namespace, key, value) => {
      active += 1;
      peak = Math.max(peak, active);
      if (Number(key) < 100) await gate.promise;
      adapter.seed(namespace, key, value);
      active -= 1;
    };

    const store = new CacheStore<number>({
      namespace: "members",
      adapter,
      policy: { maxSize: 1_000 },
    });
    const entries = Array.from(
      { length: 1_205 },
      (_, index) => [String(index), index] as const,
    );

    store.setMany(entries);

    expect(store.pendingOperations).toBe(1);
    expect(store.size).toBe(1_000);
    expect(store.resolve("1204")).toBe(1_204);
    expect(peak).toBe(0);

    await waitUntil(() => peak > 0);
    expect(peak).toBe(100);

    gate.resolve();
    await store.flush();

    expect(adapter.data.get("members")?.size).toBe(1_205);
    expect(adapter.data.get("members")?.get("1204")).toBe(1_204);
    expect(store.pendingOperations).toBe(0);
  });

  test("checks backpressure once before changing memory", async () => {
    const adapter = new FakeAdapter();
    const gate = new Deferred();
    adapter.set = async (namespace, key, value) => {
      await gate.promise;
      adapter.seed(namespace, key, value);
    };
    const store = new CacheStore<string>({
      namespace: "members",
      adapter,
      policy: { maxSize: 4, maxPendingOperations: 1 },
    });

    store.set("active", "kept");

    expect(() =>
      store.setMany([
        ["one", "first"],
        ["two", "second"],
      ]),
    ).toThrow(CacheBackpressureError);
    expect(store.resolve("one")).toBeUndefined();
    expect(store.resolve("two")).toBeUndefined();

    gate.resolve();
    await store.flush();
  });

  test("keeps batch writes between adjacent writes for the same key", async () => {
    const adapter = new FakeAdapter();
    const firstGate = new Deferred();
    const batchGate = new Deferred();
    const events: string[] = [];

    adapter.set = async (namespace, key, value) => {
      events.push(`start:${key}:${String(value)}`);
      if (value === "before") await firstGate.promise;
      if (value === "batch") await batchGate.promise;
      adapter.seed(namespace, key, value);
      events.push(`finish:${key}:${String(value)}`);
    };

    const store = new CacheStore<string>({
      namespace: "members",
      adapter,
      policy: { maxSize: 4 },
    });

    store.set("same", "before");
    store.setMany([
      ["same", "batch"],
      ["other", "other"],
    ]);

    firstGate.resolve();
    await waitUntil(() => events.includes("start:same:batch"));
    store.set("same", "after");
    batchGate.resolve();
    await store.flush();

    expect(events).toEqual([
      "start:same:before",
      "finish:same:before",
      "start:same:batch",
      "start:other:other",
      "finish:other:other",
      "finish:same:batch",
      "start:same:after",
      "finish:same:after",
    ]);
    expect(adapter.data.get("members")?.get("same")).toBe("after");
  });

  test("coalesces changes made before a batch starts", async () => {
    const adapter = new FakeAdapter();
    const store = new CacheStore<string>({
      namespace: "members",
      adapter,
      policy: { maxSize: 4 },
    });

    store.setMany([
      ["same", "batch"],
      ["other", "kept"],
    ]);
    store.set("same", "latest");
    store.delete("other");

    expect(store.pendingOperations).toBe(1);
    await store.flush();

    expect(adapter.calls).toEqual([
      "set:members:same:undefined",
      "delete:members:other",
    ]);
    expect(adapter.data.get("members")?.get("same")).toBe("latest");
    expect(adapter.data.get("members")?.has("other")).toBe(false);
  });

  test("reports each failure and continues through later chunks", async () => {
    const firstFailure = new Error("first unavailable");
    const laterFailure = new Error("later unavailable");
    const errors: Array<{ error: unknown; context: CacheErrorContext }> = [];
    const adapter = new FakeAdapter();

    adapter.set = async (namespace, key, value) => {
      if (key === "3") throw firstFailure;
      if (key === "103") throw laterFailure;
      adapter.seed(namespace, key, value);
    };

    const store = new CacheStore<number>({
      namespace: "members",
      adapter,
      policy: { maxSize: 250 },
      onError: (error, context) => errors.push({ error, context }),
    });

    store.setMany(
      Array.from(
        { length: 205 },
        (_, index) => [String(index), index] as const,
      ),
    );
    await expect(store.flush()).resolves.toBeUndefined();

    expect(errors).toEqual([
      {
        error: firstFailure,
        context: { operation: "set", namespace: "members", key: "3" },
      },
      {
        error: laterFailure,
        context: { operation: "set", namespace: "members", key: "103" },
      },
    ]);
    expect(adapter.data.get("members")?.has("3")).toBe(false);
    expect(adapter.data.get("members")?.has("103")).toBe(false);
    expect(adapter.data.get("members")?.get("204")).toBe(204);
    expect(store.pendingOperations).toBe(0);
  });

  test("flush waits for every chunk in an accepted batch", async () => {
    const adapter = new FakeAdapter();
    const lastGate = new Deferred();
    const lastStarted = new Deferred();
    let flushed = false;

    adapter.set = async (namespace, key, value) => {
      if (key === "100") {
        lastStarted.resolve();
        await lastGate.promise;
      }
      adapter.seed(namespace, key, value);
    };

    const store = new CacheStore<number>({
      namespace: "members",
      adapter,
      policy: { maxSize: 101 },
    });
    store.setMany(
      Array.from(
        { length: 101 },
        (_, index) => [String(index), index] as const,
      ),
    );

    const flush = store.flush().then(() => {
      flushed = true;
    });
    await lastStarted.promise;
    expect(flushed).toBe(false);
    expect(store.pendingOperations).toBe(1);

    lastGate.resolve();
    await flush;

    expect(flushed).toBe(true);
    expect(adapter.data.get("members")?.size).toBe(101);
    expect(store.pendingOperations).toBe(0);
  });
});

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error("Condition was not reached.");
}
