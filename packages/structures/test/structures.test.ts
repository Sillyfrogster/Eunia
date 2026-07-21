import { describe, expect, test } from "bun:test";
import { Cache } from "@eunia/cache";
import { DiscordError, type EuniaRest, type RequestPath } from "@eunia/rest";
import {
  ApplicationCommandType,
  ChannelType,
  ComponentType,
  InteractionType,
  MessageFlags,
  MessageReferenceType,
  OverwriteType,
  PermissionFlags,
  TextInputStyle,
  can,
  canAny,
  missing,
  toFlagNames,
} from "@eunia/types";
import type * as types from "@eunia/types";
import {
  Channel,
  Guild,
  GuildMember,
  InteractionAlreadyAcknowledgedError,
  InteractionNotAcknowledgedError,
  Message,
  Role,
  User,
  createInteraction,
  isInteraction,
  memberCacheKey,
  normalizeSendable,
  snowflakeTimestamp,
  type StructureCacheShape,
  type StructureContext,
} from "../src";

const USER_ID = "175928847299117063";
const SECOND_USER_ID = "175928847299117064";
const CHANNEL_ID = "123456789012345678";
const GUILD_ID = "987654321098765432";
const MESSAGE_ID = "111111111111111111";
const ROLE_ID = "444444444444444444";

interface RestCall {
  method: string;
  path: string;
  body?: unknown;
  options?: unknown;
}

class FakeRest {
  readonly calls: RestCall[] = [];
  private readonly responses: Array<unknown | Promise<unknown> | Error> = [];

  queue(...responses: Array<unknown | Promise<unknown> | Error>): this {
    this.responses.push(...responses);
    return this;
  }

  get<T>(path: RequestPath, options?: unknown): Promise<T> {
    return this.request("GET", path, undefined, options);
  }

  post<T>(path: RequestPath, body?: unknown, options?: unknown): Promise<T> {
    return this.request("POST", path, body, options);
  }

  patch<T>(path: RequestPath, body?: unknown, options?: unknown): Promise<T> {
    return this.request("PATCH", path, body, options);
  }

  put<T>(path: RequestPath, body?: unknown, options?: unknown): Promise<T> {
    return this.request("PUT", path, body, options);
  }

  delete<T>(path: RequestPath, options?: unknown): Promise<T> {
    return this.request("DELETE", path, undefined, options);
  }

  private async request<T>(
    method: string,
    path: RequestPath,
    body?: unknown,
    options?: unknown,
  ): Promise<T> {
    this.calls.push({
      method,
      path: typeof path === "string" ? path : path.path,
      ...(body === undefined ? {} : { body }),
      ...(options === undefined || Object.keys(options as object).length === 0
        ? {}
        : { options }),
    });
    if (this.responses.length === 0) throw new Error("Fake REST response queue is empty.");
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return (await response) as T;
  }
}

