import type {
  AutocompleteContext,
  CommandContext,
  CommandError,
  CommandHandleResult,
} from "@eunia/commands";
import type { CloseInfo, ReconnectInfo } from "@eunia/gateway";
import type {
  Channel,
  Guild,
  GuildMember,
  Interaction,
  Message,
  Role,
  User,
} from "@eunia/structures";
import type * as types from "@eunia/types";

export type ClientState =
  | "idle"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

export interface GuildDeleteInfo {
  readonly id: string;
  readonly unavailable: boolean;
  readonly guild?: Guild;
}

export interface GuildMemberRemoveInfo {
  readonly guildId: string;
  readonly userId: string;
  readonly member?: GuildMember;
}

export interface GuildBanInfo {
  readonly guildId: string;
  readonly user: User;
}

export interface RoleDeleteInfo {
  readonly guildId: string;
  readonly roleId: string;
  readonly role?: Role;
}

export interface MessageDeleteInfo extends types.MessageDeleteEvent {
  readonly message?: Message;
}

export interface MessageDeleteBulkInfo extends types.MessageDeleteBulkEvent {
  readonly messages: readonly Message[];
}

export interface ThreadDeleteInfo extends types.ThreadDeleteEvent {
  readonly thread?: Channel;
}

export interface ClientEventMap {
  ready: [user: User];
  stopped: [];
  stateChange: [state: ClientState, previous: ClientState];
  userUpdate: [user: User, previous?: User];
  guildCreate: [guild: Guild];
  guildUpdate: [guild: Guild, previous?: Guild];
  guildDelete: [info: GuildDeleteInfo];
  channelCreate: [channel: Channel];
  channelUpdate: [channel: Channel, previous?: Channel];
  channelDelete: [channel: Channel];
  channelPinsUpdate: [event: types.ChannelPinsUpdateEvent];
  threadCreate: [thread: Channel];
  threadUpdate: [thread: Channel, previous?: Channel];
  threadDelete: [info: ThreadDeleteInfo];
  threadListSync: [event: types.ThreadListSyncEvent];
  threadMemberUpdate: [event: types.ThreadMemberUpdateEvent];
  threadMembersUpdate: [event: types.ThreadMembersUpdateEvent];
  messageCreate: [message: Message];
  messageUpdate: [
    message: Message | undefined,
    previous: Message | undefined,
    raw: types.MessageUpdateEvent,
  ];
  messageDelete: [info: MessageDeleteInfo];
  messageDeleteBulk: [info: MessageDeleteBulkInfo];
  messageReactionAdd: [event: types.MessageReactionAddEvent];
  messageReactionRemove: [event: types.MessageReactionRemoveEvent];
  messageReactionRemoveAll: [event: types.MessageReactionRemoveAllEvent];
  messageReactionRemoveEmoji: [event: types.MessageReactionRemoveEmojiEvent];
  messagePollVoteAdd: [event: types.MessagePollVoteEvent];
  messagePollVoteRemove: [event: types.MessagePollVoteEvent];
  guildMemberAdd: [member: GuildMember];
  guildMemberUpdate: [member: GuildMember, previous?: GuildMember];
  guildMemberRemove: [info: GuildMemberRemoveInfo];
  guildBanAdd: [info: GuildBanInfo];
  guildBanRemove: [info: GuildBanInfo];
  roleCreate: [role: Role];
  roleUpdate: [role: Role, previous?: Role];
  roleDelete: [info: RoleDeleteInfo];
  interactionCreate: [interaction: Interaction];
  autoModerationRuleCreate: [rule: types.AutoModerationRule];
  autoModerationRuleUpdate: [rule: types.AutoModerationRule];
  autoModerationRuleDelete: [rule: types.AutoModerationRule];
  autoModerationActionExecution: [event: types.AutoModerationActionExecutionEvent];
  guildEmojisUpdate: [event: types.GuildEmojisUpdateEvent];
  guildStickersUpdate: [event: types.GuildStickersUpdateEvent];
  guildIntegrationsUpdate: [event: types.GuildIntegrationsUpdateEvent];
  integrationCreate: [event: types.IntegrationCreateEvent];
  integrationUpdate: [event: types.IntegrationUpdateEvent];
  integrationDelete: [event: types.IntegrationDeleteEvent];
  guildScheduledEventCreate: [event: types.GuildScheduledEvent];
  guildScheduledEventUpdate: [event: types.GuildScheduledEvent];
  guildScheduledEventDelete: [event: types.GuildScheduledEvent];
  guildScheduledEventUserAdd: [event: types.GuildScheduledEventUserEvent];
  guildScheduledEventUserRemove: [event: types.GuildScheduledEventUserEvent];
  inviteCreate: [event: types.InviteCreateEvent];
  inviteDelete: [event: types.InviteDeleteEvent];
  presenceUpdate: [event: types.PresenceUpdateEvent];
  typingStart: [event: types.TypingStartEvent];
  webhooksUpdate: [event: types.WebhooksUpdateEvent];
  entitlementCreate: [entitlement: types.Entitlement];
  entitlementUpdate: [entitlement: types.Entitlement];
  entitlementDelete: [entitlement: types.Entitlement];
  subscriptionCreate: [subscription: types.Subscription];
  subscriptionUpdate: [subscription: types.Subscription];
  subscriptionDelete: [subscription: types.Subscription];
  dispatch: [eventName: string, data: unknown, shardId: number];
  shardReconnecting: [shardId: number, info: ReconnectInfo];
  shardResumed: [shardId: number];
  shardClosed: [shardId: number, info: CloseInfo];
  commandResult: [result: CommandHandleResult, source: Interaction | Message];
  commandError: [
    error: CommandError,
    context?: CommandContext | AutocompleteContext,
  ];
  clientError: [error: unknown, source: string];
}
