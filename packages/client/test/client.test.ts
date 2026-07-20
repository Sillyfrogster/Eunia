import { describe, expect, test } from "bun:test";
import { Intents } from "@eunia/gateway";
import { GatewayOpcode } from "@eunia/gateway";
import { SilentLogger } from "@eunia/shared";
import { ChannelType, PermissionFlags } from "@eunia/types";
import type * as types from "@eunia/types";
import { Guild, Message, User } from "@eunia/structures";
import { Client } from "../src/client";
import { routeDispatch } from "../src/events";
import { orderModules } from "../src/modules";
import { resolveIntents } from "../src/options";
import { ServiceRegistry } from "../src/services";
import { MockGateway } from "../../gateway/test/mock-gateway";

const GUILD_ID = "987654321098765432";
const CHANNEL_ID = "123456789012345678";
const USER_ID = "222222222222222222";
const MESSAGE_ID = "111111111111111111";

function json(body: unknown): Response {
  return Response.json(body);
}

function makeClient(script: Array<() => Response> = []) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = script.shift();
    if (next === undefined) throw new Error("The fake REST response queue is empty.");
    return next();
  }) as typeof fetch;
  const client = new Client({
    token: "unit.test.token",
    intents: [Intents.Guilds],
    rest: { fetch: fetchImpl },
  });
  return { client, calls };
}

function user(overrides: Partial<types.User> = {}): types.User {
  return {
    id: USER_ID,
    username: "eunia-user",
    discriminator: "0",
    global_name: "Eunia User",
    avatar: null,
    ...overrides,
  };
}

function role(overrides: Partial<types.Role> = {}): types.Role {
  return {
    id: GUILD_ID,
    name: "@everyone",
    color: 0,
    colors: {
      primary_color: 0,
      secondary_color: null,
      tertiary_color: null,
    },
    hoist: false,
    icon: null,
    unicode_emoji: null,
    position: 0,
    permissions: PermissionFlags.ViewChannel.toString() as `${bigint}`,
    managed: false,
    mentionable: false,
    flags: 0,
    ...overrides,
  };
}

function member(overrides: Partial<types.GuildMember> = {}): types.GuildMember {
  return {
    user: user(),
    roles: [],
    joined_at: "2026-01-01T00:00:00.000Z",
    deaf: false,
    mute: false,
    flags: 0,
    ...overrides,
  };
}

function guild(overrides: Partial<types.Guild> = {}): types.Guild {
  return {
    id: GUILD_ID,
    name: "Eunia test guild",
    icon: null,
    splash: null,
    discovery_splash: null,
    owner_id: USER_ID,
    afk_channel_id: null,
    afk_timeout: 300,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    roles: [role()],
    emojis: [],
    features: [],
    mfa_level: 0,
    application_id: null,
    system_channel_id: null,
    system_channel_flags: 0,
    rules_channel_id: null,
    vanity_url_code: null,
    description: null,
    banner: null,
    premium_tier: 0,
    preferred_locale: "en-US",
    public_updates_channel_id: null,
    nsfw_level: 0,
    premium_progress_bar_enabled: false,
    safety_alerts_channel_id: null,
    incidents_data: null,
    ...overrides,
  };
}

function message(overrides: Partial<types.Message> = {}): types.Message {
  return {
    id: MESSAGE_ID,
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    author: user(),
    content: "hello",
    timestamp: "2026-01-01T00:00:00.000Z",
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...overrides,
  };
}

describe("resolveIntents", () => {
  test("accepts a bitfield or an array", () => {
    expect(resolveIntents(Intents.Guilds)).toBe(Intents.Guilds);
    expect(
      resolveIntents([Intents.Guilds, Intents.GuildMessages]),
    ).toBe(Intents.Guilds | Intents.GuildMessages);
    expect(resolveIntents([1, 1, 2])).toBe(3);
  });

  test("rejects invalid values", () => {
    expect(() => resolveIntents(-1)).toThrow(/non-negative/);
    expect(() => resolveIntents([1.5])).toThrow(/non-negative/);
  });
});

