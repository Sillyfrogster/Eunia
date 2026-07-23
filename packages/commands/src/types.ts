import type {
  ApplicationCommandOptionType,
  Localizations,
  PermissionInput,
} from "@eunia/types";
import type * as types from "@eunia/types";
import type { Interaction, Message, Sendable } from "@eunia/structures";
import type { Channel, Role, User } from "@eunia/structures";
import type { Command, CommandGroup } from "./command";
import type { CommandError, CommandRejection } from "./errors";
import type { OptionField } from "./fields";

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
  context: CommandContext | AutocompleteContext,
) => Awaitable<boolean | void | CommandGuardFailure>;

export type CommandMiddleware = (
  context: CommandContext,
  next: () => Promise<void>,
) => Awaitable<void>;

/** Hydrates resolved option payloads into structures; an interaction satisfies it. */
export interface ResolvedStructureSource {
  resolvedUser(id: string): User | undefined;
  resolvedChannel(id: string): Channel | undefined;
  resolvedRole(id: string): Role | undefined;
}

/** Structure fields are present only when the invocation carried resolved payloads. */
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
    context?: CommandContext | AutocompleteContext,
  ): Awaitable<void>;
}

export interface FocusedOption {
  readonly name: string;
  readonly type:
    | ApplicationCommandOptionType.String
    | ApplicationCommandOptionType.Integer
    | ApplicationCommandOptionType.Number;
  readonly value: string | number;
}

/** Typed access to declared option fields: `ctx.get(this.sides)`. */
export interface OptionAccess {
  get<V, R extends boolean>(field: OptionField<V, R>): R extends true ? V : V | undefined;
  has(field: OptionField<unknown, boolean>): boolean;
}

interface CommandContextBase extends OptionAccess {
  readonly command: Command;
  readonly groups: readonly CommandGroup[];
  readonly path: readonly string[];
  readonly host: CommandHost;
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  readonly userPermissions?: bigint;
  readonly botPermissions?: bigint;
  reply(input: Sendable): Promise<unknown>;
}

export interface SlashCommandContext extends CommandContextBase {
  readonly kind: "slash";
  readonly interaction: Interaction<"command">;
  defer(options?: { readonly ephemeral?: boolean }): Promise<boolean>;
}

export interface UserCommandTarget {
  readonly id: string;
  readonly raw: Readonly<types.User>;
  readonly user: User;
  readonly member?: Readonly<Omit<types.GuildMember, "user" | "deaf" | "mute">>;
}

export interface UserCommandContext extends CommandContextBase {
  readonly kind: "user";
  readonly interaction: Interaction<"command">;
  readonly target: UserCommandTarget;
  defer(options?: { readonly ephemeral?: boolean }): Promise<boolean>;
}

export interface MessageCommandTarget {
  readonly id: string;
  readonly raw: Readonly<Partial<types.Message>>;
  readonly message?: Message;
}

export interface MessageCommandContext extends CommandContextBase {
  readonly kind: "message";
  readonly interaction: Interaction<"command">;
  readonly target: MessageCommandTarget;
  defer(options?: { readonly ephemeral?: boolean }): Promise<boolean>;
}

export interface PrefixCommandContext extends CommandContextBase {
  readonly kind: "prefix";
  readonly message: Message;
  readonly prefix: string;
}

export type CommandContext =
  | SlashCommandContext
  | PrefixCommandContext
  | UserCommandContext
  | MessageCommandContext;

export interface AutocompleteContext extends OptionAccess {
  readonly kind: "autocomplete";
  readonly command: Command;
  readonly groups: readonly CommandGroup[];
  readonly path: readonly string[];
  readonly host: CommandHost;
  readonly interaction: Interaction<"autocomplete">;
  readonly focused: FocusedOption;
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  readonly userPermissions?: bigint;
  readonly botPermissions?: bigint;
}

/** Context handed to command-scoped component and modal listeners. */
export interface ListenerContext<
  K extends "button" | "select" | "modal" = "button" | "select" | "modal",
> {
  readonly kind: K;
  readonly command: Command;
  readonly host: CommandHost;
  readonly interaction: Interaction<K>;
  readonly args: readonly string[];
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  reply(input: Sendable): Promise<unknown>;
  update(input: Sendable): Promise<void>;
  defer(): Promise<boolean>;
}

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

export interface CommandHandleOptions extends CommandPermissionData {
  readonly resolvePermissions?: () => Awaitable<CommandPermissionData>;
}

export type CommandHandleResult =
  | { readonly status: "ignored" }
  | { readonly status: "completed"; readonly path: readonly string[] }
  | { readonly status: "autocomplete"; readonly path: readonly string[] }
  | { readonly status: "rejected"; readonly rejection: CommandRejection }
  | { readonly status: "failed"; readonly error: CommandError };

export type CommandPublishTarget =
  | { readonly scope?: "global" }
  | { readonly scope: "guild"; readonly guildId: string };

export interface CommandPublishResult<T = unknown> {
  readonly target: "global" | "guild";
  readonly guildId?: string;
  readonly commands: T;
}
