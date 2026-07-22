import { Intents } from "@eunia/gateway";
import { PermissionFlags } from "@eunia/types";
import type * as types from "@eunia/types";
import { Client } from "../src/client";

export const GUILD_ID = "987654321098765432";
export const CHANNEL_ID = "123456789012345678";
export const USER_ID = "222222222222222222";
export const MESSAGE_ID = "111111111111111111";

export function json(body: unknown): Response {
  return Response.json(body);
}

export function makeClient(script: Array<() => Response> = []) {
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

export function user(overrides: Partial<types.User> = {}): types.User {
  return {
    id: USER_ID,
    username: "eunia-user",
    discriminator: "0",
    global_name: "Eunia User",
    avatar: null,
    ...overrides,
  };
}

export function role(overrides: Partial<types.Role> = {}): types.Role {
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

export function member(overrides: Partial<types.GuildMember> = {}): types.GuildMember {
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

export function guild(overrides: Partial<types.Guild> = {}): types.Guild {
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

export function message(overrides: Partial<types.Message> = {}): types.Message {
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