describe("dispatch routing", () => {
  test("stores raw messages before emitting hydrated messages", () => {
    const { client } = makeClient();
    let received: Message | undefined;
    let cachedDuringListener = false;
    client.on("messageCreate", (value) => {
      received = value;
      cachedDuringListener = client.cache.messages.has(value.id);
    });

    const raw = message();
    routeDispatch(client, client.context, "MESSAGE_CREATE", raw);

    expect(received).toBeInstanceOf(Message);
    expect(received?.content).toBe("hello");
    expect(cachedDuringListener).toBe(true);
    expect(client.cache.messages.resolve(MESSAGE_ID)).toEqual(raw);
    expect(client.cache.messages.resolve(MESSAGE_ID)).not.toBeInstanceOf(Message);
  });

  test("stores nested guild channels with their guild id", () => {
    const { client } = makeClient();
    const raw = guild({
      channels: [{ id: CHANNEL_ID, type: ChannelType.GuildText, name: "general" }],
    });
    let received: Guild | undefined;
    client.on("guildCreate", (value) => {
      received = value;
    });

    routeDispatch(client, client.context, "GUILD_CREATE", raw);

    expect(received?.name).toBe("Eunia test guild");
    expect(client.cache.channels.resolve(CHANNEL_ID)?.guild_id).toBe(GUILD_ID);
    expect(received?.channel(CHANNEL_ID)?.guild?.id).toBe(GUILD_ID);
  });

  test("removes deleted channels and members from the guild snapshot", () => {
    const { client } = makeClient();
    const raw = guild({
      channels: [{ id: CHANNEL_ID, type: ChannelType.GuildText, name: "general" }],
      members: [member()],
    });
    let received: Guild | undefined;
    client.on("guildCreate", (value) => {
      received = value;
    });
    routeDispatch(client, client.context, "GUILD_CREATE", raw);

    routeDispatch(client, client.context, "CHANNEL_DELETE", {
      id: CHANNEL_ID,
      guild_id: GUILD_ID,
      type: ChannelType.GuildText,
      name: "general",
    });
    routeDispatch(client, client.context, "GUILD_MEMBER_REMOVE", {
      guild_id: GUILD_ID,
      user: user(),
    });

    expect(received?.channels.has(CHANNEL_ID)).toBe(false);
    expect(received?.members.has(USER_ID)).toBe(false);
    expect(client.cache.guilds.resolve(GUILD_ID)?.channels).toEqual([]);
    expect(client.cache.guilds.resolve(GUILD_ID)?.members).toEqual([]);
  });

  test("records identity from READY without emitting the client ready event", () => {
    const { client } = makeClient();
    let readyEvents = 0;
    client.on("ready", () => {
      readyEvents += 1;
    });

    routeDispatch(client, client.context, "READY", {
      v: 10,
      user: user({ id: "999999999999999999", bot: true }),
      session_id: "session",
      resume_gateway_url: "wss://gateway.test",
      guilds: [],
      application: { id: "888888888888888888" },
    });

    expect(client.self).toBeInstanceOf(User);
    expect(client.botId).toBe("999999999999999999");
    expect(client.applicationId).toBe("888888888888888888");
    expect(readyEvents).toBe(0);
  });

  test("merges partial message updates and deletes cached messages", () => {
    const { client } = makeClient();
    routeDispatch(client, client.context, "MESSAGE_CREATE", message());

    let updated: Message | undefined;
    client.on("messageUpdate", (value) => {
      updated = value;
    });
    routeDispatch(client, client.context, "MESSAGE_UPDATE", {
      id: MESSAGE_ID,
      channel_id: CHANNEL_ID,
      content: "edited",
    });
    expect(updated?.content).toBe("edited");

    routeDispatch(client, client.context, "MESSAGE_DELETE", {
      id: MESSAGE_ID,
      channel_id: CHANNEL_ID,
      guild_id: GUILD_ID,
    });
    expect(client.cache.messages.resolve(MESSAGE_ID)).toBeUndefined();
  });
});