function makeContext(): { context: StructureContext; rest: FakeRest } {
  const rest = new FakeRest();
  return {
    rest,
    context: {
      rest: rest as unknown as EuniaRest,
      cache: new Cache<StructureCacheShape>(),
    },
  };
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

function channel(overrides: Partial<types.Channel> = {}): types.Channel {
  return {
    id: CHANNEL_ID,
    type: ChannelType.GuildText,
    guild_id: GUILD_ID,
    name: "general",
    ...overrides,
  };
}

function role(overrides: Partial<types.Role> = {}): types.Role {
  return {
    id: ROLE_ID,
    name: "Helpers",
    color: 0x5b8cff,
    colors: {
      primary_color: 0x5b8cff,
      secondary_color: null,
      tertiary_color: null,
    },
    hoist: false,
    icon: null,
    unicode_emoji: null,
    position: 1,
    permissions: PermissionFlags.SendMessages.toString() as `${bigint}`,
    managed: false,
    mentionable: true,
    flags: 0,
    ...overrides,
  };
}

function member(overrides: Partial<types.GuildMember> = {}): types.GuildMember {
  return {
    user: user(),
    roles: [ROLE_ID],
    joined_at: "2024-01-01T00:00:00.000Z",
    deaf: false,
    mute: false,
    flags: 0,
    ...overrides,
  };
}

function guild(overrides: Partial<types.Guild> = {}): types.Guild {
  return {
    id: GUILD_ID,
    name: "Eunia",
    icon: null,
    splash: null,
    discovery_splash: null,
    owner_id: USER_ID,
    afk_channel_id: null,
    afk_timeout: 300,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    roles: [role({ id: GUILD_ID, name: "@everyone", position: 0 })],
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
    timestamp: "2024-01-01T00:00:00.000Z",
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

const INTERACTION_BASE = {
  id: "555555555555555555",
  application_id: "666666666666666666",
  token: "interaction.token",
  version: 1 as const,
  entitlements: [],
  authorizing_integration_owners: {},
  attachment_size_limit: 10_000_000,
};

function commandInteraction(): types.ApplicationCommandInteraction {
  return {
    ...INTERACTION_BASE,
    type: InteractionType.ApplicationCommand,
    data: {
      id: "777777777777777777",
      name: "test",
      type: ApplicationCommandType.ChatInput,
    },
  };
}

function componentInteraction(
  data: types.MessageComponentInteractionData,
  extra: Partial<Omit<types.MessageComponentInteraction, "type" | "data">> = {},
): types.MessageComponentInteraction {
  return {
    ...INTERACTION_BASE,
    ...extra,
    type: InteractionType.MessageComponent,
    data,
  };
}

function modalInteraction(
  data: types.ModalSubmitInteractionData,
): types.ModalSubmitInteraction {
  return {
    ...INTERACTION_BASE,
    type: InteractionType.ModalSubmit,
    data,
  };
}

describe("permission values", () => {
  test("can, canAny, missing, and toFlagNames work on plain bigints", () => {
    const bits = PermissionFlags.ViewChannel | PermissionFlags.SendMessages;
    expect(can(bits, PermissionFlags.SendMessages)).toBe(true);
    expect(can(bits, PermissionFlags.SendMessages | PermissionFlags.BanMembers)).toBe(false);
    expect(canAny(bits, PermissionFlags.BanMembers | PermissionFlags.ViewChannel)).toBe(true);
    expect(missing(bits, PermissionFlags.BanMembers | PermissionFlags.ViewChannel)).toEqual([
      "BanMembers",
    ]);
    expect(toFlagNames(bits).sort()).toEqual(["SendMessages", "ViewChannel"]);
  });

  test("Administrator implies every permission", () => {
    expect(can(PermissionFlags.Administrator, PermissionFlags.BanMembers)).toBe(true);
    expect(missing(PermissionFlags.Administrator, PermissionFlags.BanMembers)).toEqual([]);
  });

  test("snowflake timestamps decode against the Discord epoch", () => {
    expect(snowflakeTimestamp(USER_ID)).toBe(
      Number((BigInt(USER_ID) >> 22n) + 1_420_070_400_000n),
    );
  });
});

describe("normalizeSendable", () => {
  test("accepts a string, one embed, an embed list, and a full object", () => {
    expect(normalizeSendable("hi")).toEqual({ content: "hi" });
    expect(normalizeSendable({ title: "Status" })).toEqual({
      embeds: [{ title: "Status" }],
    });
    expect(normalizeSendable([{ title: "One" }, { title: "Two" }])).toEqual({
      embeds: [{ title: "One" }, { title: "Two" }],
    });
    expect(normalizeSendable({ content: "Done", embeds: [{ title: "Status" }] })).toEqual({
      content: "Done",
      embeds: [{ title: "Status" }],
    });
  });

  test("validates message creates separately from edits", () => {
    expect(() => normalizeSendable({})).toThrow(/Message creates need/);
    expect(() => normalizeSendable("")).toThrow(/Message creates need/);
    expect(normalizeSendable({}, "edit")).toEqual({});
    expect(normalizeSendable("", "edit")).toEqual({ content: "" });
    expect(normalizeSendable({ content: null }, "edit")).toEqual({ content: null });
    expect(() => normalizeSendable("x".repeat(2_001))).toThrow(/2000/);
    expect(
      normalizeSendable({
        message_reference: {
          type: MessageReferenceType.Forward,
          message_id: MESSAGE_ID,
        },
      }),
    ).toEqual({
      message_reference: {
        type: MessageReferenceType.Forward,
        message_id: MESSAGE_ID,
      },
    });
  });

  test("counts embed text across the whole message", () => {
    expect(
      normalizeSendable({
        embeds: [
          { description: "a".repeat(3_000) },
          { description: "b".repeat(3_000) },
        ],
      }),
    ).toBeDefined();
    expect(() =>
      normalizeSendable({
        embeds: [
          { description: "a".repeat(3_001) },
          { description: "b".repeat(3_000) },
        ],
      }),
    ).toThrow(/6000 embed text/);
  });

  test("enforces legacy and Components V2 message layouts", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      type: ComponentType.ActionRow as const,
      components: [
        {
          type: ComponentType.Button as const,
          style: 1 as const,
          custom_id: `button-${index}`,
          label: `Button ${index}`,
        },
      ],
    }));
    expect(() => normalizeSendable({ components: rows })).toThrow(/five action rows/);
    expect(
      normalizeSendable({
        flags: MessageFlags.IsComponentsV2,
        components: rows,
      }).components,
    ).toHaveLength(6);

    const text = { type: ComponentType.TextDisplay, content: "Component content" } as const;
    expect(() => normalizeSendable({ components: [text] })).toThrow(
      /MessageFlags\.IsComponentsV2/,
    );
    expect(() =>
      normalizeSendable({
        flags: MessageFlags.IsComponentsV2,
        content: "Legacy content",
        components: [text],
      }),
    ).toThrow(/cannot include content/);
    expect(
      normalizeSendable(
        {
          flags: MessageFlags.IsComponentsV2,
          content: null,
          embeds: [],
          components: [text],
        },
        "edit",
      ),
    ).toEqual({
      flags: MessageFlags.IsComponentsV2,
      content: null,
      embeds: [],
      components: [text],
    });
    expect(() =>
      normalizeSendable(
        {
          flags: MessageFlags.IsComponentsV2,
          content: "Legacy content",
          components: [text],
        },
        "edit",
      ),
    ).toThrow(/can only clear content/);
  });
});

