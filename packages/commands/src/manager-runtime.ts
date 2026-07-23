import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  MessageFlags,
} from "@eunia/types";
import type * as types from "@eunia/types";
import {
  normalizeSendable,
  type Interaction,
  type Message,
  type Sendable,
} from "@eunia/structures";
import type { CooldownResult } from "./cooldown";
import {
  CommandOptionError,
  CommandRejection,
  CommandValidationError,
  MiddlewareError,
} from "./errors";
import type { OptionField } from "./fields";
import type { ListenerField } from "./listeners";
import { ResolvedOptions } from "./options";
import type { PreparedCommand, PreparedGroup, PreparedNode } from "./prepare";
import type {
  CommandChoice,
  CommandContext,
  CommandHandleOptions,
  CommandHost,
  CommandMiddleware,
  MessageCommandTarget,
  OptionAccess,
  UserCommandTarget,
} from "./types";
import { commandTypeFor, resolvePermissionBits } from "./validation";

export interface ResolvedCommand {
  readonly command: PreparedCommand;
  readonly groups: readonly PreparedGroup[];
  readonly options: readonly types.ApplicationCommandInteractionOption[];
}

export interface ResolvedPrefixCommand {
  readonly command: PreparedCommand;
  readonly groups: readonly PreparedGroup[];
  readonly arguments: readonly string[];
}

export interface ListenerRoute {
  readonly prepared: PreparedCommand;
  readonly fieldName: string;
  readonly field: ListenerField;
}

export class AutocompleteResponder {
  readonly deadline: Promise<void>;
  private claimed: boolean;
  private readonly timer: ReturnType<typeof setTimeout>;
  private resolveDeadline!: () => void;
  private timeoutTask?: Promise<void>;

  constructor(
    private readonly interaction: Interaction<"autocomplete">,
    timeoutMs: number,
    private readonly onTimeoutError: (error: unknown) => Promise<void>,
  ) {
    this.claimed = interaction.acknowledged;
    this.deadline = new Promise((resolve) => {
      this.resolveDeadline = resolve;
    });
    this.timer = setTimeout(() => {
      this.timeoutTask = this.send([]).then(
        () => undefined,
        async (error: unknown) => {
          await this.onTimeoutError(error);
        },
      );
      this.resolveDeadline();
    }, timeoutMs);
  }

  async send(choices: readonly types.ApplicationCommandChoice[]): Promise<boolean> {
    if (this.claimed) return false;
    this.claimed = true;
    try {
      await this.interaction.autocomplete(choices);
      return true;
    } catch (error) {
      this.claimed = this.interaction.acknowledged;
      throw error;
    }
  }

  async sendEmpty(): Promise<void> {
    try {
      await this.send([]);
    } catch {
      return;
    }
  }

  async close(): Promise<void> {
    clearTimeout(this.timer);
    if (this.timeoutTask !== undefined) await this.timeoutTask;
  }
}

export class InteractionResponder {
  private state: "idle" | "claiming" | "deferred" | "replied";
  private deferredEphemeral = false;
  private transition?: Promise<void>;

  constructor(private readonly interaction: Interaction<"command">) {
    this.state =
      interaction.state === "deferred"
        ? "deferred"
        : interaction.state === "pending"
          ? "idle"
          : "replied";
  }

  async reply(response: Sendable): Promise<unknown> {
    if (this.syncFromInteraction() === "in_flight" && this.state !== "claiming") {
      throw new Error("An interaction response is still in progress.");
    }
    if (this.state === "claiming") {
      try {
        await this.transition;
      } catch {
        this.state = "idle";
      }
    }
    if (this.state === "deferred") {
      const requestedEphemeral = ephemeralOf(response);
      if (
        requestedEphemeral !== undefined &&
        requestedEphemeral !== this.deferredEphemeral
      ) {
        await this.interaction.original.delete();
        this.state = "replied";
        return this.interaction.followup(response);
      }
      const result = await this.interaction.original.edit(stripEphemeralFlag(response));
      this.state = "replied";
      return result;
    }
    if (this.state === "replied") return this.interaction.followup(response);

    this.state = "claiming";
    const transition = this.interaction.respond(response).then(
      () => {
        this.state = "replied";
      },
      (error: unknown) => {
        this.state = "idle";
        throw error;
      },
    );
    this.transition = transition;
    await transition;
    return undefined;
  }

