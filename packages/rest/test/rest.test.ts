import { describe, expect, test } from "bun:test";
import { EuniaRest } from "../src/rest";
import { DiscordError, RateLimitExhaustedError } from "../src/errors";
import { routePath } from "../src/routes";

const CHANNEL = "123456789012345678";

const gatewayBot = () => routePath("/gateway/bot");
const channelRoute = (channelId: string) =>
  routePath("/channels/{channelId}", { channelId });
const channelMessages = (channelId: string) =>
  routePath("/channels/{channelId}/messages", { channelId });
const channelMessage = (channelId: string, messageId: string) =>
  routePath("/channels/{channelId}/messages/{messageId}", { channelId, messageId });
const guildRoute = (guildId: string) => routePath("/guilds/{guildId}", { guildId });
const interactionCallback = (interactionId: string, interactionToken: string) =>
  routePath("/interactions/{interactionId}/{interactionToken}/callback", {
    interactionId,
    interactionToken,
  });

/** Build a JSON response the way Discord would. */
function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** The standard rate-limit header block. */
function rlHeaders(
  bucket: string,
  limit: number,
  remaining: number,
  resetAfterS: number,
): Record<string, string> {
  return {
    "x-ratelimit-bucket": bucket,
    "x-ratelimit-limit": String(limit),
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-reset-after": String(resetAfterS),
  };
}

/**
 * A fake Discord: hands out the scripted responses one per call, records
 * every request (url, init, timestamp) for assertions.
 */
function fakeDiscord(script: Array<() => Response | never>) {
  const calls: Array<{ url: string; init: RequestInit; at: number }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, at: Date.now() });
    const next = script.shift();
    if (!next) throw new Error("fakeDiscord: script exhausted");
    return next();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function makeRest(
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof EuniaRest>[0]> = {},
) {
  return new EuniaRest({ token: "unit.test.token", fetch: fetchImpl, ...extra });
}

describe("construction", () => {
  test("rejects a missing/empty token", () => {
    expect(() => new EuniaRest({ token: "" })).toThrow(/token/);
    expect(() => new EuniaRest({ token: "   " })).toThrow(/token/);
  });

  test("rejects a token with interior whitespace (header injection guard)", () => {
    expect(() => new EuniaRest({ token: "abc\ndef" })).toThrow(/whitespace/);
  });

  test("trims the trailing newline a copy-pasted .env token often has", async () => {
    const { calls, fetchImpl } = fakeDiscord([() => json(200, {})]);
    const rest = new EuniaRest({ token: "abc123\n", fetch: fetchImpl });
    await rest.get(gatewayBot());
    expect(
      (calls[0]?.init.headers as Record<string, string>)["authorization"],
    ).toBe("Bot abc123");
  });

  test("rejects fractional bucket limits and invalid warning thresholds", () => {
    expect(() => new EuniaRest({ token: "token", maxBuckets: 1.5 })).toThrow(
      /maxBuckets/,
    );
    expect(() =>
      new EuniaRest({ token: "token", invalidRequestWarning: 0 }),
    ).toThrow(/invalidRequestWarning/);
  });
});

