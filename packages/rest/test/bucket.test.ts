import { describe, expect, test } from "bun:test";
import { Bucket, sleep } from "../src/bucket";
import { GlobalLimiter } from "../src/global-limiter";

/** A limiter high enough to never interfere with bucket-focused tests. */
const openLimiter = () => new GlobalLimiter(1_000);

describe("Bucket", () => {
  test("runs queued requests strictly in FIFO order, one at a time", async () => {
    const bucket = new Bucket("test", openLimiter());
    const order: number[] = [];

    const results = await Promise.all([
      bucket.enqueue(async () => {
        await sleep(20); // slow first task must NOT be overtaken
        order.push(1);
        return "a";
      }),
      bucket.enqueue(async () => {
        order.push(2);
        return "b";
      }),
      bucket.enqueue(async () => {
        order.push(3);
        return "c";
      }),
    ]);

    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual(["a", "b", "c"]);
  });

  test("a failing request rejects its own promise but never wedges the queue", async () => {
    const bucket = new Bucket("test", openLimiter());

    const first = bucket.enqueue(async () => "ok");
    const dead = bucket.enqueue(async () => {
      throw new Error("boom");
    });
    const after = bucket.enqueue(async () => "still alive");

    expect(await first).toBe("ok");
    await expect(dead).rejects.toThrow("boom");
    expect(await after).toBe("still alive");
  });

  test("waits out the window when observe() says remaining is 0", async () => {
    const bucket = new Bucket("test", openLimiter());
    bucket.observe(5, 0, 60); // exhausted; resets in 60ms

    const startedAt = Date.now();
    await bucket.enqueue(async () => "done");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(55);
  });

  test("does not wait while the window still has capacity", async () => {
    const bucket = new Bucket("test", openLimiter());
    bucket.observe(5, 3, 60_000); // plenty left — a long reset must not matter

    const startedAt = Date.now();
    await bucket.enqueue(async () => "done");
    expect(Date.now() - startedAt).toBeLessThan(30);
  });

  test("respects a global block even when its own window is open", async () => {
    const limiter = openLimiter();
    limiter.blockFor(60);
    const bucket = new Bucket("test", limiter);

    const startedAt = Date.now();
    await bucket.enqueue(async () => "done");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(55);
  });

  test("moves queued work when a shared bucket is discovered", async () => {
    const provisional = new Bucket("route", openLimiter());
    const canonical = new Bucket("hash", openLimiter());
    const order: string[] = [];

    const running = provisional.enqueue(async () => {
      await sleep(10);
      order.push("running");
    });
    const queued = provisional.enqueue(async () => {
      order.push("queued");
    });
    provisional.redirectTo(canonical);
    const future = provisional.enqueue(async () => {
      order.push("future");
    });

    await Promise.all([running, queued, future]);
    expect(order).toEqual(["running", "queued", "future"]);
  });
});

describe("GlobalLimiter", () => {
  test("allows up to N sends per window, then reports a delay", () => {
    const limiter = new GlobalLimiter(2);

    expect(limiter.delayMs()).toBe(0);
    limiter.recordSend();
    expect(limiter.delayMs()).toBe(0);
    limiter.recordSend();

    const delay = limiter.delayMs();
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(1_000);
  });

  test("opens again once the window rolls over", async () => {
    const limiter = new GlobalLimiter(1);
    limiter.recordSend();
    expect(limiter.delayMs()).toBeGreaterThan(0);

    // recordSend stamps the window start; a fresh window clears the count.
    await sleep(1_050);
    expect(limiter.delayMs()).toBe(0);
  });

  test("blockFor never shortens an existing block", () => {
    const limiter = new GlobalLimiter(50);
    limiter.blockFor(500);
    limiter.blockFor(10); // a later, SHORTER block must not win
    expect(limiter.delayMs()).toBeGreaterThan(400);
  });
});