  async defer(options?: { readonly ephemeral?: boolean }): Promise<boolean> {
    if (this.syncFromInteraction() === "in_flight" && this.state !== "claiming") {
      return false;
    }
    if (this.state === "claiming") {
      try {
        await this.transition;
      } catch {
        this.state = "idle";
      }
    }
    if (this.state !== "idle") return false;

    this.state = "claiming";
    const transition = this.interaction.defer(options).then(
      () => {
        this.deferredEphemeral = options?.ephemeral ?? false;
        this.state = "deferred";
      },
      (error: unknown) => {
        this.state = "idle";
        throw error;
      },
    );
    this.transition = transition;
    await transition;
    return true;
  }

  private syncFromInteraction(): "ready" | "in_flight" {
    switch (this.interaction.state) {
      case "pending":
        if (this.state !== "claiming") this.state = "idle";
        return "ready";
      case "replied":
        this.state = "replied";
        return "ready";
      case "deferred":
        this.state = "deferred";
        return "ready";
      case "autocomplete":
        this.state = "replied";
        return "ready";
      case "replying":
      case "deferring":
      case "autocompleting":
      case "uncertain":
        return "in_flight";
    }
  }
}

export function collectListenerRoutes(
  node: PreparedNode,
  routes: Map<string, ListenerRoute>,
): void {
  if (node.nodeKind === "group") {
    for (const child of node.children) collectListenerRoutes(child, routes);
    return;
  }
  for (const [fieldName, field] of node.listeners) {
    if (routes.has(field.route)) {
      throw new CommandValidationError(
        `Listener route "${field.route}" is already registered.`,
      );
    }
    routes.set(field.route, { prepared: node, fieldName, field });
  }
}

export function commandPath(resolved: {
  readonly command: PreparedCommand;
  readonly groups: readonly PreparedGroup[];
}): readonly string[] {
  return Object.freeze([
    resolved.groups[0]?.definition.name ?? resolved.command.definition.name,
    ...resolved.groups.slice(1).map((group) => group.definition.name),
    ...(resolved.groups.length === 0 ? [] : [resolved.command.definition.name]),
  ]);
}

export function applicationCommandKey(type: ApplicationCommandType, name: string): string {
  return `${type}:${name}`;
}