describe("request shape", () => {
  test("builds the versioned URL and sends auth + UA + JSON body", async () => {
    const { calls, fetchImpl } = fakeDiscord([() => json(200, { id: "1" })]);
    const rest = makeRest(fetchImpl);

    const result = await rest.post(channelMessages(CHANNEL), {
      content: "hello",
    });

    expect(result).toEqual({ id: "1" });
    const call = calls[0]!;
    expect(call.url).toBe(
      `https://discord.com/api/v10/channels/${CHANNEL}/messages`,
    );
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBe(JSON.stringify({ content: "hello" }));
    const headers = call.init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bot unit.test.token");
    expect(headers["user-agent"]).toMatch(/^DiscordBot \(/);
    expect(headers["content-type"]).toBe("application/json");
  });

  test("baseUrl and version are configurable", async () => {
    const { calls, fetchImpl } = fakeDiscord([() => json(200, {})]);
    const rest = makeRest(fetchImpl, {
      baseUrl: "https://proxy.test/api",
      version: 9,
    });
    await rest.get(gatewayBot());
    expect(calls[0]!.url).toBe("https://proxy.test/api/v9/gateway/bot");
  });

  test("paths must start with a slash", () => {
    const { fetchImpl } = fakeDiscord([]);
    const rest = makeRest(fetchImpl);
    expect(() => rest.get("gateway/bot")).toThrow(/start with/);
  });

  test("204 No Content resolves to undefined", async () => {
    const { fetchImpl } = fakeDiscord([() => json(204, null)]);
    const rest = makeRest(fetchImpl);
    const result = await rest.delete(channelMessage(CHANNEL, "111111111111111111"));
    expect(result).toBeUndefined();
  });

  test("can send authless interaction requests", async () => {
    const { calls, fetchImpl } = fakeDiscord([() => json(204, null)]);
    const rest = makeRest(fetchImpl);
    await rest.post(
      interactionCallback("111111111111111111", "interaction token"),
      { type: 5 },
      { auth: false, global: false },
    );
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["authorization"]).toBeUndefined();
    expect(calls[0]!.url).toContain("interaction%20token");
  });

  test("does not serialize callbacks for separate interactions", async () => {
    const release = Promise.withResolvers<void>();
    const bothStarted = Promise.withResolvers<void>();
    let started = 0;
    const fetchImpl = (async () => {
      started += 1;
      if (started === 2) bothStarted.resolve();
      await release.promise;
      return json(204, undefined);
    }) as unknown as typeof fetch;
    const rest = makeRest(fetchImpl);

    const first = rest.post(
      interactionCallback("444444444444444444", "token-a"),
      { type: 5 },
      { auth: false, global: false },
    );
    const second = rest.post(
      interactionCallback("555555555555555555", "token-b"),
      { type: 5 },
      { auth: false, global: false },
    );

    const startedTogether = await Promise.race([
      bothStarted.promise.then(() => true),
      Bun.sleep(100).then(() => false),
    ]);
    expect(startedTogether).toBe(true);
    release.resolve();
    await Promise.all([first, second]);
  });

  test("builds multipart bodies for file uploads", async () => {
    const { calls, fetchImpl } = fakeDiscord([() => json(200, { id: "1" })]);
    const rest = makeRest(fetchImpl);
    await rest.post(
      channelMessages(CHANNEL),
      { content: "log" },
      { files: [{ data: new Blob(["hello"]), name: "log.txt" }] },
    );
    const body = calls[0]!.init.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("payload_json")).toContain("log.txt");
  });

  test("puts interaction upload descriptors inside callback data", async () => {
    const { calls, fetchImpl } = fakeDiscord([() => json(204, null)]);
    const rest = makeRest(fetchImpl);
    await rest.post(
      interactionCallback("111111111111111111", "token"),
      { type: 4, data: { content: "report" } },
      {
        auth: false,
        files: [{ data: new Blob(["hello"]), name: "report.txt" }],
      },
    );

    const form = calls[0]?.init.body as FormData;
    const payload = JSON.parse(String(form.get("payload_json"))) as {
      type: number;
      data: { attachments: Array<{ filename: string }> };
      attachments?: unknown;
    };
    expect(payload.data.attachments[0]?.filename).toBe("report.txt");
    expect(payload.attachments).toBeUndefined();
  });
});

describe("error handling", () => {
  test("a 4xx throws DiscordError immediately — no retry", async () => {
    const { calls, fetchImpl } = fakeDiscord([
      () => json(403, { message: "Missing Access", code: 50001 }),
      () => json(200, {}), // must never be reached
    ]);
    const rest = makeRest(fetchImpl);

    const promise = rest.get(guildRoute("987654321098765432"));
    await expect(promise).rejects.toBeInstanceOf(DiscordError);
    await promise.catch((error: DiscordError) => {
      expect(error.status).toBe(403);
      expect(error.code).toBe(50001);
      expect(error.message).toContain("Missing Access");
      // Route key in the message, never the token or body.
      expect(error.message).not.toContain("unit.test.token");
    });
    expect(calls.length).toBe(1);
  });

  test("a non-JSON error body (e.g. Cloudflare HTML) is kept as raw text", async () => {
    const { fetchImpl } = fakeDiscord([
      () =>
        new Response("<html>blocked</html>", {
          status: 403,
          headers: { "content-type": "text/html" },
        }),
    ]);
    const rest = makeRest(fetchImpl);
    await rest.get(gatewayBot()).catch((error: DiscordError) => {
      expect(error.status).toBe(403);
      expect(error.raw).toBe("<html>blocked</html>");
    });
  });

  test("a 5xx is retried, then succeeds", async () => {
    const { calls, fetchImpl } = fakeDiscord([
      () => new Response(null, { status: 502 }),
      () => json(200, { ok: true }),
    ]);
    const rest = makeRest(fetchImpl);
    expect(await rest.get<{ ok: boolean }>(gatewayBot())).toEqual({ ok: true });
    expect(calls.length).toBe(2);
  });

  test("a 5xx with retries exhausted throws DiscordError", async () => {
    const { calls, fetchImpl } = fakeDiscord([
      () => new Response(null, { status: 500 }),
    ]);
    const rest = makeRest(fetchImpl, { retries: 0 });
    await expect(rest.get(gatewayBot())).rejects.toBeInstanceOf(
      DiscordError,
    );
    expect(calls.length).toBe(1);
  });

  test("does not retry unsafe POST failures by default", async () => {
    const { calls, fetchImpl } = fakeDiscord([
      () => new Response(null, { status: 502 }),
      () => json(200, { id: "duplicate" }),
    ]);
    const rest = makeRest(fetchImpl);
    await expect(
      rest.post(channelMessages(CHANNEL), { content: "once" }),
    ).rejects.toBeInstanceOf(DiscordError);
    expect(calls).toHaveLength(1);
  });

  test("a network failure is retried, then succeeds", async () => {
    let first = true;
    const { calls, fetchImpl } = fakeDiscord([
      () => {
        first = false;
        throw new TypeError("connection reset");
      },
      () => json(200, { ok: true }),
    ]);
    const rest = makeRest(fetchImpl);
    expect(await rest.get<{ ok: boolean }>(gatewayBot())).toEqual({ ok: true });
    expect(first).toBe(false);
    expect(calls.length).toBe(2);
  });

  test("a network failure with retries exhausted rethrows the ORIGINAL error", async () => {
    const { fetchImpl } = fakeDiscord([
      () => {
        throw new TypeError("connection reset");
      },
    ]);
    const rest = makeRest(fetchImpl, { retries: 0 });
    await expect(rest.get(gatewayBot())).rejects.toThrow(
      "connection reset",
    );
  });

  test("a hung request is aborted by the timeout", async () => {
    const hangingFetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      })) as typeof fetch;
    const rest = makeRest(hangingFetch, { timeoutMs: 30, retries: 0 });
    await expect(rest.get(gatewayBot())).rejects.toThrow();
  });
});

