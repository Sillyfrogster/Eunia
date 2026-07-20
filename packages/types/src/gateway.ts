import type { ApplicationCommandPermissions } from "./application";
import type {
  AutoModerationAction,
  AutoModerationRule,
  AutoModerationRuleTriggerType,
} from "./auto-moderation";
import type { Channel, ThreadMember, ChannelType } from "./channel";
import type { ISO8601Timestamp, Snowflake } from "./common";
import type { Emoji, PartialEmoji } from "./emoji";
import type { Entitlement } from "./entitlement";
import type { Guild, GuildMember, Role, UnavailableGuild } from "./guild";
import type { Interaction } from "./interaction";
import type { InviteCreateEvent, InviteDeleteEvent } from "./invite";
import type { Message, ReactionType } from "./message";
import type {
  GuildScheduledEvent,
  GuildScheduledEventUserEvent,
} from "./scheduled-event";
import type { Sticker } from "./sticker";
import type { Subscription } from "./subscription";
import type {
  AvatarDecorationData,
  Collectibles,
  PartialUser,
  User,
} from "./user";

export enum ActivityType {
  Playing = 0,
  Streaming = 1,
  Listening = 2,
  Watching = 3,
  Custom = 4,
  Competing = 5,
}

export enum ActivityStatusDisplayType {
  Name = 0,
  State = 1,
  Details = 2,
}

export type PresenceStatus = "idle" | "dnd" | "online" | "offline";

export interface ActivityEmoji {
  name: string;
  id?: Snowflake;
  animated?: boolean;
}

export interface Activity {
  name: string;
  type: ActivityType;
  url?: string | null;
  created_at: number;
  timestamps?: { start?: number; end?: number };
  application_id?: Snowflake;
  status_display_type?: ActivityStatusDisplayType | null;
  details?: string | null;
  details_url?: string | null;
  state?: string | null;
  state_url?: string | null;
  emoji?: ActivityEmoji | null;
  party?: { id?: string; size?: [currentSize: number, maxSize: number] };
  assets?: {
    large_image?: string;
    large_text?: string;
    large_url?: string;
    small_image?: string;
    small_text?: string;
    small_url?: string;
    invite_cover_image?: string;
  };
  secrets?: { join?: string; spectate?: string; match?: string };
  instance?: boolean;
  flags?: number;
  buttons?: string[];
}

export interface ReadyEvent {
  v: number;
  user: User;
  guilds: UnavailableGuild[];
  session_id: string;
  resume_gateway_url: string;
  shard?: [shardId: number, shardCount: number];
  application: {
    id: Snowflake;
    flags: number;
  };
}

export interface ResumedEvent {
  _trace?: string[];
}

export type GuildCreateEvent =
  | (Guild & {
      joined_at: ISO8601Timestamp;
      large: boolean;
      unavailable?: false;
      member_count: number;
      members: GuildMember[];
      channels: Channel[];
      threads: Channel[];
      guild_scheduled_events: GuildScheduledEvent[];
      presences: Array<Omit<PresenceUpdateEvent, "guild_id">>;
    })
  | UnavailableGuild;
export interface GuildUpdateEvent extends Guild {}
export interface GuildDeleteEvent {
  id: Snowflake;
  unavailable?: boolean;
}

export interface ChannelCreateEvent extends Channel {}
export interface ChannelUpdateEvent extends Channel {}
export interface ChannelDeleteEvent extends Channel {}

export interface ThreadCreateEvent extends Channel {
  newly_created?: boolean;
}

export interface ThreadDeleteEvent {
  id: Snowflake;
  guild_id: Snowflake;
  parent_id: Snowflake;
  type: ChannelType;
}

export interface ThreadListSyncEvent {
  guild_id: Snowflake;
  channel_ids?: Snowflake[];
  threads: Channel[];
  members: ThreadMember[];
}

export interface ThreadMemberUpdateEvent extends ThreadMember {
  guild_id: Snowflake;
}

export interface ThreadMembersUpdateEvent {
  id: Snowflake;
  guild_id: Snowflake;
  member_count: number;
  added_members?: Array<
    ThreadMember & {
      member: GuildMember;
      presence: PresenceUpdateEvent | null;
    }
  >;
  removed_member_ids?: Snowflake[];
}

export interface ChannelPinsUpdateEvent {
  guild_id?: Snowflake;
  channel_id: Snowflake;
  last_pin_timestamp?: ISO8601Timestamp | null;
}

export interface MessageCreateEvent extends Message {}
export type MessageUpdateEvent = Partial<Message> & Pick<Message, "id" | "channel_id">;

