import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
} from "@eunia/types";
import type * as types from "@eunia/types";
import {
  type Interaction,
  type Message,
} from "@eunia/structures";
import {
  CommandRejection,
  CommandValidationError,
} from "./errors";
import { ResolvedOptions } from "./options";
import type {
  PreparedCommand,
  PreparedGroup,
  PreparedListener,
  PreparedNode,
} from "./prepare";
import type {
  CommandChoice,
  CommandHandleOptions,
  CommandPermissionNeeds,
  CommandHost,
  MessageCommandTarget,
  ResolvedCommandOption,
  UserCommandTarget,
} from "./types";
import { resolvePermissionBits } from "./permissions";

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
  readonly groups: readonly PreparedGroup[];
  readonly fieldName: string;
  readonly listener: PreparedListener;
}

export function collectListenerRoutes(
  node: PreparedNode,
  routes: Map<string, ListenerRoute>,
  groups: readonly PreparedGroup[] = [],
): void {
  if (node.nodeKind === "group") {
    for (const child of node.children) {
      collectListenerRoutes(child, routes, [...groups, node]);
    }
    return;
  }
  for (const [fieldName, listener] of node.listeners) {
    if (routes.has(listener.route)) {
      throw new CommandValidationError(
        `Listener identity for "${node.path.join(" ")} ${fieldName}" is already registered.`,
      );
    }
    routes.set(listener.route, {
      prepared: node,
      groups: Object.freeze([...groups]),
      fieldName,
      listener,
    });
  }
}

export function commandPath(resolved: {
  readonly command: PreparedCommand;
  readonly groups: readonly PreparedGroup[];
}): readonly string[] {
  return resolved.command.path;
}

export function applicationCommandKey(type: ApplicationCommandType, name: string): string {
  return `${type}:${name}`;
}

export function validateApplicationCommandCounts(
  commands: ReadonlyMap<string, PreparedNode>,
): void {
  const counts = new Map<ApplicationCommandType, number>();
  for (const command of commands.values()) {
    const type = command.applicationType;
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

export function optionValues(
  prepared: PreparedCommand,
  options: ResolvedOptions,
): Readonly<Record<string, ResolvedCommandOption | undefined>> {
  const values = Object.create(null) as Record<
    string,
    ResolvedCommandOption | undefined
  >;
  for (const name of prepared.fields.keys()) {
    values[name] = options.value(name);
  }
  return Object.freeze(values);
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
  let node = root;
  let cursor = 0;
  const groups: PreparedGroup[] = [];

  while (node.nodeKind === "group") {
    const token = tokens[cursor];
    if (token === undefined) {
      throw new CommandRejection(
        "invalid_input",
        groups.length === 0
          ? "Choose a subcommand."
          : "Choose a subcommand from the group.",
      );
    }
    const child = childByPrefixName(node, token, caseSensitive);
    if (child === undefined) {
      throw new CommandRejection(
        "invalid_input",
        `Unknown subcommand "${token}".`,
      );
    }
    groups.push(node);
    node = child;
    cursor += 1;
  }

  return {
    command: node,
    groups: Object.freeze(groups),
    arguments: tokens.slice(cursor),
  };
}

function childBySlashName(group: PreparedGroup, name: string): PreparedNode | undefined {
  return group.children.find(
    (child) =>
      child.applicationType === ApplicationCommandType.ChatInput &&
      child.definition.name === name,
  );
}

function childByPrefixName(
  group: PreparedGroup,
  name: string,
  caseSensitive: boolean,
): PreparedNode | undefined {
  return group.children.find(
    (child) => child.prefix && nameMatches(child, name, caseSensitive),
  );
}

export function nameMatches(
  node: PreparedNode,
  name: string,
  caseSensitive: boolean,
): boolean {
  const candidates = [node.definition.name, ...node.aliases];
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
  needs: CommandPermissionNeeds,
  signal?: AbortSignal,
): Promise<Pick<CommandHandleOptions, "userPermissions" | "botPermissions">> {
  const missing = {
    user: needs.user && options.userPermissions === undefined,
    bot: needs.bot && options.botPermissions === undefined,
  };
  const resolved =
    missing.user || missing.bot
      ? await options.resolvePermissions?.(missing, signal)
      : undefined;
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
