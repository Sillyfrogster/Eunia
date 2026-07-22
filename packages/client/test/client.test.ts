import { describe, expect, test } from "bun:test";
import { Intents } from "@eunia/gateway";
import { GatewayOpcode } from "@eunia/gateway";
import { SilentLogger } from "@eunia/shared";
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ChannelType,
  EntitlementType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  PermissionFlags,
  PollLayoutType,
  ReactionType,
  StickerFormatType,
  StickerType,
  SubscriptionStatus,
} from "@eunia/types";
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

function autoModerationRule(): types.AutoModerationRule {
  return {
    id: "333333333333333333",
    guild_id: GUILD_ID,
    name: "Block spam",
    creator_id: USER_ID,
    event_type: AutoModerationRuleEventType.MessageSend,
    trigger_type: AutoModerationRuleTriggerType.Spam,
    trigger_metadata: {},
    actions: [{ type: AutoModerationActionType.BlockMessage }],
    enabled: true,
    exempt_roles: [],
    exempt_channels: [],
  };
}

function entitlement(): types.Entitlement {
  return {
    id: "444444444444444444",
    sku_id: "555555555555555555",
    application_id: "666666666666666666",
    user_id: USER_ID,
    type: EntitlementType.ApplicationSubscription,
    deleted: false,
  };
}