describe("User and Channel", () => {
  test("provides mentions, display names, and safe avatar URLs", () => {
    const { context } = makeContext();
    const structure = new User(
      user({ avatar: "a_avatar", global_name: null }),
      context,
    );

    expect(structure.displayName).toBe("eunia-user");
    expect(structure.mention).toBe(`<@${USER_ID}>`);
    expect(structure.avatarURL({ size: 128 })).toBe(
      `https://cdn.discordapp.com/avatars/${USER_ID}/a_avatar.gif?size=128`,
    );
    expect(Object.isFrozen(structure.raw)).toBe(true);
  });

  test("creates a DM and sends normalized content", async () => {
    const { context, rest } = makeContext();
    const { guild_id: _channelGuild, ...dm } = channel({ type: ChannelType.DM });
    const { guild_id: _messageGuild, ...sent } = message({ content: "hello from DM" });
    rest.queue(dm, sent);

    const result = await new User(user(), context).send("hello from DM");

    expect(result).toBeInstanceOf(Message);
    expect(rest.calls).toEqual([
      {
        method: "POST",
        path: "/users/@me/channels",
        body: { recipient_id: USER_ID },
      },
      {
        method: "POST",
        path: `/channels/${CHANNEL_ID}/messages`,
        body: { content: "hello from DM" },
      },
    ]);
    expect(context.cache.channels.resolve(CHANNEL_ID)).toEqual(dm);
    expect(context.cache.messages.resolve(MESSAGE_ID)).toEqual(sent);
    expect(context.cache.messages.resolve(MESSAGE_ID)).not.toBeInstanceOf(Message);
  });

  test("edits and deletes channels without mutating the original", async () => {
    const { context, rest } = makeContext();
    const raw = channel({ topic: "old" });
    const edited = channel({ topic: "new" });
    context.cache.guilds.set(GUILD_ID, guild({ channels: [raw] }));
    context.cache.channels.set(CHANNEL_ID, raw);
    rest.queue(edited, edited);

    const original = new Channel(raw, context);
    const next = await original.updateTopic("new");
    const deleted = await next.delete();

    expect(original.topic).toBe("old");
    expect(next.topic).toBe("new");
    expect(deleted).toBeInstanceOf(Channel);
    expect(context.cache.channels.resolve(CHANNEL_ID)).toBeUndefined();
    expect(context.cache.guilds.resolve(GUILD_ID)?.channels).toEqual([]);
  });
});

