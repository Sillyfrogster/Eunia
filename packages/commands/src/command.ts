import type {
  ApplicationIntegrationType,
  InteractionContextType,
  Localizations,
  PermissionInput,
} from "@eunia/types";
import {
  freezeAccess,
  freezeLocalizations,
  freezePermissionInput,
} from "./configuration";
import type { OptionField } from "./fields";
import type { ListenerField } from "./listeners";
import type {
  AutoDeferOptions,
  Awaitable,
  ChatCommandContext,
  CommandAccess,
  CommandMiddleware,
  CommandRateLimit,
  MessageCommandContext,
  PrefixCommandContext,
  UserCommandContext,
} from "./types";

export type CommandOptionMap = Readonly<
  Record<string, OptionField<unknown, boolean>>
>;

export type CommandListenerMap = Readonly<Record<string, ListenerField>>;

export interface PrefixCommandSettings {
  readonly aliases?: readonly string[];
}

export type PrefixExposure = true | PrefixCommandSettings;

export interface ApplicationCommandSettings {
  readonly nameLocalizations?: Localizations;
  readonly defaultMemberPermissions?: PermissionInput | null;
  readonly contexts?: readonly InteractionContextType[] | null;
  readonly integrationTypes?: readonly ApplicationIntegrationType[];
  readonly nsfw?: boolean;
}

export interface ChatInputCommandSettings extends ApplicationCommandSettings {
  readonly descriptionLocalizations?: Localizations;
}