export interface MessageDeleteEvent {
  id: Snowflake;
  channel_id: Snowflake;
  guild_id?: Snowflake;
}

export interface MessageDeleteBulkEvent {
  ids: Snowflake[];
  channel_id: Snowflake;
  guild_id?: Snowflake;
}

export interface MessageReactionAddEvent {
  user_id: Snowflake;
  channel_id: Snowflake;
  message_id: Snowflake;
  guild_id?: Snowflake;
  member?: GuildMember;
  emoji: PartialEmoji;
  message_author_id?: Snowflake;
  burst: boolean;
  burst_colors?: string[];
  type: ReactionType;
}

export interface MessageReactionRemoveEvent {
  user_id: Snowflake;
  channel_id: Snowflake;
  message_id: Snowflake;
  guild_id?: Snowflake;
  emoji: PartialEmoji;
  burst: boolean;
  type: ReactionType;
}

export interface MessageReactionRemoveAllEvent {
  channel_id: Snowflake;
  message_id: Snowflake;
  guild_id?: Snowflake;
}

export interface MessageReactionRemoveEmojiEvent extends MessageReactionRemoveAllEvent {
  emoji: PartialEmoji;
}

export interface MessagePollVoteEvent {
  user_id: Snowflake;
  channel_id: Snowflake;
  message_id: Snowflake;
  guild_id?: Snowflake;
  answer_id: number;
}

export interface GuildMemberAddEvent extends GuildMember {
  guild_id: Snowflake;
  user: User;
}

export interface GuildMemberUpdateEvent {
  guild_id: Snowflake;
  roles: Snowflake[];
  user: User;
  nick?: string | null;
  avatar: string | null;
  banner: string | null;
  joined_at: ISO8601Timestamp | null;
  premium_since?: ISO8601Timestamp | null;
  deaf?: boolean;
  mute?: boolean;
  pending?: boolean;
  communication_disabled_until?: ISO8601Timestamp | null;
  avatar_decoration_data?: AvatarDecorationData | null;
  collectibles?: Collectibles | null;
}

export interface GuildMemberRemoveEvent {
  guild_id: Snowflake;
  user: User;
}

export interface GuildMembersChunkEvent {
  guild_id: Snowflake;
  members: GuildMember[];
  chunk_index: number;
  chunk_count: number;
  not_found?: Snowflake[];
  presences?: PresenceUpdateEvent[];
  nonce?: string;
}

export interface GuildRoleEvent {
  guild_id: Snowflake;
  role: Role;
}

export interface GuildRoleDeleteEvent {
  guild_id: Snowflake;
  role_id: Snowflake;
}

export interface GuildBanEvent {
  guild_id: Snowflake;
  user: User;
}

export interface GuildEmojisUpdateEvent {
  guild_id: Snowflake;
  emojis: Emoji[];
}

export interface GuildStickersUpdateEvent {
  guild_id: Snowflake;
  stickers: Sticker[];
}

export interface GuildIntegrationsUpdateEvent {
  guild_id: Snowflake;
}

export interface PresenceUpdateEvent {
  user: PartialUser;
  guild_id: Snowflake;
  status: PresenceStatus;
  activities: Activity[];
  client_status: {
    desktop?: Exclude<PresenceStatus, "offline">;
    mobile?: Exclude<PresenceStatus, "offline">;
    web?: Exclude<PresenceStatus, "offline">;
  };
}

export interface TypingStartEvent {
  channel_id: Snowflake;
  guild_id?: Snowflake;
  user_id: Snowflake;
  timestamp: number;
  member?: GuildMember;
}

export interface WebhooksUpdateEvent {
  guild_id: Snowflake;
  channel_id: Snowflake;
}

export interface AutoModerationActionExecutionEvent {
  guild_id: Snowflake;
  action: AutoModerationAction;
  rule_id: Snowflake;
  rule_trigger_type: AutoModerationRuleTriggerType;
  user_id: Snowflake;
  channel_id?: Snowflake;
  message_id?: Snowflake;
  alert_system_message_id?: Snowflake;
  content: string;
  matched_keyword?: string;
  matched_content: string | null;
}

export interface GatewayRequestGuildMembersRateLimitMetadata {
  guild_id: Snowflake;
  nonce?: string;
}

export interface GatewayRateLimitedEvent {
  opcode: number;
  retry_after: number;
  meta: GatewayRequestGuildMembersRateLimitMetadata;
}

export type InteractionCreateEvent = Interaction;