describe("Message", () => {
  test("keeps nested snapshot data isolated and immutable", () => {
    const { context } = makeContext();
    const raw = message({ embeds: [{ title: "Original" }] });
    const structure = new Message(raw, context);

    raw.embeds[0]!.title = "Changed outside";

    expect(structure.raw.embeds[0]?.title).toBe("Original");
    expect(Object.isFrozen(structure.raw.embeds)).toBe(true);
    expect(Object.isFrozen(structure.raw.embeds[0])).toBe(true);
    expect(() => structure.raw.embeds.push({ title: "Changed inside" })).toThrow();
  });

  test("resolves related raw payloads from the hot cache", () => {
    const { context } = makeContext();
    const rawChannel = channel();
    const rawGuild = guild();
    context.cache.channels.set(CHANNEL_ID, rawChannel);
    context.cache.guilds.set(GUILD_ID, rawGuild);

    const structure = new Message(message(), context);
    expect(structure.author).toBeInstanceOf(User);
    expect(structure.channel?.raw).toEqual(rawChannel);
    expect(structure.guild?.raw).toEqual(rawGuild);
    expect(structure.url).toBe(
      `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${MESSAGE_ID}`,
    );
  });

  test("replies, edits, reacts, pins, and deletes through the right routes", async () => {
    const { context, rest } = makeContext();
    const reply = message({ id: "222222222222222222", content: "reply" });
    const edited = message({ content: "edited" });
    rest.queue(reply, edited, undefined, undefined, undefined, undefined, undefined);
    const structure = new Message(message(), context);

    await structure.reply("reply");
    await structure.edit("edited");
    await structure.react("party:123");
    await structure.removeOwnReaction("✅");
    await structure.pin();
    await structure.unpin();
    await structure.delete();

    expect(rest.calls[0]?.body).toEqual({
      content: "reply",
      message_reference: {
        message_id: MESSAGE_ID,
        channel_id: CHANNEL_ID,
        guild_id: GUILD_ID,
      },
    });
    expect(rest.calls[2]?.path).toContain("party%3A123");
    expect(rest.calls[3]?.path).toContain("%E2%9C%85");
    expect(rest.calls[4]?.method).toBe("PUT");
    expect(rest.calls[5]?.method).toBe("DELETE");
    expect(context.cache.messages.resolve(MESSAGE_ID)).toBeUndefined();
  });
});

