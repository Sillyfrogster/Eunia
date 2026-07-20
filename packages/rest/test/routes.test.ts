import { describe, expect, test } from "bun:test";
import { routePath, withQuery } from "../src/routes";

const CHANNEL = "123456789012345678";
const GUILD = "987654321098765432";
const MESSAGE = "111111111111111111";

describe("routePath", () => {
  test("interpolates parameters into the path and keeps the template", () => {
    const route = routePath("/channels/{channelId}/messages/{messageId}", {
      channelId: CHANNEL,
      messageId: MESSAGE,
    });
    expect(route.path).toBe(`/channels/${CHANNEL}/messages/${MESSAGE}`);
    expect(route.template).toBe("/channels/{channelId}/messages/{messageId}");
  });

  test("a missing parameter throws", () => {
    expect(() => routePath("/channels/{channelId}", {})).toThrow(
      'missing the "channelId" parameter',
    );
  });

  test("parameters are URL-encoded, except @me and @original", () => {
    const emoji = routePath(
      "/channels/{channelId}/messages/{messageId}/reactions/{emoji}/{userId}",
      { channelId: CHANNEL, messageId: MESSAGE, emoji: "🔥", userId: "@me" },
    );
    expect(emoji.path).toBe(
      `/channels/${CHANNEL}/messages/${MESSAGE}/reactions/${encodeURIComponent("🔥")}/@me`,
    );
  });

  test("channel and guild ids become the major parameter", () => {
    expect(
      routePath("/channels/{channelId}/messages", { channelId: CHANNEL }).majorParam,
    ).toBe(CHANNEL);
    expect(routePath("/guilds/{guildId}", { guildId: GUILD }).majorParam).toBe(GUILD);
  });

  test("routes without a major parameter fall back to 'global'", () => {
    expect(routePath("/gateway/bot").majorParam).toBe("global");
    expect(routePath("/users/@me").majorParam).toBe("global");
  });

  test("two messages in one channel share one template and major param", () => {
    const a = routePath("/channels/{channelId}/messages/{messageId}", {
      channelId: CHANNEL,
      messageId: MESSAGE,
    });
    const b = routePath("/channels/{channelId}/messages/{messageId}", {
      channelId: CHANNEL,
      messageId: "222222222222222222",
    });
    expect(a.template).toBe(b.template);
    expect(a.majorParam).toBe(b.majorParam);
  });

  test("the same template in two channels differs only by major param", () => {
    const a = routePath("/channels/{channelId}/messages", { channelId: CHANNEL });
    const b = routePath("/channels/{channelId}/messages", {
      channelId: "333333333333333333",
    });
    expect(a.template).toBe(b.template);
    expect(a.majorParam).not.toBe(b.majorParam);
  });

  test("webhook tokens are hashed into the major parameter", () => {
    const first = routePath("/webhooks/{webhookId}/{webhookToken}", {
      webhookId: "444444444444444444",
      webhookToken: "token-a",
    });
    const second = routePath("/webhooks/{webhookId}/{webhookToken}", {
      webhookId: "444444444444444444",
      webhookToken: "token-b",
    });
    expect(first.majorParam).not.toBe(second.majorParam);
    expect(first.majorParam).not.toContain("token-a");
    expect(second.majorParam).not.toContain("token-b");
    expect(first.template).not.toContain("token-a");
  });

  test("interaction callbacks get a private major param per interaction", () => {
    const first = routePath("/interactions/{interactionId}/{interactionToken}/callback", {
      interactionId: "444444444444444444",
      interactionToken: "private-token-a",
    });
    const second = routePath("/interactions/{interactionId}/{interactionToken}/callback", {
      interactionId: "555555555555555555",
      interactionToken: "private-token-b",
    });
    expect(first.majorParam).not.toBe(second.majorParam);
    expect(first.majorParam).not.toContain("private-token-a");
  });
});

describe("withQuery", () => {
  test("appends defined values and skips null/undefined", () => {
    expect(withQuery("/gateway/bot", { limit: 25, after: undefined, x: null })).toBe(
      "/gateway/bot?limit=25",
    );
  });

  test("returns the input unchanged when every value is absent", () => {
    expect(withQuery("/gateway/bot", { a: undefined })).toBe("/gateway/bot");
  });

  test("on a bound route, changes the path but never the template", () => {
    const base = routePath("/channels/{channelId}/messages", { channelId: CHANNEL });
    const withLimit = withQuery(base, { limit: 25 });
    expect(withLimit.path).toBe(`/channels/${CHANNEL}/messages?limit=25`);
    expect(withLimit.template).toBe(base.template);
    expect(withLimit.majorParam).toBe(base.majorParam);
  });
});
