import type {
  ApplicationCommandOptionType,
  Localizations,
  PermissionInput,
} from "@eunia/types";
import type * as types from "@eunia/types";
import type {
  Channel,
  Interaction,
  Message,
  Role,
  Sendable,
  User,
} from "@eunia/structures";
import type {
  AnyCommand,
  ChatCommand,
  CommandGroup,
  CommandListenerMap,
  CommandOptionMap,
  MessageCommand,
  PrefixCommand,
  PrefixExposure,
  UserCommand,
} from "./command";
import type { CommandError, CommandRejection } from "./errors";
import type { OptionField } from "./fields";
import type {
  ListenerBuilders,
  ListenerHandles,
} from "./listeners";

export type Awaitable<T> = T | Promise<T>;

export interface CommandChoice<T extends string | number = string | number> {
  readonly name: string;
  readonly nameLocalizations?: Localizations;
  readonly value: T;
}

export type CooldownScope = "user" | "channel" | "guild" | "global";

export interface CommandRateLimit {
  readonly limit: number;
  readonly windowMs: number;
  readonly scope?: CooldownScope;
}

export interface AutoDeferOptions {
  readonly afterMs?: number;
  readonly ephemeral?: boolean;
}

export interface CommandGuardFailure {
  readonly allowed: false;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type CommandGuard = (
  context: CommandAccessContext,
) => Awaitable<boolean | void | CommandGuardFailure>;

export interface CommandAccess {
  readonly guildOnly?: boolean;
  readonly ownerOnly?: boolean;
  readonly userPermissions?: PermissionInput;
  readonly botPermissions?: PermissionInput;
  readonly guards?: readonly CommandGuard[];
}

export type CommandMiddleware = (
  context: CommandContext,
  next: () => Promise<void>,
) => Awaitable<void>;

export interface ResolvedStructureSource {
  resolvedUser(id: string): User | undefined;
  resolvedChannel(id: string): Channel | undefined;
  resolvedRole(id: string): Role | undefined;
}

export interface ResolvedUser {
  readonly id: string;
  readonly raw?: types.User;
  readonly user?: User;
}

export interface ResolvedChannel {
  readonly id: string;
  readonly raw?: Pick<types.Channel, "id" | "type" | "name" | "permissions">;
  readonly channel?: Channel;
}

export interface ResolvedRole {
  readonly id: string;
  readonly raw?: types.Role;
  readonly role?: Role;
}

export type ResolvedMentionable =
  | {
      readonly kind: "user";
      readonly id: string;
      readonly raw?: types.User;
      readonly user?: User;
    }
  | {
      readonly kind: "role";
      readonly id: string;
      readonly raw?: types.Role;
      readonly role?: Role;
    };

export interface ResolvedAttachment {
  readonly id: string;
  readonly raw?: types.Attachment;
}

export type ResolvedCommandOption =
  | string
  | number
  | boolean
  | ResolvedUser
  | ResolvedChannel
  | ResolvedRole
  | ResolvedMentionable
  | ResolvedAttachment;

export type CommandOptionValues<O extends CommandOptionMap> = Readonly<{
  [K in keyof O]: O[K] extends OptionField<infer V, infer R>
    ? R extends true
      ? V
      : V | undefined
    : never;
}>;

export interface CommandRest {
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
}

export interface CommandHost {
  readonly applicationId: string;
  readonly botId: string;
  readonly ownerIds: readonly string[] | ReadonlySet<string>;
  readonly rest: CommandRest;
  reportCommandError(
    error: CommandError,
    context?: CommandErrorContext,
  ): Awaitable<void>;
}

export interface FocusedOption<
  T extends string | number = string | number,
> {
  readonly name: string;
  readonly type:
    | ApplicationCommandOptionType.String
    | ApplicationCommandOptionType.Integer
    | ApplicationCommandOptionType.Number;
  readonly value: T;
}

interface InvocationContextBase {
  readonly command: AnyCommand;
  readonly groups: readonly CommandGroup[];
  readonly path: readonly string[];
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  readonly userPermissions?: bigint;
  readonly botPermissions?: bigint;
  reply(input: Sendable): Promise<unknown>;
}

interface OptionContext<
  O extends CommandOptionMap,
  L extends CommandListenerMap,
> extends InvocationContextBase {
  readonly options: CommandOptionValues<O>;
  readonly listeners: ListenerHandles<L>;
}

interface InteractionCommandResponseContext {
  defer(options?: { readonly ephemeral?: boolean }): Promise<boolean>;
  modal(input: types.ModalInteractionResponseData): Promise<void>;
}

export interface SlashCommandContext<
  O extends CommandOptionMap = CommandOptionMap,
  L extends CommandListenerMap = CommandListenerMap,
> extends OptionContext<O, L>, InteractionCommandResponseContext {
  readonly kind: "slash";
  readonly command: ChatCommand<O, L>;
  readonly interaction: Interaction<"command">;
}

export interface PrefixCommandContext<
  O extends CommandOptionMap = CommandOptionMap,
  L extends CommandListenerMap = CommandListenerMap,
  C extends
    | ChatCommand<O, L>
    | PrefixCommand<O, L> =
    | ChatCommand<O, L>
    | PrefixCommand<O, L>,
> extends OptionContext<O, L> {
  readonly kind: "prefix";
  readonly command: C;
  readonly message: Message;
  readonly prefix: string;
  reply(input: Sendable): Promise<Message>;
}

export type ChatCommandContext<
  O extends CommandOptionMap,
  L extends CommandListenerMap,
  P extends PrefixExposure | undefined,
> =
  | SlashCommandContext<O, L>
  | (P extends PrefixExposure
      ? PrefixCommandContext<O, L, ChatCommand<O, L, P>>
      : never);

export interface UserCommandTarget {
  readonly id: string;
  readonly raw: Readonly<types.User>;
  readonly user: User;
  readonly member?: Readonly<Omit<types.GuildMember, "user" | "deaf" | "mute">>;
}

export interface UserCommandContext<
  L extends CommandListenerMap = CommandListenerMap,
> extends InvocationContextBase, InteractionCommandResponseContext {
  readonly kind: "user";
  readonly command: UserCommand<L>;
  readonly groups: readonly [];
  readonly listeners: ListenerHandles<L>;
  readonly interaction: Interaction<"command">;
  readonly target: UserCommandTarget;
}

export interface MessageCommandTarget {
  readonly id: string;
  readonly raw: Readonly<Partial<types.Message>>;
  readonly message?: Message;
}

export interface MessageCommandContext<
  L extends CommandListenerMap = CommandListenerMap,
> extends InvocationContextBase, InteractionCommandResponseContext {
  readonly kind: "message";
  readonly command: MessageCommand<L>;
  readonly groups: readonly [];
  readonly listeners: ListenerHandles<L>;
  readonly interaction: Interaction<"command">;
  readonly target: MessageCommandTarget;
}

export type CommandContext =
  | SlashCommandContext
  | PrefixCommandContext
  | UserCommandContext
  | MessageCommandContext;

export interface AutocompleteContext<
  T extends string | number = string | number,
> {
  readonly kind: "autocomplete";
  readonly command: ChatCommand;
  readonly groups: readonly CommandGroup[];
  readonly path: readonly string[];
  readonly interaction: Interaction<"autocomplete">;
  readonly signal: AbortSignal;
  readonly options: Readonly<Record<string, ResolvedCommandOption | undefined>>;
  readonly focused: FocusedOption<T>;
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  readonly userPermissions?: bigint;
  readonly botPermissions?: bigint;
}

interface ListenerContextBase<
  K extends "button" | "select" | "modal" = "button" | "select" | "modal",
> {
  readonly kind: K;
  readonly command: AnyCommand;
  readonly groups: readonly CommandGroup[];
  readonly path: readonly string[];
  readonly interaction: Interaction<K>;
  readonly listeners: ListenerBuilders;
  readonly args: readonly string[];
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  readonly userPermissions?: bigint;
  readonly botPermissions?: bigint;
  reply(input: Sendable): Promise<unknown>;
  update(input: Sendable): Promise<void>;
  readonly defer: K extends "modal"
    ? (options?: {
        readonly ephemeral?: boolean;
      }) => Promise<boolean>
    : () => Promise<boolean>;
}

export type ListenerContext<
  K extends "button" | "select" | "modal" = "button" | "select" | "modal",
> = K extends "button" | "select"
  ? ListenerContextBase<K> & {
      modal(input: types.ModalInteractionResponseData): Promise<void>;
    }
  : ListenerContextBase<K>;

export type CommandAccessContext =
  | CommandContext
  | AutocompleteContext
  | ListenerContext;

export type CommandErrorContext = CommandAccessContext;

export type AutocompleteHandler<T extends string | number = string | number> = (
  context: AutocompleteContext<T>,
) => Awaitable<readonly CommandChoice<T>[]>;

export type PrefixValue = string | readonly string[] | null | undefined;

export type PrefixResolver =
  | string
  | readonly string[]
  | ((message: Message) => Awaitable<PrefixValue>);

export interface PrefixOptions {
  readonly prefixes: PrefixResolver;
  readonly allowMention?: boolean;
  readonly caseSensitive?: boolean;
  readonly ignoreBots?: boolean;
}

export type CommandMessageFactory =
  | string
  | ((rejection: CommandRejection) => string);

export interface CommandMessages {
  readonly guildOnly?: CommandMessageFactory;
  readonly ownerOnly?: CommandMessageFactory;
  readonly userPermissions?: CommandMessageFactory;
  readonly botPermissions?: CommandMessageFactory;
  readonly permissionDataUnavailable?: CommandMessageFactory;
  readonly cooldown?: CommandMessageFactory;
  readonly guard?: CommandMessageFactory;
  readonly invalidInput?: CommandMessageFactory;
  readonly unavailable?: CommandMessageFactory;
  readonly error?: string;
}

export interface CommandManagerOptions {
  readonly prefix?: PrefixResolver | PrefixOptions;
  readonly middleware?: readonly CommandMiddleware[];
  readonly guards?: readonly CommandGuard[];
  readonly cooldownStore?: import("./cooldown").CooldownStore;
  readonly autocompleteTimeoutMs?: number;
  readonly messages?: CommandMessages;
}

export interface CommandPermissionData {
  readonly userPermissions?: PermissionInput;
  readonly botPermissions?: PermissionInput;
}

export interface CommandPermissionNeeds {
  readonly user: boolean;
  readonly bot: boolean;
}

export interface CommandHandleOptions extends CommandPermissionData {
  readonly resolvePermissions?: (
    needs: CommandPermissionNeeds,
    signal?: AbortSignal,
  ) => Awaitable<CommandPermissionData>;
}

export type CommandHandleResult =
  | { readonly status: "ignored" }
  | { readonly status: "completed"; readonly path: readonly string[] }
  | { readonly status: "autocomplete"; readonly path: readonly string[] }
  | {
      readonly status: "rejected";
      readonly path: readonly string[];
      readonly rejection: CommandRejection;
    }
  | {
      readonly status: "failed";
      readonly path: readonly string[];
      readonly error: CommandError;
    };

export type CommandPublishTarget =
  | { readonly scope: "global" }
  | { readonly scope: "guild"; readonly guildId: string };

export type CommandPublishResult<T = unknown> =
  | {
      readonly target: "global";
      readonly commands: T;
    }
  | {
      readonly target: "guild";
      readonly guildId: string;
      readonly commands: T;
    };
