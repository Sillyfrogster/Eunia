/**
 * Protocol constants for Discord's gateway (API v10). Every value here is
 * defined by Discord, not by Eunia.
 */

/** The gateway version to speak. Sent as `?v=10` in the connection URL. */
export const GATEWAY_VERSION = 10;

/**
 * Opcodes. The `op` field of every gateway frame.
 * "receive" = Discord to client, "send" = client to Discord.
 */
export enum GatewayOpcode {
  /** receive · An event (READY, MESSAGE_CREATE, …). */
  Dispatch = 0,
  /** send + receive · Keep-alive ping. */
  Heartbeat = 1,
  /** send · Log in and start a new session. */
  Identify = 2,
  /** send · Update the bot's status/activity. */
  PresenceUpdate = 3,
  /** send · Join, leave, or move voice channels. */
  VoiceStateUpdate = 4,
  /** send · Reattach to an existing session. */
  Resume = 6,
  /** receive · Discord asking the client to disconnect and resume. Routine. */
  Reconnect = 7,
  /** send · Request a guild's member list in chunks. */
  RequestGuildMembers = 8,
  /** receive · The session died. `d: true` = may resume, `d: false` = must re-identify. */
  InvalidSession = 9,
  /** receive · First frame after connecting; provides the heartbeat interval. */
  Hello = 10,
  /** receive · Acknowledges a heartbeat. */
  HeartbeatAck = 11,
}

/**
 * Intents. Which event groups the bot receives, combined into a bitfield
 * in IDENTIFY.
 *
 * Privileged intents (marked ⚠) must also be enabled in the developer
 * portal, or the gateway closes the connection with code 4014 on identify.
 * Note that message *events* and message *content* are separate intents.
 */
export const Intents = {
  Guilds: 1 << 0,
  /** ⚠ privileged */
  GuildMembers: 1 << 1,
  GuildModeration: 1 << 2,
  GuildExpressions: 1 << 3,
  GuildIntegrations: 1 << 4,
  GuildWebhooks: 1 << 5,
  GuildInvites: 1 << 6,
  GuildVoiceStates: 1 << 7,
  /** ⚠ privileged */
  GuildPresences: 1 << 8,
  GuildMessages: 1 << 9,
  GuildMessageReactions: 1 << 10,
  GuildMessageTyping: 1 << 11,
  DirectMessages: 1 << 12,
  DirectMessageReactions: 1 << 13,
  DirectMessageTyping: 1 << 14,
  /** ⚠ privileged */
  MessageContent: 1 << 15,
  GuildScheduledEvents: 1 << 16,
  AutoModerationConfiguration: 1 << 20,
  AutoModerationExecution: 1 << 21,
  GuildMessagePolls: 1 << 24,
  DirectMessagePolls: 1 << 25,
} as const;

/**
 * Close codes Discord uses when it closes the WebSocket. Standard codes
 * (1000 normal, 1006 abnormal) also appear.
 */
export enum GatewayCloseCode {
  UnknownError = 4000,
  UnknownOpcode = 4001,
  DecodeError = 4002,
  NotAuthenticated = 4003,
  AuthenticationFailed = 4004,
  AlreadyAuthenticated = 4005,
  InvalidSequence = 4007,
  RateLimited = 4008,
  SessionTimedOut = 4009,
  InvalidShard = 4010,
  ShardingRequired = 4011,
  InvalidApiVersion = 4012,
  InvalidIntents = 4013,
  DisallowedIntents = 4014,
}

/**
 * Close codes where reconnecting can never help. The problem is the bot's
 * configuration (bad token, disallowed intents, wrong shard setup). The
 * shard refuses to retry these so a config mistake can't burn through the
 * daily identify budget.
 */
export const FATAL_CLOSE_CODES: ReadonlySet<number> = new Set([
  GatewayCloseCode.AuthenticationFailed,
  GatewayCloseCode.InvalidShard,
  GatewayCloseCode.ShardingRequired,
  GatewayCloseCode.InvalidApiVersion,
  GatewayCloseCode.InvalidIntents,
  GatewayCloseCode.DisallowedIntents,
]);

/**
 * Close codes after which the session is gone but a fresh identify is fine.
 */
export const SESSION_DEAD_CLOSE_CODES: ReadonlySet<number> = new Set([
  GatewayCloseCode.InvalidSequence, // 4007
  GatewayCloseCode.SessionTimedOut, // 4009
]);

/** Outbound limit: at most 120 payloads per 60-second window (close code 4008). */
export const GATEWAY_SEND_LIMIT = 120;
export const GATEWAY_SEND_WINDOW_MS = 60_000;

/** IDENTIFY is further limited to one per 5 seconds. */
export const IDENTIFY_COOLDOWN_MS = 5_000;
