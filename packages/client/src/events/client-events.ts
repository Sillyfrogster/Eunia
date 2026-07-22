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
  messageCreate: [message: Message];
  messageUpdate: [
    message: Message | undefined,
    previous: Message | undefined,
    raw: types.MessageUpdateEvent,
  ];
  messageDelete: [info: MessageDeleteInfo];
  messageDeleteBulk: [info: MessageDeleteBulkInfo];
  guildMemberAdd: [member: GuildMember];
  guildMemberUpdate: [member: GuildMember, previous?: GuildMember];
  guildMemberRemove: [info: GuildMemberRemoveInfo];
  roleCreate: [role: Role];
  roleUpdate: [role: Role, previous?: Role];
  roleDelete: [info: RoleDeleteInfo];
  interactionCreate: [interaction: Interaction];
  autoModerationRuleCreate: [rule: types.AutoModerationRule];
  autoModerationRuleUpdate: [rule: types.AutoModerationRule];
  autoModerationRuleDelete: [rule: types.AutoModerationRule];
  autoModerationActionExecution: [event: types.AutoModerationActionExecutionEvent];
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
