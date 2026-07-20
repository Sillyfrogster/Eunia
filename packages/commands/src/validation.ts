import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  PermissionFlags,
  type PermissionInput,
} from "@eunia/types";
import type * as types from "@eunia/types";
import type { Command, CommandGroup } from "./command";
import type {
  CommandDefinition,
  CommandGroupDefinition,
  CommandOptionDefinition,
} from "./definition";
import { CommandValidationError } from "./errors";
import type { PreparedCommand, PreparedGroup, PreparedNode } from "./prepare";
import type { CommandChoice, CommandRateLimit } from "./types";

const CHAT_INPUT_NAME = /^[-_'\p{L}\p{N}\p{sc=Devanagari}\p{sc=Thai}]{1,32}$/u;
const MAX_OPTIONS = 25;
const MAX_COMMAND_SIZE = 8_000;
const MAX_NUMBER = 2 ** 53;

function instanceOf(node: PreparedNode): Command | CommandGroup {
  return node.nodeKind === "command" ? node.command : node.group;
}

export function validateCommandTree(node: PreparedNode): void {
  validateDefinition(node.definition);
  validateAliases(instanceOf(node).aliases, node.definition.name);
  validateNodeSettings(node);

  if (node.nodeKind === "command") {
    validateOptions(node.definition.options ?? []);
  } else {
    validateGroup(node, 0);
  }
  if (commandSize(node) > MAX_COMMAND_SIZE) {
    throw new CommandValidationError(
      `Command "${node.definition.name}" exceeds Discord's 8000 character limit.`,
    );
  }
}

export function serializeCommand(
  node: PreparedNode,
  scope: "global" | "guild" = "global",
): types.ApplicationCommandCreate {
  const root = serializeRoot(node.definition, scope);
  if (node.nodeKind === "command") {
    const options = node.definition.options?.map(serializeOption);
    return options === undefined || options.length === 0 ? root : { ...root, options };
  }

  return {
    ...root,
    options: node.children.map((child) => serializeBranch(child)),
  };
}

export function resolvePermissionBits(value: PermissionInput): bigint {
  if (Array.isArray(value)) {
    return value.reduce<bigint>((bits, permission) => bits | permission, 0n);
  }
  try {
    return BigInt(value as bigint | string);
  } catch {
    throw new CommandValidationError("Permission values must be valid bitfields.");
  }
}

export function hasPermissions(actual: bigint, required: bigint): boolean {
  return (
    (actual & PermissionFlags.Administrator) === PermissionFlags.Administrator ||
    (actual & required) === required
  );
}

function validateGroup(group: PreparedGroup, depth: number): void {
  if (group.children.length === 0) {
    throw new CommandValidationError(`Command group "${group.definition.name}" has no commands.`);
  }
  if (group.children.length > MAX_OPTIONS) {
    throw new CommandValidationError(
      `Command group "${group.definition.name}" cannot have more than ${MAX_OPTIONS} children.`,
    );
  }

  validateSiblingNames(group.children, group.definition.name);
  for (const child of group.children) {
    validateDefinition(child.definition);
    validateNestedDefinition(child.definition);
    validateAliases(instanceOf(child).aliases, child.definition.name);
    validateNodeSettings(child);

    if (child.nodeKind === "group") {
      if (depth >= 1) {
        throw new CommandValidationError(
          `Command group "${child.definition.name}" is nested more than one level deep.`,
        );
      }
      validateGroup(child, depth + 1);
    } else {
      validateOptions(child.definition.options ?? []);
    }
  }
}

function validateSiblingNames(children: readonly PreparedNode[], parent: string): void {
  const names = new Set<string>();
  for (const child of children) {
    for (const candidate of [child.definition.name, ...instanceOf(child).aliases]) {
      const key = candidate.toLowerCase();
      if (names.has(key)) {
        throw new CommandValidationError(
          `Command group "${parent}" contains the duplicate name or alias "${candidate}".`,
        );
      }
      names.add(key);
    }
  }
  validateLocalizedSiblingNames(
    children.map((child) => child.definition),
    `Command group "${parent}"`,
  );
}

function validateDefinition(definition: CommandDefinition | CommandGroupDefinition): void {
  validateName(definition.name, "Command");
  validateNameLocalizations(definition.nameLocalizations, "Command");
  const length = characterLength(definition.description);
  if (length < 1 || length > 100) {
    throw new CommandValidationError(
      `Command "${definition.name}" needs a description between 1 and 100 characters.`,
    );
  }
  validateDescriptionLocalizations(definition.descriptionLocalizations, "Command");
  if (definition.defaultMemberPermissions !== undefined && definition.defaultMemberPermissions !== null) {
    const permissions = resolvePermissionBits(definition.defaultMemberPermissions);
    if (permissions < 0n) {
      throw new CommandValidationError("Default member permissions cannot be negative.");
    }
  }
  if (definition.contexts !== undefined && definition.contexts !== null) {
    validateEnumList(
      definition.contexts,
      [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel],
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

function validateAliases(aliases: readonly string[], name: string): void {
  const seen = new Set([name.toLowerCase()]);
  for (const alias of aliases) {
    if (characterLength(alias) < 1 || characterLength(alias) > 32 || /\s/u.test(alias)) {
      throw new CommandValidationError(`Alias "${alias}" must be one token with at most 32 characters.`);
    }
    const key = alias.toLowerCase();
    if (seen.has(key)) {
      throw new CommandValidationError(`Command "${name}" repeats the alias "${alias}".`);
    }
    seen.add(key);
  }
}

function validateNodeSettings(node: PreparedNode): void {
  const instance = instanceOf(node);
  if (instance.userPermissions !== undefined && resolvePermissionBits(instance.userPermissions) < 0n) {
    throw new CommandValidationError("User permissions cannot be negative.");
  }
  if (instance.botPermissions !== undefined && resolvePermissionBits(instance.botPermissions) < 0n) {
    throw new CommandValidationError("Bot permissions cannot be negative.");
  }
  for (const middleware of instance.middleware) {
    if (typeof middleware !== "function") {
      throw new CommandValidationError(`Command "${node.definition.name}" has invalid middleware.`);
    }
  }
  for (const guard of instance.guards) {
    if (typeof guard !== "function") {
      throw new CommandValidationError(`Command "${node.definition.name}" has an invalid guard.`);
    }
  }
  if (node.nodeKind === "command") {
    if (node.command.rateLimit !== undefined) {
      validateRateLimit(node.command.rateLimit, node.definition.name);
    }
    if (typeof node.command.autoDefer === "object") {
      const afterMs = node.command.autoDefer.afterMs ?? 2_000;
      if (!Number.isFinite(afterMs) || afterMs < 0 || afterMs > 2_500) {
        throw new CommandValidationError("Auto-defer delays must be between 0 and 2500 milliseconds.");
      }
    }
  }
}

function validateRateLimit(rateLimit: CommandRateLimit, name: string): void {
  if (!Number.isSafeInteger(rateLimit.limit) || rateLimit.limit < 1) {
    throw new CommandValidationError(`Command "${name}" needs a positive integer rate limit.`);
  }
  if (!Number.isSafeInteger(rateLimit.windowMs) || rateLimit.windowMs <= 0) {
    throw new CommandValidationError(
      `Command "${name}" needs a positive integer cooldown window.`,
    );
  }
  if (
    rateLimit.scope !== undefined &&
    !["user", "channel", "guild", "global"].includes(rateLimit.scope)
  ) {
    throw new CommandValidationError(`Command "${name}" has an unknown cooldown scope.`);
  }
}

function validateOptions(options: readonly CommandOptionDefinition[]): void {
  if (options.length > MAX_OPTIONS) {
    throw new CommandValidationError(`Commands cannot have more than ${MAX_OPTIONS} options.`);
  }

  const names = new Set<string>();
  validateLocalizedSiblingNames(options, "Command options");
  let sawOptional = false;
  for (const [index, option] of options.entries()) {
    validateName(option.name, "Option");
    validateNameLocalizations(option.nameLocalizations, "Option");
    const descriptionLength = characterLength(option.description);
    if (descriptionLength < 1 || descriptionLength > 100) {
      throw new CommandValidationError(
        `Option "${option.name}" needs a description between 1 and 100 characters.`,
      );
    }
    validateDescriptionLocalizations(option.descriptionLocalizations, "Option");
    if (names.has(option.name)) {
      throw new CommandValidationError(`Option "${option.name}" is declared more than once.`);
    }
    names.add(option.name);

    if (option.required === true && sawOptional) {
      throw new CommandValidationError("Required command options must come before optional options.");
    }
    if (option.required !== true) sawOptional = true;
    validateOptionRules(option, index, options.length);
  }
}

function validateOptionRules(
  option: CommandOptionDefinition,
  index: number,
  optionCount: number,
): void {
  switch (option.type) {
    case ApplicationCommandOptionType.String:
      validateChoices(option.choices, "string");
      validateAutocomplete(option.autocomplete, option.choices, option.name);
      validateStringLengthRange(option.minLength, option.maxLength, option.name);
      if (option.prefix?.rest === true && index !== optionCount - 1) {
        throw new CommandValidationError(`Rest option "${option.name}" must be the last option.`);
      }
      return;
    case ApplicationCommandOptionType.Integer:
      validateChoices(option.choices, "number", true);
      validateAutocomplete(option.autocomplete, option.choices, option.name);
      validateNumericRange(option.minValue, option.maxValue, option.name, true);
      return;
    case ApplicationCommandOptionType.Number:
      validateChoices(option.choices, "number");
      validateAutocomplete(option.autocomplete, option.choices, option.name);
      validateNumericRange(option.minValue, option.maxValue, option.name, false);
      return;
    case ApplicationCommandOptionType.Channel:
      if (option.channelTypes !== undefined && new Set(option.channelTypes).size !== option.channelTypes.length) {
        throw new CommandValidationError(`Option "${option.name}" repeats a channel type.`);
      }
      if (option.channelTypes !== undefined) {
        validateEnumList(
          option.channelTypes,
          Object.values(ChannelType).filter((value): value is ChannelType => typeof value === "number"),
          "channel type",
        );
      }
      return;
    case ApplicationCommandOptionType.Boolean:
    case ApplicationCommandOptionType.User:
    case ApplicationCommandOptionType.Role:
    case ApplicationCommandOptionType.Mentionable:
    case ApplicationCommandOptionType.Attachment:
      return;
    default:
      throw new CommandValidationError(`Option "${(option as CommandOptionDefinition).name}" has an invalid type.`);
  }
}

function validateChoices(
  choices: readonly CommandChoice[] | undefined,
  expected: "string" | "number",
  integersOnly = false,
): void {
  if (choices === undefined) return;
  if (choices.length === 0) throw new CommandValidationError("Choice lists cannot be empty.");
  if (choices.length > 25) throw new CommandValidationError("Options cannot have more than 25 choices.");

  const names = new Set<string>();
  const values = new Set<string | number>();
  for (const choice of choices) {
    if (characterLength(choice.name) < 1 || characterLength(choice.name) > 100) {
      throw new CommandValidationError("Choice names must have between 1 and 100 characters.");
    }
    validateDescriptionLocalizations(choice.nameLocalizations, "Choice");
    if (typeof choice.value !== expected) {
      throw new CommandValidationError(`Choice "${choice.name}" has the wrong value type.`);
    }
    if (typeof choice.value === "string" && characterLength(choice.value) > 100) {
      throw new CommandValidationError(`Choice "${choice.name}" cannot exceed 100 characters.`);
    }
    if (
      typeof choice.value === "number" &&
      (!Number.isFinite(choice.value) ||
        Math.abs(choice.value) > (integersOnly ? Number.MAX_SAFE_INTEGER : MAX_NUMBER) ||
        (integersOnly && !Number.isSafeInteger(choice.value)))
    ) {
      throw new CommandValidationError(`Choice "${choice.name}" must be a finite${integersOnly ? " integer" : " number"}.`);
    }
    if (names.has(choice.name) || values.has(choice.value)) {
      throw new CommandValidationError(`Choice "${choice.name}" is declared more than once.`);
    }
    names.add(choice.name);
    values.add(choice.value);
  }
}

function validateAutocomplete(
  autocomplete: boolean | undefined,
  choices: readonly CommandChoice[] | undefined,
  name: string,
): void {
  if (autocomplete === true && choices !== undefined) {
    throw new CommandValidationError(`Option "${name}" cannot use choices and autocomplete together.`);
  }
}

function validateStringLengthRange(
  minimum: number | undefined,
  maximum: number | undefined,
  name: string,
): void {
  if (
    minimum !== undefined &&
    (!Number.isSafeInteger(minimum) || minimum < 0 || minimum > 6_000)
  ) {
    throw new CommandValidationError(
      `Option "${name}" minimum length must be an integer from 0 to 6000.`,
    );
  }
  if (
    maximum !== undefined &&
    (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 6_000)
  ) {
    throw new CommandValidationError(
      `Option "${name}" maximum length must be an integer from 1 to 6000.`,
    );
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new CommandValidationError(`Option "${name}" has a minimum above its maximum.`);
  }
}

function validateNumericRange(
  minimum: number | undefined,
  maximum: number | undefined,
  name: string,
  integersOnly: boolean,
): void {
  for (const value of [minimum, maximum]) {
    if (
      value !== undefined &&
      (!Number.isFinite(value) ||
        Math.abs(value) > (integersOnly ? Number.MAX_SAFE_INTEGER : MAX_NUMBER) ||
        (integersOnly && !Number.isSafeInteger(value)))
    ) {
      throw new CommandValidationError(
        `Option "${name}" needs ${integersOnly ? "integer" : "finite"} number limits.`,
      );
    }
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new CommandValidationError(`Option "${name}" has a minimum above its maximum.`);
  }
}

function validateName(name: string, label: string): void {
  if (!CHAT_INPUT_NAME.test(name) || name !== name.toLowerCase()) {
    throw new CommandValidationError(
      `${label} name "${name}" must follow Discord's lowercase chat input name rules.`,
    );
  }
}

function serializeRoot(
  definition: CommandDefinition | CommandGroupDefinition,
  scope: "global" | "guild",
): types.ChatInputApplicationCommandCreate {
  return {
    name: definition.name,
    ...(definition.nameLocalizations === undefined
      ? {}
      : { name_localizations: definition.nameLocalizations }),
    description: definition.description,
    ...(definition.descriptionLocalizations === undefined
      ? {}
      : { description_localizations: definition.descriptionLocalizations }),
    type: ApplicationCommandType.ChatInput,
    ...(definition.defaultMemberPermissions === undefined
      ? {}
      : {
          default_member_permissions:
            definition.defaultMemberPermissions === null
              ? null
              : `${resolvePermissionBits(definition.defaultMemberPermissions)}` as `${bigint}`,
        }),
    ...(scope === "guild" || definition.contexts === undefined
      ? {}
      : { contexts: definition.contexts === null ? null : [...definition.contexts] }),
    ...(scope === "guild" || definition.integrationTypes === undefined
      ? {}
      : { integration_types: [...definition.integrationTypes] }),
    ...(definition.nsfw === undefined ? {} : { nsfw: definition.nsfw }),
  };
}

function serializeBranch(
  node: PreparedNode,
): types.ApplicationCommandSubcommandOption | types.ApplicationCommandSubcommandGroupOption {
  if (node.nodeKind === "group") {
    return {
      type: ApplicationCommandOptionType.SubcommandGroup,
      name: node.definition.name,
      ...(node.definition.nameLocalizations === undefined
        ? {}
        : { name_localizations: node.definition.nameLocalizations }),
      description: node.definition.description,
      ...(node.definition.descriptionLocalizations === undefined
        ? {}
        : { description_localizations: node.definition.descriptionLocalizations }),
      options: node.children.map((child) => {
        if (child.nodeKind === "group") {
          throw new CommandValidationError(
            `Command group "${child.definition.name}" is nested more than one level deep.`,
          );
        }
        return serializeSubcommand(child);
      }),
    };
  }
  return serializeSubcommand(node);
}

function serializeSubcommand(node: PreparedCommand): types.ApplicationCommandSubcommandOption {
  return {
    type: ApplicationCommandOptionType.Subcommand,
    name: node.definition.name,
    ...(node.definition.nameLocalizations === undefined
      ? {}
      : { name_localizations: node.definition.nameLocalizations }),
    description: node.definition.description,
    ...(node.definition.descriptionLocalizations === undefined
      ? {}
      : { description_localizations: node.definition.descriptionLocalizations }),
    ...(node.definition.options === undefined || node.definition.options.length === 0
      ? {}
      : { options: node.definition.options.map(serializeOption) }),
  };
}

function serializeOption(option: CommandOptionDefinition): types.ApplicationCommandBasicOption {
  const common = {
    name: option.name,
    ...(option.nameLocalizations === undefined
      ? {}
      : { name_localizations: option.nameLocalizations }),
    description: option.description,
    ...(option.descriptionLocalizations === undefined
      ? {}
      : { description_localizations: option.descriptionLocalizations }),
    ...(option.required === undefined ? {} : { required: option.required }),
  };

  switch (option.type) {
    case ApplicationCommandOptionType.String:
      return {
        ...common,
        type: ApplicationCommandOptionType.String,
        ...(option.autocomplete === true
          ? { autocomplete: true as const }
          : {
              ...(option.choices === undefined
                ? {}
                : { choices: option.choices.map(serializeChoice) }),
              ...(option.autocomplete === false
                ? { autocomplete: false as const }
                : {}),
            }),
        ...(option.minLength === undefined ? {} : { min_length: option.minLength }),
        ...(option.maxLength === undefined ? {} : { max_length: option.maxLength }),
      };
    case ApplicationCommandOptionType.Integer:
      return {
        ...common,
        type: ApplicationCommandOptionType.Integer,
        ...(option.autocomplete === true
          ? { autocomplete: true as const }
          : {
              ...(option.choices === undefined
                ? {}
                : { choices: option.choices.map(serializeChoice) }),
              ...(option.autocomplete === false
                ? { autocomplete: false as const }
                : {}),
            }),
        ...(option.minValue === undefined ? {} : { min_value: option.minValue }),
        ...(option.maxValue === undefined ? {} : { max_value: option.maxValue }),
      };
    case ApplicationCommandOptionType.Number:
      return {
        ...common,
        type: ApplicationCommandOptionType.Number,
        ...(option.autocomplete === true
          ? { autocomplete: true as const }
          : {
              ...(option.choices === undefined
                ? {}
                : { choices: option.choices.map(serializeChoice) }),
              ...(option.autocomplete === false
                ? { autocomplete: false as const }
                : {}),
            }),
        ...(option.minValue === undefined ? {} : { min_value: option.minValue }),
        ...(option.maxValue === undefined ? {} : { max_value: option.maxValue }),
      };
    case ApplicationCommandOptionType.Channel:
      return {
        ...common,
        type: ApplicationCommandOptionType.Channel,
        ...(option.channelTypes === undefined ? {} : { channel_types: [...option.channelTypes] }),
      };
    case ApplicationCommandOptionType.Boolean:
      return { ...common, type: ApplicationCommandOptionType.Boolean };
    case ApplicationCommandOptionType.User:
      return { ...common, type: ApplicationCommandOptionType.User };
    case ApplicationCommandOptionType.Role:
      return { ...common, type: ApplicationCommandOptionType.Role };
    case ApplicationCommandOptionType.Mentionable:
      return { ...common, type: ApplicationCommandOptionType.Mentionable };
    case ApplicationCommandOptionType.Attachment:
      return { ...common, type: ApplicationCommandOptionType.Attachment };
  }
}

function characterLength(value: string): number {
  return [...value].length;
}

function validateLocalizedSiblingNames(
  definitions: ReadonlyArray<{
    readonly name: string;
    readonly nameLocalizations?: CommandDefinition["nameLocalizations"];
  }>,
  label: string,
): void {
  const locales = new Set<string>();
  const defaults = new Map(definitions.map((definition) => [definition.name, definition]));
  for (const definition of definitions) {
    for (const [locale, localized] of Object.entries(definition.nameLocalizations ?? {})) {
      locales.add(locale);
      if (
        localized !== null &&
        localized !== undefined &&
        localized !== definition.name &&
        defaults.has(localized)
      ) {
        throw new CommandValidationError(
          `${label} uses the default name "${localized}" as a localization.`,
        );
      }
    }
  }
  for (const locale of locales) {
    const names = new Set<string>();
    for (const definition of definitions) {
      const localizations = definition.nameLocalizations as
        | Readonly<Record<string, string | null | undefined>>
        | undefined;
      const name = localizations?.[locale] ?? definition.name;
      if (names.has(name)) {
        throw new CommandValidationError(
          `${label} repeats the localized name "${name}" for ${locale}.`,
        );
      }
      names.add(name);
    }
  }
}

function commandSize(node: PreparedNode): number {
  const own =
    localizedLength(node.definition.name, node.definition.nameLocalizations) +
    localizedLength(node.definition.description, node.definition.descriptionLocalizations);
  if (node.nodeKind === "group") {
    return own + node.children.reduce((total, child) => total + commandSize(child), 0);
  }
  return own + (node.definition.options ?? []).reduce(
    (total, option) => total + optionSize(option),
    0,
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

function localizedLength(
  fallback: string,
  localizations: CommandDefinition["nameLocalizations"],
): number {
  let longest = characterLength(fallback);
  for (const value of Object.values(localizations ?? {})) {
    if (value !== null && value !== undefined) {
      longest = Math.max(longest, characterLength(value));
    }
  }
  return longest;
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

function serializeChoice<T extends string | number>(
  choice: CommandChoice<T>,
): types.ApplicationCommandChoice<T> {
  return {
    name: choice.name,
    ...(choice.nameLocalizations === undefined
      ? {}
      : { name_localizations: choice.nameLocalizations }),
    value: choice.value,
  };
}

function validateNameLocalizations(
  localizations: CommandDefinition["nameLocalizations"],
  label: string,
): void {
  if (localizations === undefined) return;
  for (const value of Object.values(localizations)) {
    if (value !== null && value !== undefined) validateName(value, `${label} localization`);
  }
}

function validateDescriptionLocalizations(
  localizations:
    | CommandDefinition["descriptionLocalizations"]
    | CommandChoice["nameLocalizations"],
  label: string,
): void {
  if (localizations === undefined) return;
  for (const value of Object.values(localizations)) {
    if (value === null || value === undefined) continue;
    const length = characterLength(value);
    if (length < 1 || length > 100) {
      throw new CommandValidationError(
        `${label} localizations must have between 1 and 100 characters.`,
      );
    }
  }
}