export interface GatewayDispatchMap {
  READY: ReadyEvent;
  RESUMED: ResumedEvent;
  APPLICATION_COMMAND_PERMISSIONS_UPDATE: ApplicationCommandPermissions;
  AUTO_MODERATION_RULE_CREATE: AutoModerationRule;
  AUTO_MODERATION_RULE_UPDATE: AutoModerationRule;
  AUTO_MODERATION_RULE_DELETE: AutoModerationRule;
  AUTO_MODERATION_ACTION_EXECUTION: AutoModerationActionExecutionEvent;
  CHANNEL_CREATE: ChannelCreateEvent;
  CHANNEL_UPDATE: ChannelUpdateEvent;
  CHANNEL_DELETE: ChannelDeleteEvent;
  CHANNEL_PINS_UPDATE: ChannelPinsUpdateEvent;
  ENTITLEMENT_CREATE: Entitlement;
  ENTITLEMENT_UPDATE: Entitlement;
  ENTITLEMENT_DELETE: Entitlement;
  GUILD_CREATE: GuildCreateEvent;
  GUILD_UPDATE: GuildUpdateEvent;
  GUILD_DELETE: GuildDeleteEvent;
  GUILD_BAN_ADD: GuildBanEvent;
  GUILD_BAN_REMOVE: GuildBanEvent;
  GUILD_EMOJIS_UPDATE: GuildEmojisUpdateEvent;
  GUILD_STICKERS_UPDATE: GuildStickersUpdateEvent;
  GUILD_INTEGRATIONS_UPDATE: GuildIntegrationsUpdateEvent;
  GUILD_MEMBER_ADD: GuildMemberAddEvent;
  GUILD_MEMBER_UPDATE: GuildMemberUpdateEvent;
  GUILD_MEMBER_REMOVE: GuildMemberRemoveEvent;
  GUILD_MEMBERS_CHUNK: GuildMembersChunkEvent;
  GUILD_ROLE_CREATE: GuildRoleEvent;
  GUILD_ROLE_UPDATE: GuildRoleEvent;
  GUILD_ROLE_DELETE: GuildRoleDeleteEvent;
  GUILD_SCHEDULED_EVENT_CREATE: GuildScheduledEvent;
  GUILD_SCHEDULED_EVENT_UPDATE: GuildScheduledEvent;
  GUILD_SCHEDULED_EVENT_DELETE: GuildScheduledEvent;
  GUILD_SCHEDULED_EVENT_USER_ADD: GuildScheduledEventUserEvent;
  GUILD_SCHEDULED_EVENT_USER_REMOVE: GuildScheduledEventUserEvent;
  INVITE_CREATE: InviteCreateEvent;
  INVITE_DELETE: InviteDeleteEvent;
  THREAD_CREATE: ThreadCreateEvent;
  THREAD_UPDATE: ChannelUpdateEvent;
  THREAD_DELETE: ThreadDeleteEvent;
  THREAD_LIST_SYNC: ThreadListSyncEvent;
  THREAD_MEMBER_UPDATE: ThreadMemberUpdateEvent;
  THREAD_MEMBERS_UPDATE: ThreadMembersUpdateEvent;
  MESSAGE_CREATE: MessageCreateEvent;
  MESSAGE_UPDATE: MessageUpdateEvent;
  MESSAGE_DELETE: MessageDeleteEvent;
  MESSAGE_DELETE_BULK: MessageDeleteBulkEvent;
  MESSAGE_REACTION_ADD: MessageReactionAddEvent;
  MESSAGE_REACTION_REMOVE: MessageReactionRemoveEvent;
  MESSAGE_REACTION_REMOVE_ALL: MessageReactionRemoveAllEvent;
  MESSAGE_REACTION_REMOVE_EMOJI: MessageReactionRemoveEmojiEvent;
  MESSAGE_POLL_VOTE_ADD: MessagePollVoteEvent;
  MESSAGE_POLL_VOTE_REMOVE: MessagePollVoteEvent;
  PRESENCE_UPDATE: PresenceUpdateEvent;
  TYPING_START: TypingStartEvent;
  USER_UPDATE: User;
  WEBHOOKS_UPDATE: WebhooksUpdateEvent;
  INTERACTION_CREATE: InteractionCreateEvent;
  SUBSCRIPTION_CREATE: Subscription;
  SUBSCRIPTION_UPDATE: Subscription;
  SUBSCRIPTION_DELETE: Subscription;
}

export type GatewayDispatchName = keyof GatewayDispatchMap;