describe("rate limiting", () => {
  test("a 429 is absorbed: wait retry_after, retry, succeed", async () => {
    const { calls, fetchImpl } = fakeDiscord([
      () =>
        json(
          429,
          { message: "You are being rate limited.", retry_after: 0.04 },
          { "retry-after": "1", "x-ratelimit-scope": "user" },
        ),
      () => json(200, { ok: true }),
    ]);
    const rest = makeRest(fetchImpl);

    expect(await rest.get<{ ok: boolean }>(gatewayBot())).toEqual({ ok: true });
    expect(calls.length).toBe(2);
    // Waited the body's precise 40ms, not the header's whole second.
    const gap = calls[1]!.at - calls[0]!.at;
    expect(gap).toBeGreaterThanOrEqual(35);
    expect(gap).toBeLessThan(500);
  });

  test("429s past the retry budget throw RateLimitExhaustedError with scope info", async () => {
    const { fetchImpl } = fakeDiscord([
      () =>
        json(
          429,
          { message: "…", retry_after: 0.01, global: true },
          { "x-ratelimit-global": "true", "x-ratelimit-scope": "global" },
        ),
    ]);
    const rest = makeRest(fetchImpl, { retries: 0 });

    const promise = rest.get(gatewayBot());
    await expect(promise).rejects.toBeInstanceOf(RateLimitExhaustedError);
    await promise.catch((error: RateLimitExhaustedError) => {
      expect(error.global).toBe(true);
      expect(error.scope).toBe("global");
    });
  });

  test("headers with remaining=0 make the NEXT request wait for the reset", async () => {
    const { calls, fetchImpl } = fakeDiscord([
      () => json(200, {}, rlHeaders("hash-a", 5, 0, 0.06)),
      () => json(200, {}, rlHeaders("hash-a", 5, 4, 0.9)),
    ]);
    const rest = makeRest(fetchImpl);

    await rest.get(channelRoute(CHANNEL));
    await rest.get(channelRoute(CHANNEL));

    const gap = calls[1]!.at - calls[0]!.at;
    expect(gap).toBeGreaterThanOrEqual(50);
  });

  test("two routes revealing the same bucket hash share one window", async () => {
    const { calls, fetchImpl } = fakeDiscord([
      // 1. PATCH discovers hash-x with room left.
      () => json(200, {}, rlHeaders("hash-x", 5, 4, 0.9)),
      // GET turns out to be hash-x too, and the window is now empty.
      () => json(200, {}, rlHeaders("hash-x", 5, 0, 0.08)),
      // 3. PATCH again: must inherit that empty window and wait ~80ms.
      () => json(200, {}, rlHeaders("hash-x", 5, 4, 0.9)),
    ]);
    const rest = makeRest(fetchImpl);

    await rest.patch(channelRoute(CHANNEL), { name: "a" });
    await rest.get(channelRoute(CHANNEL));
    await rest.patch(channelRoute(CHANNEL), { name: "b" });

    const gap = calls[2]!.at - calls[1]!.at;
    expect(gap).toBeGreaterThanOrEqual(70);
  });

  test("bounds idle buckets and learned route hashes", async () => {
    const script = Array.from({ length: 8 }, (_, index) => () =>
      json(200, {}, rlHeaders(`bucket-${index}`, 10, 9, 1)),
    );
    const { fetchImpl } = fakeDiscord(script);
    const rest = makeRest(fetchImpl, { maxBuckets: 3, bucketTtlMs: 60_000 });

    for (let index = 0; index < 8; index += 1) {
      await rest.get(`/test/route-${String.fromCharCode(97 + index)}`);
    }

    expect(rest.diagnostics.buckets).toBeLessThanOrEqual(3);
    expect(rest.diagnostics.learnedRoutes).toBeLessThanOrEqual(3);
  });
});