describe("Guild, member, and role", () => {
  test("fetches members and stores their raw payload under the guild key", async () => {
    const { context, rest } = makeContext();
    const raw = member();
    rest.queue(raw);

    const result = await new Guild(guild(), context).fetchMember(USER_ID);

    expect(result).toBeInstanceOf(GuildMember);
    expect(result.mention).toBe(`<@${USER_ID}>`);
    expect(context.cache.members.resolve(memberCacheKey(GUILD_ID, USER_ID))).toEqual(raw);
    expect(context.cache.users.resolve(USER_ID)).toEqual(raw.user);
  });

  test("calculates role permissions and runs common moderation methods", async () => {
    const { context, rest } = makeContext();
    context.cache.guilds.set(
      GUILD_ID,
      guild({ owner_id: SECOND_USER_ID, members: [member()] }),
    );
    context.cache.roles.set(ROLE_ID, role());
    rest.queue(member({ nick: "New name" }), member(), undefined, undefined, undefined);
    const structure = new GuildMember(member(), context, GUILD_ID, USER_ID);

    expect(structure.can(PermissionFlags.SendMessages)).toBe(true);
    expect(structure.missing(PermissionFlags.BanMembers)).toEqual(["BanMembers"]);
    expect((await structure.setNickname("New name")).displayName).toBe("New name");
    await structure.timeout(null);
    await structure.addRole(ROLE_ID);
    await structure.removeRole(ROLE_ID);
    await structure.kick();

    expect(rest.calls[0]?.body).toEqual({ nick: "New name" });
    expect(rest.calls[1]?.body).toEqual({ communication_disabled_until: null });
    expect(rest.calls[2]?.path).toEndWith(`/roles/${ROLE_ID}`);
    expect(rest.calls[2]?.method).toBe("PUT");
    expect(rest.calls[3]?.method).toBe("DELETE");
    expect(context.cache.members.resolve(memberCacheKey(GUILD_ID, USER_ID))).toBeUndefined();
    expect(context.cache.guilds.resolve(GUILD_ID)?.members).toEqual([]);
  });

  test("guild bulk accessors return plain read-only maps", () => {
    const { context } = makeContext();
    context.cache.guilds.set(GUILD_ID, guild({ members: [member()] }));
    const structure = new Guild(guild(), context);

    const roles = structure.roles;
    expect(roles.get(GUILD_ID)).toBeInstanceOf(Role);
    expect(roles.values().find((entry) => entry.name === "@everyone")).toBeDefined();
    expect(structure.members.get(USER_ID)).toBeInstanceOf(GuildMember);
  });

  test("applies channel overwrites in Discord's precedence order", () => {
    const { context } = makeContext();
    context.cache.guilds.set(GUILD_ID, guild({ owner_id: SECOND_USER_ID }));
    context.cache.roles.set(ROLE_ID, role());
    const structure = new GuildMember(member(), context, GUILD_ID, USER_ID);
    const guildChannel = new Channel(
      channel({
        permission_overwrites: [
          {
            id: GUILD_ID,
            type: OverwriteType.Role,
            allow: "0",
            deny: PermissionFlags.SendMessages.toString() as `${bigint}`,
          },
          {
            id: ROLE_ID,
            type: OverwriteType.Role,
            allow: PermissionFlags.SendMessages.toString() as `${bigint}`,
            deny: "0",
          },
          {
            id: USER_ID,
            type: OverwriteType.Member,
            allow: "0",
            deny: PermissionFlags.SendMessages.toString() as `${bigint}`,
          },
        ],
      }),
      context,
    );

    expect(can(guildChannel.permissionsFor(structure), PermissionFlags.SendMessages)).toBe(
      false,
    );
  });

  test("normalizes role permission edits and removes deleted roles", async () => {
    const { context, rest } = makeContext();
    const updated = role({
      permissions: PermissionFlags.BanMembers.toString() as `${bigint}`,
    });
    context.cache.guilds.set(GUILD_ID, guild({ owner_id: SECOND_USER_ID }));
    context.cache.roles.set(ROLE_ID, role());
    rest.queue(updated, undefined);
    const structure = new Role(role(), context, GUILD_ID);

    const next = await structure.edit({
      permissions: [PermissionFlags.BanMembers],
      unicodeEmoji: "🛠️",
    }, { reason: "Update moderator tools" });
    await next.delete();

    expect(rest.calls[0]?.body).toEqual({
      permissions: PermissionFlags.BanMembers.toString(),
      unicode_emoji: "🛠️",
    });
    expect(rest.calls[0]?.options).toEqual({ reason: "Update moderator tools" });
    expect(context.cache.roles.resolve(ROLE_ID)).toBeUndefined();
    expect(context.cache.guilds.resolve(GUILD_ID)?.roles.some((entry) => entry.id === ROLE_ID)).toBe(
      false,
    );
  });
});