interface ExecutableSettings<L extends CommandListenerMap> {
  readonly name: string;
  readonly listeners?: L;
  readonly access?: CommandAccess;
  readonly middleware?: readonly CommandMiddleware[];
  readonly rateLimit?: CommandRateLimit;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface ChatCommandInput<
  O extends CommandOptionMap,
  L extends CommandListenerMap,
  P extends PrefixExposure | undefined,
> extends ExecutableSettings<L> {
  readonly description: string;
  readonly options?: O;
  readonly prefix?: P;
  readonly autoDefer?: boolean | AutoDeferOptions;
  readonly registration?: ChatInputCommandSettings;
  readonly run: (
    context: ChatCommandContext<O, L, P>,
  ) => Awaitable<void>;
}

export interface PrefixCommandInput<
  O extends CommandOptionMap,
  L extends CommandListenerMap,
> extends ExecutableSettings<L> {
  readonly description: string;
  readonly aliases?: readonly string[];
  readonly options?: O;
  readonly run: (
    context: PrefixCommandContext<
      O,
      L,
      PrefixCommand<O, L>
    >,
  ) => Awaitable<void>;
}

export interface UserCommandInput<L extends CommandListenerMap>
  extends ExecutableSettings<L> {
  readonly autoDefer?: boolean | AutoDeferOptions;
  readonly registration?: ApplicationCommandSettings;
  readonly run: (
    context: UserCommandContext<L>,
  ) => Awaitable<void>;
}

export interface MessageCommandInput<L extends CommandListenerMap>
  extends ExecutableSettings<L> {
  readonly autoDefer?: boolean | AutoDeferOptions;
  readonly registration?: ApplicationCommandSettings;
  readonly run: (
    context: MessageCommandContext<L>,
  ) => Awaitable<void>;
}

export interface CommandGroupInput {
  readonly name: string;
  readonly description: string;
  readonly children: readonly GroupableCommandNode[];
  readonly prefix?: PrefixCommandSettings;
  readonly access?: CommandAccess;
  readonly middleware?: readonly CommandMiddleware[];
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly registration?: ChatInputCommandSettings;
}

interface ExecutableCommand<
  T extends "chat" | "prefix" | "user" | "message",
  L extends CommandListenerMap,
> extends Omit<ExecutableSettings<L>, "listeners"> {
  readonly type: T;
  readonly listeners: L;
  readonly middleware: readonly CommandMiddleware[];
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface ChatCommand<
  O extends CommandOptionMap = CommandOptionMap,
  L extends CommandListenerMap = CommandListenerMap,
  P extends PrefixExposure | undefined = PrefixExposure | undefined,
> extends ExecutableCommand<"chat", L> {
  readonly description: string;
  readonly options: O;
  readonly prefix?: P;
  readonly autoDefer?: boolean | AutoDeferOptions;
  readonly registration?: ChatInputCommandSettings;
  readonly run: (
    context: ChatCommandContext<O, L, P>,
  ) => Awaitable<void>;
}

export interface PrefixCommand<
  O extends CommandOptionMap = CommandOptionMap,
  L extends CommandListenerMap = CommandListenerMap,
> extends ExecutableCommand<"prefix", L> {
  readonly description: string;
  readonly aliases: readonly string[];
  readonly options: O;
  readonly run: (
    context: PrefixCommandContext<
      O,
      L,
      PrefixCommand<O, L>
    >,
  ) => Awaitable<void>;
}

export interface UserCommand<
  L extends CommandListenerMap = CommandListenerMap,
> extends ExecutableCommand<"user", L> {
  readonly autoDefer?: boolean | AutoDeferOptions;
  readonly registration?: ApplicationCommandSettings;
  readonly run: (
    context: UserCommandContext<L>,
  ) => Awaitable<void>;
}

export interface MessageCommand<
  L extends CommandListenerMap = CommandListenerMap,
> extends ExecutableCommand<"message", L> {
  readonly autoDefer?: boolean | AutoDeferOptions;
  readonly registration?: ApplicationCommandSettings;
  readonly run: (
    context: MessageCommandContext<L>,
  ) => Awaitable<void>;
}

export interface CommandGroup {
  readonly type: "group";
  readonly name: string;
  readonly description: string;
  readonly children: readonly GroupableCommandNode[];
  readonly prefix?: PrefixCommandSettings;
  readonly access?: CommandAccess;
  readonly middleware: readonly CommandMiddleware[];
  readonly meta: Readonly<Record<string, unknown>>;
  readonly registration?: ChatInputCommandSettings;
}

type ErasedCommand<T extends { readonly run: unknown }> =
  Omit<T, "run"> & {
    readonly run: (
      context: never,
    ) => Awaitable<void>;
  };

export type AnyCommand =
  | ErasedCommand<ChatCommand>
  | ErasedCommand<PrefixCommand>
  | ErasedCommand<UserCommand>
  | ErasedCommand<MessageCommand>;

export type GroupableCommandNode =
  | Extract<AnyCommand, { readonly type: "chat" | "prefix" }>
  | CommandGroup;
export type CommandNode = AnyCommand | CommandGroup;

const nodes = new WeakSet<object>();

export function command<
  const O extends CommandOptionMap = {},
  const L extends CommandListenerMap = {},
  const P extends PrefixExposure | undefined = undefined,
>(input: ChatCommandInput<O, L, P>): ChatCommand<O, L, P> {
  return registerNode({
    ...executable(input),
    type: "chat",
    description: input.description,
    options: freezeRecord(input.options),
    ...(input.prefix === undefined
      ? {}
      : { prefix: freezePrefix(input.prefix) as P }),
    ...(input.autoDefer === undefined ? {} : { autoDefer: freezeAutoDefer(input.autoDefer) }),
    ...(input.registration === undefined
      ? {}
      : { registration: freezeRegistration(input.registration) }),
    run: input.run,
  }) as ChatCommand<O, L, P>;
}

export function prefixCommand<
  const O extends CommandOptionMap = {},
  const L extends CommandListenerMap = {},
>(input: PrefixCommandInput<O, L>): PrefixCommand<O, L> {
  return registerNode({
    ...executable(input),
    type: "prefix",
    description: input.description,
    aliases: freezeAliases(input.aliases),
    options: freezeRecord(input.options),
    run: input.run,
  }) as PrefixCommand<O, L>;
}

export function userCommand<const L extends CommandListenerMap = {}>(
  input: UserCommandInput<L>,
): UserCommand<L> {
  return registerNode({
    ...executable(input),
    type: "user",
    ...(input.autoDefer === undefined ? {} : { autoDefer: freezeAutoDefer(input.autoDefer) }),
    ...(input.registration === undefined
      ? {}
      : { registration: freezeRegistration(input.registration) }),
    run: input.run,
  }) as UserCommand<L>;
}

export function messageCommand<const L extends CommandListenerMap = {}>(
  input: MessageCommandInput<L>,
): MessageCommand<L> {
  return registerNode({
    ...executable(input),
    type: "message",
    ...(input.autoDefer === undefined ? {} : { autoDefer: freezeAutoDefer(input.autoDefer) }),
    ...(input.registration === undefined
      ? {}
      : { registration: freezeRegistration(input.registration) }),
    run: input.run,
  }) as MessageCommand<L>;
}

export function commandGroup(input: CommandGroupInput): CommandGroup {
  return registerNode({
    type: "group",
    name: input.name,
    description: input.description,
    children: Object.freeze([...input.children]),
    ...(input.prefix === undefined ? {} : { prefix: freezePrefix(input.prefix) }),
    ...(input.access === undefined
      ? {}
      : { access: freezeAccess(input.access) }),
    middleware: Object.freeze([...(input.middleware ?? [])]),
    meta: Object.freeze({ ...(input.meta ?? {}) }),
    ...(input.registration === undefined
      ? {}
      : { registration: freezeRegistration(input.registration) }),
  }) as CommandGroup;
}

export function isCommandNode(value: unknown): value is CommandNode {
  return typeof value === "object" && value !== null && nodes.has(value);
}

function executable<L extends CommandListenerMap>(
  input: ExecutableSettings<L>,
): Omit<ExecutableCommand<"chat", L>, "type"> {
  return {
    name: input.name,
    listeners: freezeRecord(input.listeners),
    ...(input.access === undefined
      ? {}
      : { access: freezeAccess(input.access) }),
    middleware: Object.freeze([...(input.middleware ?? [])]),
    ...(input.rateLimit === undefined
      ? {}
      : { rateLimit: Object.freeze({ ...input.rateLimit }) }),
    meta: Object.freeze({ ...(input.meta ?? {}) }),
  };
}

function freezeRecord<T extends Readonly<Record<string, unknown>>>(
  value: T | undefined,
): T {
  return Object.freeze({ ...(value ?? {}) }) as T;
}

function freezePrefix<T extends PrefixExposure>(value: T): T {
  if (value === true) return value;
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      "A command prefix must be true or prefix settings.",
    );
  }
  return Object.freeze({
    ...(value.aliases === undefined
      ? {}
      : { aliases: freezeAliases(value.aliases) }),
  }) as T;
}

