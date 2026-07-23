import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
} from "@eunia/types";
import { validateApplicationOptions } from "./application-option-validation";
import {
  characterLength,
  localizedLength,
  validateChatInputName,
  validateContextName,
  validateDescriptionLocalizations,
  validateLocalizedSiblingNames,
  validateNameLocalizations,
} from "./application-text-validation";
import type {
  CommandDefinition,
  CommandGroupDefinition,
  CommandOptionDefinition,
} from "./definition";
import { CommandValidationError } from "./errors";
import { resolvePermissionBits } from "./permissions";
import { validatePrefixOptions } from "./prefix-option-validation";
import type { PreparedCommand, PreparedGroup, PreparedNode } from "./prepare";
import type {
  CommandAccess,
  CommandRateLimit,
} from "./types";

const MAX_OPTIONS = 25;
const MAX_COMMAND_SIZE = 8_000;

export function validateCommandTree(
  node: PreparedNode,
  prefixCaseSensitive = false,
): void {
  validateNodeDefinition(node);
  if (node.prefix) {
    validatePrefixName(node.definition.name, "Command");
    validateAliases(
      node.aliases,
      node.definition.name,
      prefixCaseSensitive,
    );
  }
  validateNodeSettings(node);

  if (node.nodeKind === "command") {
    validateCommandOptions(node);
  } else {
    validateGroup(node, 0, prefixCaseSensitive);
  }
  if (
    node.applicationType !== undefined &&
    commandSize(node) > MAX_COMMAND_SIZE
  ) {
    throw new CommandValidationError(
      `Command "${node.definition.name}" exceeds Discord's 8000 character limit.`,
    );
  }
}

function validateGroup(
  group: PreparedGroup,
  depth: number,
  prefixCaseSensitive: boolean,
): void {
  if (group.children.length === 0) {
    throw new CommandValidationError(`Command group "${group.definition.name}" has no commands.`);
  }
  const published = applicationChildren(group);
  if (published.length > MAX_OPTIONS) {
    throw new CommandValidationError(
      `Command group "${group.definition.name}" cannot publish more than ${MAX_OPTIONS} children.`,
    );
  }

  validateApplicationSiblingNames(published, group.definition.name);
  validatePrefixSiblingNames(
    group.children.filter((child) => child.prefix),
    group.definition.name,
    prefixCaseSensitive,
  );
  for (const child of group.children) {
    validateNodeDefinition(child);
    if (child.applicationType === ApplicationCommandType.ChatInput) {
      validateNestedDefinition(child.definition);
    }
    if (child.prefix) {
      validatePrefixName(child.definition.name, "Command");
      validateAliases(
        child.aliases,
        child.definition.name,
        prefixCaseSensitive,
      );
    }
    validateNodeSettings(child);

    if (child.nodeKind === "group") {
      if (
        child.applicationType === ApplicationCommandType.ChatInput &&
        depth >= 1
      ) {
        throw new CommandValidationError(
          `Command group "${child.definition.name}" is nested more than one level deep.`,
        );
      }
      validateGroup(
        child,
        child.applicationType === ApplicationCommandType.ChatInput
          ? depth + 1
          : depth,
        prefixCaseSensitive,
      );
    } else {
      validateCommandOptions(child);
    }
  }
}

function validateApplicationSiblingNames(
  children: readonly PreparedNode[],
  parent: string,
): void {
  const names = new Set<string>();
  for (const child of children) {
    const key = child.definition.name.toLowerCase();
    if (names.has(key)) {
      throw new CommandValidationError(
        `Command group "${parent}" repeats the chat-input name "${child.definition.name}".`,
      );
    }
    names.add(key);
  }
  validateLocalizedSiblingNames(
    children.map((child) => child.definition),
    `Command group "${parent}"`,
  );
}

function validatePrefixSiblingNames(
  children: readonly PreparedNode[],
  parent: string,
  caseSensitive: boolean,
): void {
  const names = new Set<string>();
  for (const child of children) {
    for (const candidate of [child.definition.name, ...child.aliases]) {
      const key = caseSensitive ? candidate : candidate.toLowerCase();
      if (names.has(key)) {
        throw new CommandValidationError(
          `Command group "${parent}" repeats the prefix name or alias "${candidate}".`,
        );
      }
      names.add(key);
    }
  }
}

function validateNodeDefinition(node: PreparedNode): void {
  if (node.applicationType !== undefined) {
    validateDefinition(node.definition, node.applicationType);
    return;
  }
  validatePrefixName(node.definition.name, "Command");
  const length = characterLength(node.definition.description);
  if (length < 1) {
    throw new CommandValidationError(
      `Command "${node.definition.name}" needs a description.`,
    );
  }
}