describe("Interaction", () => {
  test("kinds come from the payload and narrow the type", () => {
    const { context } = makeContext();
    expect(createInteraction(commandInteraction(), context).kind).toBe("command");
    expect(
      createInteraction(
        componentInteraction({ custom_id: "x", component_type: ComponentType.Button }),
        context,
      ).kind,
    ).toBe("button");
    expect(
      createInteraction(
        componentInteraction({
          custom_id: "x",
          component_type: ComponentType.StringSelect,
          values: ["one"],
        }),
        context,
      ).kind,
    ).toBe("select");
    expect(
      createInteraction(modalInteraction({ custom_id: "x", components: [] }), context).kind,
    ).toBe("modal");
    expect(isInteraction(createInteraction(commandInteraction(), context))).toBe(true);
    expect(isInteraction({ kind: "command" })).toBe(false);
  });

  test("hydrates resolved option payloads into structures", () => {
    const { context } = makeContext();
    const target = user({ id: "222222222222222222", username: "target" });
    const structure = createInteraction(
      {
        ...INTERACTION_BASE,
        type: InteractionType.ApplicationCommand,
        guild_id: GUILD_ID,
        data: {
          id: "777777777777777777",
          name: "test",
          type: ApplicationCommandType.ChatInput,
          resolved: {
            users: { [target.id]: target },
            channels: {
              [CHANNEL_ID]: { id: CHANNEL_ID, type: ChannelType.GuildText, name: "general" },
            },
            roles: { [ROLE_ID]: role() },
          },
        },
      },
      context,
    );

    expect(structure.resolvedUser(target.id)?.username).toBe("target");
    expect(structure.resolvedChannel(CHANNEL_ID)?.name).toBe("general");
    expect(structure.resolvedRole(ROLE_ID)?.guildId).toBe(GUILD_ID);
    expect(structure.resolvedUser(GUILD_ID)).toBeUndefined();
  });

  test("claims the initial response before waiting for REST", async () => {
    const { context, rest } = makeContext();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    rest.queue(pending);
    const structure = createInteraction(commandInteraction(), context);

    const first = structure.respond("hello");
    expect(structure.state).toBe("replying");
    await expect(structure.defer()).rejects.toBeInstanceOf(
      InteractionAlreadyAcknowledgedError,
    );
    release?.();
    await first;

    expect(structure.state).toBe("replied");
    expect(rest.calls).toHaveLength(1);
    expect(rest.calls[0]?.body).toEqual({
      type: 4,
      data: { content: "hello" },
    });
    expect(rest.calls[0]?.options).toEqual({ auth: false, global: false });
  });

  test("blocks a second initial response when delivery is uncertain", async () => {
    const { context, rest } = makeContext();
    rest.queue(new Error("offline"));
    const structure = createInteraction(commandInteraction(), context);

    await expect(structure.respond("first")).rejects.toThrow("offline");
    expect(structure.state).toBe("uncertain");
    await expect(structure.defer()).rejects.toBeInstanceOf(
      InteractionAlreadyAcknowledgedError,
    );
    expect(rest.calls).toHaveLength(1);
  });

  test("allows a retry after Discord rejects the initial response", async () => {
    const { context, rest } = makeContext();
    rest.queue(
      new DiscordError(
        400,
        50_035,
        "Invalid form body",
        "POST",
        "free:POST:/interactions/{interactionId}/{interactionToken}/callback",
        {},
      ),
      undefined,
    );
    const structure = createInteraction(commandInteraction(), context);

    await expect(structure.respond("first")).rejects.toBeInstanceOf(DiscordError);
    expect(structure.state).toBe("pending");
    await structure.defer({ ephemeral: true });

    expect(structure.state).toBe("deferred");
    expect(rest.calls[1]?.body).toEqual({
      type: 5,
      data: { flags: 64 },
    });
    expect(rest.calls[1]?.options).toEqual({ auth: false, global: false });
  });

  test("edits the original response, sends followups, and caches raw messages", async () => {
    const { context, rest } = makeContext();
    const original = message({ content: "ready" });
    const followup = message({ id: "333333333333333333", content: "next" });
    rest.queue(undefined, original, original, followup, undefined);
    const structure = createInteraction(commandInteraction(), context);

    await expect(structure.original.edit("too early")).rejects.toBeInstanceOf(
      InteractionNotAcknowledgedError,
    );
    await structure.defer();
    const edited = await structure.original.edit("ready");
    const fetched = await structure.original.get();
    const sent = await structure.followup({ title: "Next" });
    await structure.original.delete();

    expect(edited.content).toBe("ready");
    expect(fetched.content).toBe("ready");
    expect(sent.content).toBe("next");
    expect(structure.state).toBe("replied");
    expect(rest.calls[1]?.path).toContain("/messages/@original");
    expect(rest.calls[1]?.options).toEqual({ auth: false, global: false });
    expect(rest.calls[3]?.body).toEqual({ embeds: [{ title: "Next" }] });
    expect(context.cache.messages.resolve(followup.id)).toEqual(followup);
  });

  test("passes uploads through REST options instead of JSON", async () => {
    const { context, rest } = makeContext();
    const upload = {
      data: new Uint8Array([1, 2, 3]),
      name: "result.bin",
      description: "Result",
    };
    rest.queue(undefined, message({ content: "uploaded" }));
    const structure = createInteraction(commandInteraction(), context);

    await structure.defer();
    await structure.followup({ content: "uploaded", files: [upload] });

    expect(rest.calls[1]?.body).toEqual({ content: "uploaded" });
    expect(rest.calls[1]?.options).toEqual({
      auth: false,
      global: false,
      files: [upload],
    });
  });

  test("updates component messages and defers to the update mode", async () => {
    const { context, rest } = makeContext();
    rest.queue(undefined, undefined);
    const button = createInteraction(
      componentInteraction(
        { custom_id: "approve", component_type: ComponentType.Button },
        { message: message() },
      ),
      context,
    );

    if (button.kind !== "button") throw new Error("expected a button interaction");
    expect(button.customId).toBe("approve");
    expect(button.message).toBeInstanceOf(Message);
    await button.update("Approved");
    expect(rest.calls[0]?.body).toEqual({ type: 7, data: { content: "Approved" } });

    const second = createInteraction(
      componentInteraction(
        { custom_id: "approve", component_type: ComponentType.Button },
        { message: message() },
      ),
      context,
    );
    if (second.kind !== "button") throw new Error("expected a button interaction");
    await second.defer();
    expect(rest.calls[1]?.body).toEqual({ type: 6 });
  });

  test("opens modals from commands and rejects invalid verbs at runtime", async () => {
    const { context, rest } = makeContext();
    rest.queue(undefined);
    const structure = createInteraction(commandInteraction(), context);
    if (structure.kind !== "command") throw new Error("expected a command interaction");

    await structure.modal({
      custom_id: "profile",
      title: "Edit profile",
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: "display-name",
              style: TextInputStyle.Short,
              label: "Display name",
              max_length: 80,
            },
          ],
        },
      ],
    });

    expect(rest.calls[0]?.body).toEqual({
      type: 9,
      data: {
        custom_id: "profile",
        title: "Edit profile",
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.TextInput,
                custom_id: "display-name",
                style: TextInputStyle.Short,
                label: "Display name",
                max_length: 80,
              },
            ],
          },
        ],
      },
    });

    const fresh = createInteraction(commandInteraction(), context) as unknown as {
      update(input: unknown): Promise<void>;
    };
    await expect(async () => fresh.update("nope")).toThrow(
      /cannot perform this response/,
    );
  });

  test("reads submitted modal values from legacy rows and label components", () => {
    const { context } = makeContext();
    const structure = createInteraction(
      modalInteraction({
        custom_id: "profile",
        components: [
          {
            type: ComponentType.ActionRow,
            id: 1,
            components: [
              {
                type: ComponentType.TextInput,
                id: 2,
                custom_id: "display-name",
                value: "Ada",
              },
            ],
          },
          {
            type: ComponentType.Label,
            id: 3,
            component: {
              type: ComponentType.Checkbox,
              id: 4,
              custom_id: "notifications",
              value: true,
            },
          },
        ],
      }),
      context,
    );

    if (structure.kind !== "modal") throw new Error("expected a modal interaction");
    expect(structure.customId).toBe("profile");
    expect(structure.textField("display-name")).toBe("Ada");
    expect(structure.field("notifications")).toBe(true);
    expect(structure.field("missing")).toBeUndefined();
  });
});