function freezeAliases(
  aliases: readonly string[] | undefined,
): readonly string[] {
  if (aliases === undefined) return Object.freeze([]);
  if (
    !Array.isArray(aliases) ||
    aliases.some((alias) => typeof alias !== "string")
  ) {
    throw new TypeError("Command aliases must be an array of strings.");
  }
  return Object.freeze([...aliases]);
}

function freezeAutoDefer(
  value: boolean | AutoDeferOptions,
): boolean | AutoDeferOptions {
  if (typeof value === "boolean") return value;
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      "Command auto-defer settings must be a boolean or an object.",
    );
  }
  return Object.freeze({ ...value });
}

function freezeRegistration<
  T extends ApplicationCommandSettings &
    Partial<ChatInputCommandSettings>,
>(value: T): T {
  return Object.freeze({
    ...value,
    ...(value.nameLocalizations === undefined
      ? {}
      : {
          nameLocalizations: freezeLocalizations(
            value.nameLocalizations,
          ),
        }),
    ...(value.descriptionLocalizations === undefined
      ? {}
      : {
          descriptionLocalizations: freezeLocalizations(
            value.descriptionLocalizations,
          ),
        }),
    ...(value.defaultMemberPermissions === undefined ||
    value.defaultMemberPermissions === null
      ? {}
      : {
          defaultMemberPermissions: freezePermissionInput(
            value.defaultMemberPermissions,
          ),
        }),
    ...(value.contexts === undefined || value.contexts === null
      ? {}
      : { contexts: Object.freeze([...value.contexts]) }),
    ...(value.integrationTypes === undefined
      ? {}
      : { integrationTypes: Object.freeze([...value.integrationTypes]) }),
  }) as T;
}

function registerNode<T extends object>(node: T): T {
  const frozen = Object.freeze(node);
  nodes.add(frozen);
  return frozen;
}