export function validateApplicationCommandCounts(
  commands: ReadonlyMap<string, PreparedNode>,
): void {
  const counts = new Map<ApplicationCommandType, number>();
  for (const command of commands.values()) {
    const type = commandTypeFor(command.commandKind);
    if (type !== undefined) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  if ((counts.get(ApplicationCommandType.ChatInput) ?? 0) > 100) {
    throw new CommandValidationError("Discord allows at most 100 chat input commands per scope.");
  }
  if ((counts.get(ApplicationCommandType.User) ?? 0) > 15) {
    throw new CommandValidationError("Discord allows at most 15 user commands per scope.");
  }
  if ((counts.get(ApplicationCommandType.Message) ?? 0) > 15) {
    throw new CommandValidationError("Discord allows at most 15 message commands per scope.");
  }
}

export function resolveUserCommandTarget(
  interaction: Interaction<"command">,
  data: types.ApplicationCommandInteractionData,
): UserCommandTarget {
  const id = data.target_id;
  if (id === undefined) {
    throw new CommandRejection("invalid_input", "The user command target is missing.");
  }
  const raw = data.resolved?.users?.[id];
  const user = interaction.resolvedUser(id);
  if (raw === undefined || user === undefined) {
    throw new CommandRejection("invalid_input", "The user command target was not resolved.");
  }
  const member = data.resolved?.members?.[id];
  return Object.freeze({
    id,
    raw,
    user,
    ...(member === undefined ? {} : { member }),
  });
}

export function resolveMessageCommandTarget(
  interaction: Interaction<"command">,
  data: types.ApplicationCommandInteractionData,
): MessageCommandTarget {
  const id = data.target_id;
  if (id === undefined) {
    throw new CommandRejection("invalid_input", "The message command target is missing.");
  }
  const raw = data.resolved?.messages?.[id];
  if (raw === undefined) {
    throw new CommandRejection("invalid_input", "The message command target was not resolved.");
  }
  const message = interaction.resolvedMessage(id);
  return Object.freeze({
    id,
    raw,
    ...(message === undefined ? {} : { message }),
  });
}

export function emptyOptionAccess(prepared: PreparedCommand): OptionAccess {
  const unavailable = (): never => {
    throw new CommandOptionError(
      `Context command "${prepared.definition.name}" does not declare options.`,
    );
  };
  return {
    get: unavailable as OptionAccess["get"],
    has: unavailable,
  };
}

export function optionAccess(
  prepared: PreparedCommand,
  options: ResolvedOptions,
): OptionAccess {
  const nameOf = (field: OptionField<unknown, boolean>): string => {
    if (field.name.length === 0 || prepared.fields.get(field.name) !== field) {
      throw new CommandOptionError(
        `The option field is not declared on "${prepared.definition.name}".`,
      );
    }
    return field.name;
  };
  return {
    get: ((field: OptionField<unknown, boolean>) =>
      options.value(nameOf(field))) as OptionAccess["get"],
    has: (field) => options.value(nameOf(field)) !== undefined,
  };
}

export function resolveSlashCommand(
  root: PreparedNode,
  options: readonly types.ApplicationCommandInteractionOption[],
): ResolvedCommand {
  if (root.nodeKind === "command") {
    if (
      options.some(
        (option) =>
          option.type === ApplicationCommandOptionType.Subcommand ||
          option.type === ApplicationCommandOptionType.SubcommandGroup,
      )
    ) {
      throw new CommandRejection("command_unavailable", "The command branch is invalid.");
    }
    return { command: root, groups: [], options };
  }

  const branch = options[0];
  if (branch === undefined || options.length !== 1) {
    throw new CommandRejection("command_unavailable", "The command branch is missing.");
  }
  const child = childBySlashName(root, branch.name);
  if (child === undefined) {
    throw new CommandRejection("command_unavailable", "The command branch is unknown.");
  }

  if (branch.type === ApplicationCommandOptionType.Subcommand && child.nodeKind === "command") {
    return { command: child, groups: Object.freeze([root]), options: branch.options ?? [] };
  }
  if (branch.type !== ApplicationCommandOptionType.SubcommandGroup || child.nodeKind !== "group") {
    throw new CommandRejection("command_unavailable", "The command branch has the wrong type.");
  }

  const leafOption = branch.options?.[0];
  if (
    leafOption === undefined ||
    branch.options?.length !== 1 ||
    leafOption.type !== ApplicationCommandOptionType.Subcommand
  ) {
    throw new CommandRejection("command_unavailable", "The subcommand is missing.");
  }
  const leaf = childBySlashName(child, leafOption.name);
  if (leaf === undefined || leaf.nodeKind !== "command") {
    throw new CommandRejection("command_unavailable", "The subcommand is unknown.");
  }
  return {
    command: leaf,
    groups: Object.freeze([root, child]),
    options: leafOption.options ?? [],
  };
}

export function resolvePrefixCommand(
  root: PreparedNode,
  tokens: readonly string[],
  caseSensitive: boolean,
): ResolvedPrefixCommand {
  if (root.nodeKind === "command") return { command: root, groups: [], arguments: tokens };

  const branchToken = tokens[0];
  if (branchToken === undefined) {
    throw new CommandRejection("invalid_input", "Choose a subcommand.");
  }
  const child = childByPrefixName(root, branchToken, caseSensitive);
  if (child === undefined) {
    throw new CommandRejection("invalid_input", `Unknown subcommand "${branchToken}".`);
  }
  if (child.nodeKind === "command") {
    return { command: child, groups: Object.freeze([root]), arguments: tokens.slice(1) };
  }

  const leafToken = tokens[1];
  if (leafToken === undefined) {
    throw new CommandRejection("invalid_input", "Choose a subcommand from the group.");
  }
  const leaf = childByPrefixName(child, leafToken, caseSensitive);
  if (leaf === undefined || leaf.nodeKind !== "command") {
    throw new CommandRejection("invalid_input", `Unknown subcommand "${leafToken}".`);
  }
  return {
    command: leaf,
    groups: Object.freeze([root, child]),
    arguments: tokens.slice(2),
  };
}

function childBySlashName(group: PreparedGroup, name: string): PreparedNode | undefined {
  return group.children.find((child) => child.definition.name === name);
}

function childByPrefixName(
  group: PreparedGroup,
  name: string,
  caseSensitive: boolean,
): PreparedNode | undefined {
  return group.children.find((child) => nameMatches(child, name, caseSensitive));
}

export function nameMatches(
  node: PreparedNode,
  name: string,
  caseSensitive: boolean,
): boolean {
  const aliases = node.nodeKind === "command" ? node.command.aliases : node.group.aliases;
  const candidates = [node.definition.name, ...aliases];
  return caseSensitive
    ? candidates.includes(name)
    : candidates.some((candidate) => candidate.toLowerCase() === name.toLowerCase());
}

export function interactionPermissions(
  interaction: Interaction,
  options: Pick<CommandHandleOptions, "userPermissions" | "botPermissions">,
): { readonly user?: bigint; readonly bot?: bigint } {
  return {
    ...(options.userPermissions !== undefined
      ? { user: resolvePermissionBits(options.userPermissions) }
      : interaction.raw.member?.permissions === undefined
        ? {}
        : { user: BigInt(interaction.raw.member.permissions) }),
    ...(options.botPermissions !== undefined
      ? { bot: resolvePermissionBits(options.botPermissions) }
      : interaction.raw.app_permissions === undefined
        ? {}
        : { bot: BigInt(interaction.raw.app_permissions) }),
  };
}

export function messagePermissions(
  message: Message,
  options: Pick<CommandHandleOptions, "userPermissions" | "botPermissions">,
): { readonly user?: bigint; readonly bot?: bigint } {
  return {
    ...(options.userPermissions !== undefined
      ? { user: resolvePermissionBits(options.userPermissions) }
      : message.raw.member?.permissions === undefined
        ? {}
        : { user: BigInt(message.raw.member.permissions) }),
    ...(options.botPermissions === undefined
      ? {}
      : { bot: resolvePermissionBits(options.botPermissions) }),
  };
}

export async function resolvedPermissions(
  options: CommandHandleOptions,
): Promise<Pick<CommandHandleOptions, "userPermissions" | "botPermissions">> {
  const resolved = await options.resolvePermissions?.();
  return {
    ...(options.userPermissions === undefined
      ? resolved?.userPermissions === undefined
        ? {}
        : { userPermissions: resolved.userPermissions }
      : { userPermissions: options.userPermissions }),
    ...(options.botPermissions === undefined
      ? resolved?.botPermissions === undefined
        ? {}
        : { botPermissions: resolved.botPermissions }
      : { botPermissions: options.botPermissions }),
  };
}

export function cooldownIdentity(scope: string, context: CommandContext): string {
  switch (scope) {
    case "global":
      return "global";
    case "guild":
      return context.guildId ?? `dm:${context.channelId ?? context.userId}`;
    case "channel":
      return context.channelId ?? `user:${context.userId}`;
    default:
      return context.userId;
  }
}

export function validateCooldownResult(result: CooldownResult, limit: number): CooldownResult {
  if (result === null || typeof result !== "object") {
    throw new TypeError("Cooldown stores must return a result object.");
  }
  if (typeof result.allowed !== "boolean") {
    throw new TypeError("Cooldown results need a boolean allowed value.");
  }
  if (
    !Number.isSafeInteger(result.remaining) ||
    result.remaining < 0 ||
    result.remaining > limit
  ) {
    throw new TypeError("Cooldown results have an invalid remaining count.");
  }
  if (!Number.isFinite(result.resetAt) || result.resetAt < 0) {
    throw new TypeError("Cooldown results need a valid reset time.");
  }
  if (result.saturated !== undefined && typeof result.saturated !== "boolean") {
    throw new TypeError("Cooldown results need a boolean saturated value.");
  }
  if (!result.allowed && result.remaining !== 0) {
    throw new TypeError("Rejected cooldown results cannot have remaining uses.");
  }
  if (result.allowed && result.saturated === true) {
    throw new TypeError("Saturated cooldown results cannot allow a use.");
  }
  return result;
}

export async function runMiddleware(
  middleware: readonly CommandMiddleware[],
  context: CommandContext,
  execute: () => Promise<void> | void,
): Promise<void> {
  const dispatch = async (index: number): Promise<void> => {
    const current = middleware[index];
    if (current === undefined) {
      await execute();
      return;
    }

    let active = true;
    let called = false;
    try {
      await current(context, () => {
        if (!active) throw new MiddlewareError("Command middleware called next after it returned.");
        if (called) throw new MiddlewareError();
        called = true;
        return new LazyNext(async () => {
          if (!active) {
            throw new MiddlewareError("Command middleware used next after it returned.");
          }
          await dispatch(index + 1);
        });
      });
    } finally {
      active = false;
    }
  };

  await dispatch(0);
}

class LazyNext implements Promise<void> {
  readonly [Symbol.toStringTag] = "Promise";
  private promise?: Promise<void>;

  constructor(private readonly start: () => Promise<void>) {}

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.get().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<void | TResult> {
    return this.get().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.get().finally(onfinally);
  }

  private get(): Promise<void> {
    this.promise ??= this.start();
    return this.promise;
  }
}

export function validateAutocompleteChoices(
  choices: readonly CommandChoice[],
  focusedType: ApplicationCommandOptionType,
): readonly types.ApplicationCommandChoice[] {
  if (choices.length > 25) throw new RangeError("Autocomplete cannot return more than 25 choices.");
  const expected = focusedType === ApplicationCommandOptionType.String ? "string" : "number";
  const names = new Set<string>();
  const values = new Set<string | number>();
  return choices.map((choice) => {
    if ([...choice.name].length < 1 || [...choice.name].length > 100) {
      throw new RangeError("Autocomplete choice names must have between 1 and 100 characters.");
    }
    if (typeof choice.value !== expected) {
      throw new TypeError("Autocomplete choice values must match the focused option.");
    }
    if (typeof choice.value === "string" && [...choice.value].length > 100) {
      throw new RangeError("Autocomplete string values cannot exceed 100 characters.");
    }
    if (typeof choice.value === "number") {
      const limit =
        focusedType === ApplicationCommandOptionType.Integer
          ? Number.MAX_SAFE_INTEGER
          : 2 ** 53;
      if (
        !Number.isFinite(choice.value) ||
        Math.abs(choice.value) > limit ||
        (focusedType === ApplicationCommandOptionType.Integer &&
          !Number.isSafeInteger(choice.value))
      ) {
        throw new RangeError("Autocomplete number values are outside Discord's range.");
      }
    }
    for (const localized of Object.values(choice.nameLocalizations ?? {})) {
      if (
        localized !== null &&
        localized !== undefined &&
        ([...localized].length < 1 || [...localized].length > 100)
      ) {
        throw new RangeError(
          "Autocomplete choice localizations must have between 1 and 100 characters.",
        );
      }
    }
    if (names.has(choice.name) || values.has(choice.value)) {
      throw new RangeError("Autocomplete choices must have unique names and values.");
    }
    names.add(choice.name);
    values.add(choice.value);
    return {
      name: choice.name,
      ...(choice.nameLocalizations === undefined
        ? {}
        : { name_localizations: choice.nameLocalizations }),
      value: choice.value,
    };
  });
}

export function ownerIds(host: CommandHost): ReadonlySet<string> {
  return host.ownerIds instanceof Set ? host.ownerIds : new Set(host.ownerIds);
}

function ephemeralOf(response: Sendable): boolean | undefined {
  if (typeof response === "string" || Array.isArray(response)) return undefined;
  const flags = (response as { flags?: unknown }).flags;
  if (typeof flags !== "number") return undefined;
  return (flags & MessageFlags.Ephemeral) !== 0;
}

export function stripEphemeralFlag(response: Sendable): Sendable {
  if (typeof response === "string" || Array.isArray(response)) return response;
  const flags = (response as { flags?: unknown }).flags;
  if (typeof flags !== "number" || (flags & MessageFlags.Ephemeral) === 0) return response;
  const payload = normalizeSendable(response as Sendable);
  return { ...payload, flags: flags & ~MessageFlags.Ephemeral };
}
