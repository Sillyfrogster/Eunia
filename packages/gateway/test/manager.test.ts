import { describe, expect, test } from "bun:test";
import {
  ShardManager,
  shardIdForGuild,
  type GatewayBotInfo,
} from "../src";

function gateway(overrides: Partial<GatewayBotInfo> = {}): GatewayBotInfo {
  return {
    url: "wss://gateway.test",
    shards: 4,
    session_start_limit: {
      total: 10,
      remaining: 10,
      reset_after: 60_000,
      max_concurrency: 2,
    },
    ...overrides,
  };
}

describe("shardIdForGuild", () => {
  test("uses Discord's snowflake routing formula", () => {
    const shardCount = 7;
    for (let expected = 0; expected < shardCount; expected += 1) {
      const guildId = String((BigInt(expected + shardCount * 100) << 22n) + 123n);
      expect(shardIdForGuild(guildId, shardCount)).toBe(expected);
    }
  });

  test("rejects invalid ids and shard counts", () => {
    expect(() => shardIdForGuild("not-an-id", 2)).toThrow(/snowflake/);
    expect(() => shardIdForGuild("123", 0)).toThrow(/positive integer/);
  });
});

describe("ShardManager plans", () => {
  test("uses Discord's recommended shard count in auto mode", () => {
    const manager = new ShardManager({
      gateway: gateway(),
      token: "token",
      intents: 0,
      shards: "auto",
    });
    expect(manager.totalShards).toBe(4);
    expect(manager.shardIds).toEqual([0, 1, 2, 3]);
  });

  test("supports assigning part of a shard set to one process", () => {
    const manager = new ShardManager({
      gateway: gateway(),
      token: "token",
      intents: 0,
      shards: { total: 8, ids: [1, 5] },
    });
    expect(manager.totalShards).toBe(8);
    expect(manager.shardIds).toEqual([1, 5]);
  });

  test("fails before connecting when the identify budget is too small", () => {
    const limited = gateway({
      session_start_limit: {
        total: 4,
        remaining: 1,
        reset_after: 60_000,
        max_concurrency: 1,
      },
    });
    expect(
      () =>
        new ShardManager({
          gateway: limited,
          token: "token",
          intents: 0,
          shards: 2,
        }),
    ).toThrow(/identify budget/);
  });
});