function subscription(): types.Subscription {
  return {
    id: "777777777777777777",
    user_id: USER_ID,
    sku_ids: ["555555555555555555"],
    entitlement_ids: ["444444444444444444"],
    renewal_sku_ids: null,
    current_period_start: "2026-07-01T00:00:00.000Z",
    current_period_end: "2026-08-01T00:00:00.000Z",
    status: SubscriptionStatus.Active,
    canceled_at: null,
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
    expect(client.cache.guilds.resolve(GUILD_ID)?.channels).toEqual([]);
    expect(client.cache.guilds.resolve(GUILD_ID)?.roles).toEqual([]);
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

  test("emits typed Auto Moderation events", () => {
    const { client } = makeClient();
    const received: string[] = [];
    client.on("autoModerationRuleCreate", (rule) => received.push(`create:${rule.id}`));
    client.on("autoModerationRuleUpdate", (rule) => received.push(`update:${rule.id}`));
    client.on("autoModerationRuleDelete", (rule) => received.push(`delete:${rule.id}`));
    client.on("autoModerationActionExecution", (event) => {
      received.push(`execute:${event.rule_id}`);
    });

    const rule = autoModerationRule();
    routeDispatch(client, client.context, "AUTO_MODERATION_RULE_CREATE", rule);
    routeDispatch(client, client.context, "AUTO_MODERATION_RULE_UPDATE", rule);
    routeDispatch(client, client.context, "AUTO_MODERATION_RULE_DELETE", rule);
    routeDispatch(client, client.context, "AUTO_MODERATION_ACTION_EXECUTION", {
      guild_id: GUILD_ID,
      action: { type: AutoModerationActionType.BlockMessage },
      rule_id: rule.id,
      rule_trigger_type: rule.trigger_type,
      user_id: USER_ID,
      content: "spam",
      matched_content: "spam",
    } satisfies types.AutoModerationActionExecutionEvent);

    expect(received).toEqual([
      `create:${rule.id}`,
      `update:${rule.id}`,
      `delete:${rule.id}`,
      `execute:${rule.id}`,
    ]);
  });

  test("emits typed entitlement and subscription events", () => {
    const { client } = makeClient();
    const received: string[] = [];
    client.on("entitlementCreate", (value) => {
      received.push(`entitlement-create:${value.id}`);
    });
    client.on("entitlementUpdate", (value) => {
      received.push(`entitlement-update:${value.id}`);
    });
    client.on("entitlementDelete", (value) => {
      received.push(`entitlement-delete:${value.id}`);
    });
    client.on("subscriptionCreate", (value) => {
      received.push(`subscription-create:${value.id}`);
    });
    client.on("subscriptionUpdate", (value) => {
      received.push(`subscription-update:${value.id}`);
    });
    client.on("subscriptionDelete", (value) => {
      received.push(`subscription-delete:${value.id}`);
    });

    const entitlementData = entitlement();
    const subscriptionData = subscription();
    routeDispatch(client, client.context, "ENTITLEMENT_CREATE", entitlementData);
    routeDispatch(client, client.context, "ENTITLEMENT_UPDATE", entitlementData);
    routeDispatch(client, client.context, "ENTITLEMENT_DELETE", entitlementData);
    routeDispatch(client, client.context, "SUBSCRIPTION_CREATE", subscriptionData);
    routeDispatch(client, client.context, "SUBSCRIPTION_UPDATE", subscriptionData);
    routeDispatch(client, client.context, "SUBSCRIPTION_DELETE", subscriptionData);

    expect(received).toEqual([
      `entitlement-create:${entitlementData.id}`,
      `entitlement-update:${entitlementData.id}`,
      `entitlement-delete:${entitlementData.id}`,
      `subscription-create:${subscriptionData.id}`,
      `subscription-update:${subscriptionData.id}`,
      `subscription-delete:${subscriptionData.id}`,
    ]);
  });

  test("emits guild ban and expression events after updating the cache", () => {
    const { client } = makeClient();
    routeDispatch(client, client.context, "GUILD_CREATE", guild());

    const received: string[] = [];
    client.on("guildBanAdd", (info) => {
      received.push(`ban-add:${info.guildId}:${info.user.id}`);
    });
    client.on("guildBanRemove", (info) => {
      received.push(`ban-remove:${info.guildId}:${info.user.id}`);
    });
    client.on("guildEmojisUpdate", (event) => {
      received.push(`emojis:${event.emojis.length}`);
    });
    client.on("guildStickersUpdate", (event) => {
      received.push(`stickers:${event.stickers.length}`);
    });

    const ban = { guild_id: GUILD_ID, user: user() } satisfies types.GuildBanEvent;
    const emojis = [{ id: "888888888888888888", name: "wave" }];
    const stickers: types.Sticker[] = [{
      id: "999999999999999999",
      name: "hello",
      description: null,
      tags: "wave",
      type: StickerType.Guild,
      format_type: StickerFormatType.PNG,
      guild_id: GUILD_ID,
    }];
    routeDispatch(client, client.context, "GUILD_BAN_ADD", ban);
    routeDispatch(client, client.context, "GUILD_BAN_REMOVE", ban);
    routeDispatch(client, client.context, "GUILD_EMOJIS_UPDATE", {
      guild_id: GUILD_ID,
      emojis,
    } satisfies types.GuildEmojisUpdateEvent);
    routeDispatch(client, client.context, "GUILD_STICKERS_UPDATE", {
      guild_id: GUILD_ID,
      stickers,
    } satisfies types.GuildStickersUpdateEvent);

    expect(received).toEqual([
      `ban-add:${GUILD_ID}:${USER_ID}`,
      `ban-remove:${GUILD_ID}:${USER_ID}`,
      "emojis:1",
      "stickers:1",
    ]);
    expect(client.cache.users.resolve(USER_ID)).toEqual(ban.user);
    expect(client.cache.guilds.resolve(GUILD_ID)?.emojis).toEqual(emojis);
    expect(client.cache.guilds.resolve(GUILD_ID)?.stickers).toEqual(stickers);
  });

  test("emits integration, scheduled event, and invite events", () => {
    const { client } = makeClient();
    const received: string[] = [];
    client.on("guildIntegrationsUpdate", (event) => {
      received.push(`integrations:${event.guild_id}`);
    });
    client.on("integrationCreate", (event) => received.push(`integration-create:${event.id}`));
    client.on("integrationUpdate", (event) => received.push(`integration-update:${event.id}`));
    client.on("integrationDelete", (event) => received.push(`integration-delete:${event.id}`));
    client.on("guildScheduledEventCreate", (event) => received.push(`event-create:${event.id}`));
    client.on("guildScheduledEventUpdate", (event) => received.push(`event-update:${event.id}`));
    client.on("guildScheduledEventDelete", (event) => received.push(`event-delete:${event.id}`));
    client.on("guildScheduledEventUserAdd", (event) => received.push(`event-user-add:${event.user_id}`));
    client.on("guildScheduledEventUserRemove", (event) => {
      received.push(`event-user-remove:${event.user_id}`);
    });
    client.on("inviteCreate", (event) => received.push(`invite-create:${event.code}`));
    client.on("inviteDelete", (event) => received.push(`invite-delete:${event.code}`));

    const integration = {
      id: "333333333333333333",
      guild_id: GUILD_ID,
      name: "Twitch",
      type: "twitch",
      enabled: true,
      account: { id: USER_ID, name: "streamer" },
    } satisfies types.IntegrationCreateEvent;
    const integrationDelete = {
      id: integration.id,
      guild_id: GUILD_ID,
    } satisfies types.IntegrationDeleteEvent;
    const scheduledEvent = {
      id: "444444444444444444",
      guild_id: GUILD_ID,
      name: "Town hall",
      scheduled_start_time: "2026-08-01T00:00:00.000Z",
      privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
      status: GuildScheduledEventStatus.Scheduled,
      entity_id: null,
      recurrence_rule: null,
      entity_type: GuildScheduledEventEntityType.Voice,
      channel_id: CHANNEL_ID,
      entity_metadata: null,
      scheduled_end_time: null,
    } satisfies types.GuildScheduledEvent;
    const scheduledEventUser = {
      guild_scheduled_event_id: scheduledEvent.id,
      user_id: USER_ID,
      guild_id: GUILD_ID,
    } satisfies types.GuildScheduledEventUserEvent;
    const inviteCreate = {
      channel_id: CHANNEL_ID,
      guild_id: GUILD_ID,
      code: "eunia",
      uses: 0,
      max_uses: 10,
      max_age: 3600,
      temporary: false,
      created_at: "2026-07-22T00:00:00.000Z",
    } satisfies types.InviteCreateEvent;

    routeDispatch(client, client.context, "GUILD_INTEGRATIONS_UPDATE", {
      guild_id: GUILD_ID,
    });
    routeDispatch(client, client.context, "INTEGRATION_CREATE", integration);
    routeDispatch(client, client.context, "INTEGRATION_UPDATE", integration);
    routeDispatch(client, client.context, "INTEGRATION_DELETE", integrationDelete);
    routeDispatch(client, client.context, "GUILD_SCHEDULED_EVENT_CREATE", scheduledEvent);
    routeDispatch(client, client.context, "GUILD_SCHEDULED_EVENT_UPDATE", scheduledEvent);
    routeDispatch(client, client.context, "GUILD_SCHEDULED_EVENT_DELETE", scheduledEvent);
    routeDispatch(client, client.context, "GUILD_SCHEDULED_EVENT_USER_ADD", scheduledEventUser);
    routeDispatch(client, client.context, "GUILD_SCHEDULED_EVENT_USER_REMOVE", scheduledEventUser);
    routeDispatch(client, client.context, "INVITE_CREATE", inviteCreate);
    routeDispatch(client, client.context, "INVITE_DELETE", {
      channel_id: CHANNEL_ID,
      guild_id: GUILD_ID,
      code: inviteCreate.code,
    } satisfies types.InviteDeleteEvent);

    expect(received).toEqual([
      `integrations:${GUILD_ID}`,
      `integration-create:${integration.id}`,
      `integration-update:${integration.id}`,
      `integration-delete:${integration.id}`,
      `event-create:${scheduledEvent.id}`,
      `event-update:${scheduledEvent.id}`,
      `event-delete:${scheduledEvent.id}`,
      `event-user-add:${USER_ID}`,
      `event-user-remove:${USER_ID}`,
      `invite-create:${inviteCreate.code}`,
      `invite-delete:${inviteCreate.code}`,
    ]);
  });

  test("updates cached reactions and poll votes before emitting events", () => {
    const { client } = makeClient();
    routeDispatch(client, client.context, "READY", {
      v: 10,
      user: user({ bot: true }),
      session_id: "session",
      resume_gateway_url: "wss://gateway.test",
      guilds: [],
      application: { id: "888888888888888888", flags: 0 },
    } satisfies types.ReadyEvent);
    routeDispatch(client, client.context, "MESSAGE_CREATE", message({
      poll: {
        question: { text: "Ship it?" },
        answers: [{ answer_id: 1, poll_media: { text: "Yes" } }],
        expiry: null,
        allow_multiselect: false,
        layout_type: PollLayoutType.Default,
        results: {
          is_finalized: false,
          answer_counts: [{ id: 1, count: 0, me_voted: false }],
        },
      },
    }));

    const received: string[] = [];
    client.on("messageReactionAdd", () => received.push("reaction-add"));
    client.on("messageReactionRemove", () => received.push("reaction-remove"));
    client.on("messageReactionRemoveEmoji", () => received.push("reaction-remove-emoji"));
    client.on("messageReactionRemoveAll", () => received.push("reaction-remove-all"));
    client.on("messagePollVoteAdd", () => received.push("poll-add"));
    client.on("messagePollVoteRemove", () => received.push("poll-remove"));

    const reactionAdd = {
      user_id: USER_ID,
      channel_id: CHANNEL_ID,
      message_id: MESSAGE_ID,
      guild_id: GUILD_ID,
      emoji: { id: null, name: "✅" },
      burst: false,
      type: ReactionType.Normal,
    } satisfies types.MessageReactionAddEvent;
    const reactionRemove = {
      user_id: USER_ID,
      channel_id: CHANNEL_ID,
      message_id: MESSAGE_ID,
      guild_id: GUILD_ID,
      emoji: reactionAdd.emoji,
      burst: false,
      type: ReactionType.Normal,
    } satisfies types.MessageReactionRemoveEvent;
    const vote = {
      user_id: USER_ID,
      channel_id: CHANNEL_ID,
      message_id: MESSAGE_ID,
      guild_id: GUILD_ID,
      answer_id: 1,
    } satisfies types.MessagePollVoteEvent;

    routeDispatch(client, client.context, "MESSAGE_REACTION_ADD", reactionAdd);
    expect(client.cache.messages.resolve(MESSAGE_ID)?.reactions?.[0]).toMatchObject({
      count: 1,
      me: true,
    });
    routeDispatch(client, client.context, "MESSAGE_REACTION_REMOVE", reactionRemove);
    routeDispatch(client, client.context, "MESSAGE_REACTION_ADD", reactionAdd);
    routeDispatch(client, client.context, "MESSAGE_REACTION_REMOVE_EMOJI", {
      channel_id: CHANNEL_ID,
      message_id: MESSAGE_ID,
      guild_id: GUILD_ID,
      emoji: reactionAdd.emoji,
    } satisfies types.MessageReactionRemoveEmojiEvent);
    routeDispatch(client, client.context, "MESSAGE_REACTION_ADD", reactionAdd);
    routeDispatch(client, client.context, "MESSAGE_REACTION_REMOVE_ALL", {
      channel_id: CHANNEL_ID,
      message_id: MESSAGE_ID,
      guild_id: GUILD_ID,
    } satisfies types.MessageReactionRemoveAllEvent);
    routeDispatch(client, client.context, "MESSAGE_POLL_VOTE_ADD", vote);
    expect(
      client.cache.messages.resolve(MESSAGE_ID)?.poll?.results?.answer_counts[0],
    ).toEqual({ id: 1, count: 1, me_voted: true });
    routeDispatch(client, client.context, "MESSAGE_POLL_VOTE_REMOVE", vote);

    expect(client.cache.messages.resolve(MESSAGE_ID)?.reactions).toEqual([]);
    expect(
      client.cache.messages.resolve(MESSAGE_ID)?.poll?.results?.answer_counts[0],
    ).toEqual({ id: 1, count: 0, me_voted: false });
    expect(received).toEqual([
      "reaction-add",
      "reaction-remove",
      "reaction-add",
      "reaction-remove-emoji",
      "reaction-add",
      "reaction-remove-all",
      "poll-add",
      "poll-remove",
    ]);
  });

  test("hydrates thread events and keeps cached thread state current", () => {
    const { client } = makeClient();
    const received: string[] = [];
    client.on("threadCreate", (thread) => received.push(`create:${thread.name}`));
    client.on("threadUpdate", (thread, previous) => {
      received.push(`update:${previous?.name}:${thread.name}`);
    });
    client.on("threadListSync", (event) => received.push(`sync:${event.threads.length}`));
    client.on("threadMemberUpdate", (event) => received.push(`member:${event.user_id}`));
    client.on("threadMembersUpdate", (event) => received.push(`members:${event.member_count}`));
    client.on("channelPinsUpdate", (event) => received.push(`pins:${event.channel_id}`));
    client.on("threadDelete", (info) => received.push(`delete:${info.thread?.name}`));

    const thread = {
      id: "333333333333333333",
      guild_id: GUILD_ID,
      parent_id: CHANNEL_ID,
      type: ChannelType.PublicThread,
      name: "Planning",
    } satisfies types.ThreadCreateEvent;
    const threadMember = {
      id: thread.id,
      user_id: USER_ID,
      guild_id: GUILD_ID,
      join_timestamp: "2026-07-22T00:00:00.000Z",
      flags: 0,
    } satisfies types.ThreadMemberUpdateEvent;

    routeDispatch(client, client.context, "THREAD_CREATE", thread);
    routeDispatch(client, client.context, "THREAD_UPDATE", {
      ...thread,
      name: "Release planning",
    });
    routeDispatch(client, client.context, "THREAD_LIST_SYNC", {
      guild_id: GUILD_ID,
      threads: [{ ...thread, name: "Release planning" }],
      members: [threadMember],
    } satisfies types.ThreadListSyncEvent);
    routeDispatch(client, client.context, "THREAD_MEMBER_UPDATE", threadMember);
    routeDispatch(client, client.context, "THREAD_MEMBERS_UPDATE", {
      id: thread.id,
      guild_id: GUILD_ID,
      member_count: 4,
    } satisfies types.ThreadMembersUpdateEvent);
    routeDispatch(client, client.context, "CHANNEL_PINS_UPDATE", {
      guild_id: GUILD_ID,
      channel_id: thread.id,
      last_pin_timestamp: "2026-07-22T12:00:00.000Z",
    } satisfies types.ChannelPinsUpdateEvent);
    routeDispatch(client, client.context, "THREAD_DELETE", {
      id: thread.id,
      guild_id: GUILD_ID,
      parent_id: CHANNEL_ID,
      type: ChannelType.PublicThread,
    } satisfies types.ThreadDeleteEvent);

    expect(received).toEqual([
      "create:Planning",
      "update:Planning:Release planning",
      "sync:1",
      `member:${USER_ID}`,
      "members:4",
      `pins:${thread.id}`,
      "delete:Release planning",
    ]);
    expect(client.cache.channels.resolve(thread.id)).toBeUndefined();
  });

  test("emits presence, typing, and webhook events after cache updates", () => {
    const { client } = makeClient();
    client.cache.users.set(USER_ID, user());
    const received: string[] = [];
    client.on("presenceUpdate", (event) => {
      received.push(`presence:${event.status}:${event.user.id}`);
    });
    client.on("typingStart", (event) => received.push(`typing:${event.user_id}`));
    client.on("webhooksUpdate", (event) => received.push(`webhooks:${event.channel_id}`));

    routeDispatch(client, client.context, "PRESENCE_UPDATE", {
      user: { id: USER_ID, username: "renamed" },
      guild_id: GUILD_ID,
      status: "online",
      activities: [],
      client_status: { web: "online" },
    } satisfies types.PresenceUpdateEvent);
    expect(client.cache.users.resolve(USER_ID)?.username).toBe("renamed");
    routeDispatch(client, client.context, "TYPING_START", {
      channel_id: CHANNEL_ID,
      guild_id: GUILD_ID,
      user_id: USER_ID,
      timestamp: 1_774_185_600,
      member: member(),
    } satisfies types.TypingStartEvent);
    routeDispatch(client, client.context, "WEBHOOKS_UPDATE", {
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
    } satisfies types.WebhooksUpdateEvent);

    expect(client.cache.users.resolve(USER_ID)?.username).toBe("eunia-user");
    expect(client.members.peek(GUILD_ID, USER_ID)).toBeDefined();
    expect(received).toEqual([
      `presence:online:${USER_ID}`,
      `typing:${USER_ID}`,
      `webhooks:${CHANNEL_ID}`,
    ]);
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

  test("lists current channel pins and hydrates their messages", async () => {
    const pinned = message({ pinned: true });
    const { client, calls } = makeClient([
      () => json({
        items: [{ pinned_at: "2026-07-20T12:00:00.000Z", message: pinned }],
        has_more: true,
      }),
    ]);

    const page = await client.pins.list(CHANNEL_ID, {
      before: new Date("2026-07-21T12:00:00.000Z"),
      limit: 25,
    });

    expect(page.hasMore).toBe(true);
    expect(page.items[0]?.message).toBeInstanceOf(Message);
    expect(page.items[0]?.pinnedAt).toEqual(new Date("2026-07-20T12:00:00.000Z"));
    expect(client.cache.messages.resolve(MESSAGE_ID)).toEqual(pinned);
    expect(calls[0]?.url).toContain(`/channels/${CHANNEL_ID}/messages/pins`);
    expect(calls[0]?.url).toContain("limit=25");
    expect(calls[0]?.url).toContain("before=2026-07-21T12%3A00%3A00.000Z");
  });

  test("pins and unpins with audit log reasons", async () => {
    const { client, calls } = makeClient([
      () => new Response(null, { status: 204 }),
      () => new Response(null, { status: 204 }),
    ]);
    client.cache.messages.set(MESSAGE_ID, message());

    await client.pins.add(CHANNEL_ID, MESSAGE_ID, { reason: "Keep this handy" });
    expect(client.cache.messages.resolve(MESSAGE_ID)?.pinned).toBe(true);
    await client.pins.remove(CHANNEL_ID, MESSAGE_ID, { reason: "No longer needed" });

    expect(calls[0]?.url).toContain(
      `/channels/${CHANNEL_ID}/messages/pins/${MESSAGE_ID}`,
    );
    expect(new Headers(calls[0]?.init.headers).get("X-Audit-Log-Reason")).toBe(
      "Keep%20this%20handy",
    );
    expect(calls[1]?.init.method).toBe("DELETE");
    expect(client.cache.messages.resolve(MESSAGE_ID)?.pinned).toBe(false);
  });

  test("rejects pin page limits outside Discord's range", async () => {
    const { client, calls } = makeClient();

    await expect(client.pins.list(CHANNEL_ID, { limit: 51 })).rejects.toThrow(
      /between 1 and 50/,
    );
    expect(calls).toHaveLength(0);
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
