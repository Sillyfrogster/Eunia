import { describe, expect, test } from "bun:test";
import { Message } from "@eunia/structures";
import type { ListMessagesOptions } from "../src/domains/messages";
import {
  CHANNEL_ID,
  MESSAGE_ID,
  json,
  makeClient,
  message,
} from "./fixtures";

describe("message history", () => {
  test("lists, hydrates, and caches channel messages", async () => {
    const older = message({ id: "111111111111111110", content: "older" });
    const newer = message({ id: "111111111111111112", content: "newer" });
    const { client, calls } = makeClient([() => json([newer, older])]);

    const messages = await client.messages.list(CHANNEL_ID, {
      before: MESSAGE_ID,
      limit: 2,
    });

    expect(messages.map((entry) => entry.content)).toEqual(["newer", "older"]);
    expect(messages.every((entry) => entry instanceof Message)).toBe(true);
    expect(client.cache.messages.resolve(newer.id)).toEqual(newer);
    expect(client.cache.messages.resolve(older.id)).toEqual(older);
    expect(calls[0]?.url).toContain(`/channels/${CHANNEL_ID}/messages`);
    expect(calls[0]?.url).toContain(`before=${MESSAGE_ID}`);
    expect(calls[0]?.url).toContain("limit=2");
  });

  test("supports after and around anchors", async () => {
    const { client, calls } = makeClient([
      () => json([]),
      () => json([]),
    ]);

    await client.messages.list(CHANNEL_ID, { after: MESSAGE_ID });
    await client.messages.list(CHANNEL_ID, { around: MESSAGE_ID });

    expect(calls[0]?.url).toContain(`after=${MESSAGE_ID}`);
    expect(calls[1]?.url).toContain(`around=${MESSAGE_ID}`);
  });

  test("rejects conflicting anchors and invalid limits before requesting", async () => {
    const { client, calls } = makeClient();
    const conflicting = {
      before: MESSAGE_ID,
      after: "111111111111111112",
    } as unknown as ListMessagesOptions;

    await expect(client.messages.list(CHANNEL_ID, conflicting)).rejects.toThrow(
      /only one/,
    );
    await expect(client.messages.list(CHANNEL_ID, { limit: 101 })).rejects.toThrow(
      /between 1 and 100/,
    );
    await expect(client.messages.list(CHANNEL_ID, { before: "" })).rejects.toThrow(
      /id is required/,
    );
    expect(calls).toHaveLength(0);
  });
});