describe("domain accessors", () => {
  test("get reads through the raw cache after one REST request", async () => {
    const raw = user({ id: "42", username: "someone" });
    const { client, calls } = makeClient([() => json(raw)]);

    const first = await client.users.get("42");
    const second = await client.users.get("42");

    expect(first).toBeInstanceOf(User);
    expect(second).toBeInstanceOf(User);
    expect(second.raw).toEqual(first.raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/users/42");
  });

  test("pull always fetches and refreshes the cache; peek stays sync", async () => {
    const { client } = makeClient([
      () => json(user({ id: "42", username: "old" })),
      () => json(user({ id: "42", username: "new" })),
    ]);
    expect(client.users.peek("42")).toBeUndefined();
    await client.users.get("42");
    const refreshed = await client.users.pull("42");

    expect(refreshed.username).toBe("new");
    expect(client.users.peek("42")?.username).toBe("new");
  });
});

describe("extension helpers", () => {
  test("orders dependencies and detects missing or cyclic modules", () => {
    const database = { name: "database" };
    const monitoring = { name: "monitoring", dependsOn: ["database"] };
    expect(orderModules([monitoring, database]).map((module) => module.name)).toEqual([
      "database",
      "monitoring",
    ]);
    expect(() => orderModules([{ name: "a", dependsOn: ["missing"] }])).toThrow(
      /missing/,
    );
    expect(() =>
      orderModules([
        { name: "a", dependsOn: ["b"] },
        { name: "b", dependsOn: ["a"] },
      ]),
    ).toThrow(/cycle/);
  });

  test("keeps services explicit and collision-safe", () => {
    const services = new ServiceRegistry();
    services.provide("database", { connected: true });
    expect(services.get<{ connected: boolean }>("database").connected).toBe(true);
    expect(() => services.provide("database", {})).toThrow(/already registered/);
    expect(() => services.get("missing")).toThrow(/No service/);
  });
});

describe("client lifecycle", () => {
  test("starts modules after every shard is ready and stops them in reverse", async () => {
    const gateway = new MockGateway();
    const events: string[] = [];
    const database = {
      name: "database",
      setup(client: Client) {
        events.push("database:setup");
        client.services.provide("database", { ready: true });
      },
      start() {
        events.push("database:start");
      },
      stop() {
        events.push("database:stop");
      },
    };
    const monitoring = {
      name: "monitoring",
      dependsOn: ["database"],
      setup() {
        events.push("monitoring:setup");
      },
      start() {
        events.push("monitoring:start");
      },
      stop() {
        events.push("monitoring:stop");
      },
    };
    const fetchImpl = (async () =>
      json({
        url: gateway.url,
        shards: 1,
        session_start_limit: {
          total: 1_000,
          remaining: 1_000,
          reset_after: 60_000,
          max_concurrency: 1,
        },
      })) as unknown as typeof fetch;
    const client = new Client({
      token: "unit.test.token",
      intents: Intents.Guilds,
      modules: [monitoring, database],
      rest: { fetch: fetchImpl },
      logger: new SilentLogger(),
    });

    try {
      const starting = client.start();
      await gateway.nextOfOp(GatewayOpcode.Identify);
      gateway.sendDispatch(
        "READY",
        {
          v: 10,
          user: user({ id: "999999999999999999", bot: true }),
          session_id: "client-session",
          resume_gateway_url: gateway.url,
          guilds: [],
          application: { id: "888888888888888888", flags: 0 },
        },
        1,
      );
      await starting;

      expect(client.state).toBe("ready");
      expect(events).toEqual([
        "database:setup",
        "monitoring:setup",
        "database:start",
        "monitoring:start",
      ]);
      expect(client.services.get<{ ready: boolean }>("database").ready).toBe(true);

      await client.stop();
      expect(client.state).toBe("stopped");
      expect(events.slice(-2)).toEqual(["monitoring:stop", "database:stop"]);
    } finally {
      await client.stop().catch(() => undefined);
      gateway.stop();
    }
  });
});