function validateDefinition(
  definition: CommandDefinition | CommandGroupDefinition,
  type: ApplicationCommandType,
): void {
  const contextMenu =
    type === ApplicationCommandType.User ||
    type === ApplicationCommandType.Message;
  if (contextMenu) {
    validateContextName(definition.name, "Context command");
    validateNameLocalizations(definition.nameLocalizations, "Context command", true);
  } else {
    validateChatInputName(definition.name, "Command");
    validateNameLocalizations(definition.nameLocalizations, "Command");
  }
  const length = characterLength(definition.description);
  if (contextMenu && length !== 0) {
    throw new CommandValidationError(
      `Context command "${definition.name}" cannot declare a description.`,
    );
  }
  if (!contextMenu && (length < 1 || length > 100)) {
    throw new CommandValidationError(
      `Command "${definition.name}" needs a description between 1 and 100 characters.`,
    );
  }
  if (contextMenu && definition.descriptionLocalizations !== undefined) {
    throw new CommandValidationError(
      `Context command "${definition.name}" cannot localize a description.`,
    );
  }
  if (!contextMenu) {
    validateDescriptionLocalizations(definition.descriptionLocalizations, "Command");
  }
  if (
    definition.nsfw !== undefined &&
    typeof definition.nsfw !== "boolean"
  ) {
    throw new CommandValidationError(
      `Command "${definition.name}" has an invalid nsfw setting.`,
    );
  }
  if (
    definition.defaultMemberPermissions !== undefined &&
    definition.defaultMemberPermissions !== null
  ) {
    const permissions = resolvePermissionBits(definition.defaultMemberPermissions);
    if (permissions < 0n) {
      throw new CommandValidationError("Default member permissions cannot be negative.");
    }
  }
  if (definition.contexts !== undefined && definition.contexts !== null) {
    validateEnumList(
      definition.contexts,
      [
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ],
      "command context",
    );
  }
  if (definition.integrationTypes !== undefined) {
    validateEnumList(
      definition.integrationTypes,
      [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
      "integration type",
    );
  }
}

function validateNestedDefinition(definition: CommandDefinition | CommandGroupDefinition): void {
  if (
    definition.defaultMemberPermissions !== undefined ||
    definition.contexts !== undefined ||
    definition.integrationTypes !== undefined ||
    definition.nsfw !== undefined
  ) {
    throw new CommandValidationError(
      `Nested command "${definition.name}" cannot use root registration settings.`,
    );
  }
}

function validateAliases(
  aliases: readonly string[],
  name: string,
  caseSensitive: boolean,
): void {
  const identity = (value: string) =>
    caseSensitive ? value : value.toLowerCase();
  const seen = new Set([identity(name)]);
  for (const alias of aliases) {
    if (characterLength(alias) < 1 || /\s/u.test(alias)) {
      throw new CommandValidationError(
        `Alias "${alias}" must be one non-empty token.`,
      );
    }
    const key = identity(alias);
    if (seen.has(key)) {
      throw new CommandValidationError(`Command "${name}" repeats the alias "${alias}".`);
    }
    seen.add(key);
  }
}

function validateNodeSettings(node: PreparedNode): void {
  const instance = node.nodeKind === "command" ? node.command : node.group;
  validateAccess(instance.access, `Command "${node.definition.name}"`);
  for (const middleware of instance.middleware ?? []) {
    if (typeof middleware !== "function") {
      throw new CommandValidationError(`Command "${node.definition.name}" has invalid middleware.`);
    }
  }
  if (node.nodeKind === "command") {
    if (typeof node.command.run !== "function") {
      throw new CommandValidationError(
        `Command "${node.definition.name}" needs a run function.`,
      );
    }
    for (const [name, listener] of node.listeners) {
      if (typeof listener.field.handler !== "function") {
        throw new CommandValidationError(
          `Listener "${name}" on "${node.definition.name}" needs a handler function.`,
        );
      }
      if (typeof listener.field.inheritAccess !== "boolean") {
        throw new CommandValidationError(
          `Listener "${name}" on "${node.definition.name}" has an invalid inheritAccess setting.`,
        );
      }
      validateAccess(
        listener.field.access,
        `Listener "${name}" on "${node.definition.name}"`,
      );
      validateAutoDefer(
        listener.field.autoDefer,
        `Listener "${name}" on "${node.definition.name}"`,
        listener.field.kind === "modal",
      );
      if (listener.field.rateLimit !== undefined) {
        validateRateLimit(
          listener.field.rateLimit,
          `Listener "${name}" on "${node.definition.name}"`,
        );
      }
    }
    for (const [name, field] of node.fields) {
      if (
        field.autocomplete !== undefined &&
        typeof field.autocomplete !== "function"
      ) {
        throw new CommandValidationError(
          `Autocomplete for option "${name}" on "${node.definition.name}" must be a function.`,
        );
      }
    }
    if (node.command.rateLimit !== undefined) {
      validateRateLimit(
        node.command.rateLimit,
        `Command "${node.definition.name}"`,
      );
    }
    if ("autoDefer" in node.command) {
      validateAutoDefer(
        node.command.autoDefer,
        `Command "${node.definition.name}"`,
      );
    }
  }
}

function validateAutoDefer(
  value: boolean | import("./types").AutoDeferOptions | undefined,
  label: string,
  allowEphemeral = true,
): void {
  if (value === undefined || typeof value === "boolean") return;
  if (value === null || typeof value !== "object") {
    throw new CommandValidationError(
      `${label} has an invalid auto-defer setting.`,
    );
  }
  const afterMs = value.afterMs ?? 2_000;
  if (
    !Number.isFinite(afterMs) ||
    afterMs < 0 ||
    afterMs > 2_500
  ) {
    throw new CommandValidationError(
      `${label} needs an auto-defer delay between 0 and 2500 milliseconds.`,
    );
  }
  if (
    value.ephemeral !== undefined &&
    typeof value.ephemeral !== "boolean"
  ) {
    throw new CommandValidationError(
      `${label} has an invalid auto-defer visibility setting.`,
    );
  }
  if (!allowEphemeral && value.ephemeral !== undefined) {
    throw new CommandValidationError(
      `${label} cannot set visibility when deferring an update.`,
    );
  }
}

function validateAccess(
  access: CommandAccess | undefined,
  label: string,
): void {
  if (access === undefined) return;
  if (
    (access.guildOnly !== undefined &&
      typeof access.guildOnly !== "boolean") ||
    (access.ownerOnly !== undefined &&
      typeof access.ownerOnly !== "boolean")
  ) {
    throw new CommandValidationError(
      `${label} has an invalid access setting.`,
    );
  }
  if (
    access.userPermissions !== undefined &&
    resolvePermissionBits(access.userPermissions) < 0n
  ) {
    throw new CommandValidationError(
      `${label} has negative user permissions.`,
    );
  }
  if (
    access.botPermissions !== undefined &&
    resolvePermissionBits(access.botPermissions) < 0n
  ) {
    throw new CommandValidationError(
      `${label} has negative bot permissions.`,
    );
  }
  for (const guard of access.guards ?? []) {
    if (typeof guard !== "function") {
      throw new CommandValidationError(
        `${label} has an invalid guard.`,
      );
    }
  }
}

function validatePrefixName(name: string, label: string): void {
  const length = characterLength(name);
  if (length < 1 || /\s/u.test(name)) {
    throw new CommandValidationError(
      `${label} name "${name}" must be one non-empty token.`,
    );
  }
}

function validateRateLimit(
  rateLimit: CommandRateLimit,
  label: string,
): void {
  if (!Number.isSafeInteger(rateLimit.limit) || rateLimit.limit < 1) {
    throw new CommandValidationError(
      `${label} needs a positive integer rate limit.`,
    );
  }
  if (!Number.isSafeInteger(rateLimit.windowMs) || rateLimit.windowMs <= 0) {
    throw new CommandValidationError(
      `${label} needs a positive integer cooldown window.`,
    );
  }
  if (
    rateLimit.scope !== undefined &&
    !["user", "channel", "guild", "global"].includes(rateLimit.scope)
  ) {
    throw new CommandValidationError(
      `${label} has an unknown cooldown scope.`,
    );
  }
}

function validateCommandOptions(command: PreparedCommand): void {
  const options = command.definition.options ?? [];
  if (command.applicationType === ApplicationCommandType.ChatInput) {
    validateApplicationOptions(options);
  }
  if (command.prefix) {
    validatePrefixOptions(
      options,
      command.applicationType === undefined,
    );
  } else {
    const rest = options.find(
      (option) =>
        option.type === ApplicationCommandOptionType.String &&
        option.prefix?.rest === true,
    );
    if (rest !== undefined) {
      throw new CommandValidationError(
        `Option "${rest.name}" has prefix settings on a command without a prefix route.`,
      );
    }
  }
}

function commandSize(node: PreparedNode): number {
  if (node.applicationType === undefined) return 0;
  const own =
    localizedLength(node.definition.name, node.definition.nameLocalizations) +
    localizedLength(node.definition.description, node.definition.descriptionLocalizations);
  if (node.nodeKind === "group") {
    return (
      own +
      applicationChildren(node).reduce(
        (total, child) => total + commandSize(child),
        0,
      )
    );
  }
  return own + (node.definition.options ?? []).reduce(
    (total, option) => total + optionSize(option),
    0,
  );
}

function applicationChildren(group: PreparedGroup): readonly PreparedNode[] {
  return group.children.filter(
    (child) =>
      child.applicationType === ApplicationCommandType.ChatInput,
  );
}

function optionSize(option: CommandOptionDefinition): number {
  let size =
    localizedLength(option.name, option.nameLocalizations) +
    localizedLength(option.description, option.descriptionLocalizations);
  if (
    option.type === ApplicationCommandOptionType.String ||
    option.type === ApplicationCommandOptionType.Integer ||
    option.type === ApplicationCommandOptionType.Number
  ) {
    for (const choice of option.choices ?? []) {
      size += localizedLength(choice.name, choice.nameLocalizations);
      size += characterLength(`${choice.value}`);
    }
  }
  return size;
}

function validateEnumList<T extends number>(
  values: readonly T[],
  allowed: readonly T[],
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new CommandValidationError(`A ${label} cannot be listed more than once.`);
  }
  const known = new Set<number>(allowed);
  if (values.some((value) => !known.has(value))) {
    throw new CommandValidationError(`The command has an unknown ${label}.`);
  }
}
