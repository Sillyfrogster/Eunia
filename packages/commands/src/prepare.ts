/**
 * Registration-time preparation: discovers option and listener fields on a
 * command instance, assigns their wire names from the field keys, validates
 * kind applicability fail-fast, and builds the internal definitions the
 * validator and serializer consume.
 */
import { ApplicationCommandOptionType } from "@eunia/types";
import {
  Command,
  CommandGroup,
  type CommandKind,
  type CommandNode,
  type CommandNodeClass,
} from "./command";
import type {
  CommandDefinition,
  CommandGroupDefinition,
  CommandOptionDefinition,
} from "./definition";
import { CommandValidationError } from "./errors";
import { OptionField, type ChannelOptionConfig, type NumericOptionConfig, type StringOptionConfig } from "./fields";
import { isListenerField, type ListenerField } from "./listeners";

export interface PreparedCommand {
  readonly nodeKind: "command";
  readonly command: Command;
  readonly commandKind: CommandKind;
  readonly definition: CommandDefinition;
  readonly options: readonly CommandOptionDefinition[];
  readonly fields: ReadonlyMap<string, OptionField<unknown, boolean>>;
  readonly listeners: ReadonlyMap<string, ListenerField>;
}

export interface PreparedGroup {
  readonly nodeKind: "group";
  readonly group: CommandGroup;
  readonly commandKind: CommandKind;
  readonly definition: CommandGroupDefinition;
  readonly children: readonly PreparedNode[];
}

export type PreparedNode = PreparedCommand | PreparedGroup;

export function prepareNode(node: CommandNode): PreparedNode {
  return node instanceof Command ? prepareCommand(node) : prepareGroup(node);
}

export function instantiateNode(ctor: CommandNodeClass): CommandNode {
  const instance = new ctor();
  if (!(instance instanceof Command) && !(instance instanceof CommandGroup)) {
    throw new CommandValidationError(
      "Command group children must be Command or CommandGroup classes.",
    );
  }
  return instance;
}

const COMMAND_KINDS: ReadonlySet<string> = new Set(["slash", "prefix", "hybrid"]);

function prepareCommand(command: Command): PreparedCommand {
  if (!COMMAND_KINDS.has(command.kind)) {
    throw new CommandValidationError(
      `Command "${command.name}" declares the unknown kind "${command.kind}".`,
    );
  }

  const fields = new Map<string, OptionField<unknown, boolean>>();
  const listeners = new Map<string, ListenerField>();
  const options: CommandOptionDefinition[] = [];

  for (const [key, value] of Object.entries(command)) {
    if (value instanceof OptionField) {
      if (value.name.length > 0 && value.name !== key) {
        throw new CommandValidationError(
          `Option field "${key}" on "${command.name}" is already registered as "${value.name}".`,
        );
      }
      value.name = key;
      fields.set(key, value);
      options.push(optionDefinition(command, key, value));
    } else if (isListenerField(value)) {
      const route = `${command.name}.${key}`;
      if (value.route.length > 0 && value.route !== route) {
        throw new CommandValidationError(
          `Listener field "${key}" on "${command.name}" is already registered as "${value.route}".`,
        );
      }
      value.route = route;
      if ([...route].length > 90) {
        throw new CommandValidationError(
          `Listener route "${route}" leaves no room for args in the 100-character custom_id.`,
        );
      }
      listeners.set(key, value);
    }
  }

  validateKindApplicability(command, options);

  const definition: CommandDefinition = {
    name: command.name,
    ...(command.nameLocalizations === undefined
      ? {}
      : { nameLocalizations: command.nameLocalizations }),
    description: command.description,
    ...(command.descriptionLocalizations === undefined
      ? {}
      : { descriptionLocalizations: command.descriptionLocalizations }),
    ...(options.length === 0 ? {} : { options }),
    ...(command.defaultMemberPermissions === undefined
      ? {}
      : { defaultMemberPermissions: command.defaultMemberPermissions }),
    ...(command.contexts === undefined ? {} : { contexts: command.contexts }),
    ...(command.integrationTypes === undefined
      ? {}
      : { integrationTypes: command.integrationTypes }),
    ...(command.nsfw === undefined ? {} : { nsfw: command.nsfw }),
  };

  return {
    nodeKind: "command",
    command,
    commandKind: command.kind,
    definition,
    options,
    fields,
    listeners,
  };
}

function prepareGroup(group: CommandGroup): PreparedGroup {
  if (group.children.length === 0) {
    throw new CommandValidationError(`Command group "${group.name}" has no commands.`);
  }
  const children = group.children.map((ctor) => prepareNode(instantiateNode(ctor)));

  const kinds = new Set(children.map((child) => child.commandKind));
  if (kinds.size !== 1) {
    throw new CommandValidationError(
      `Command group "${group.name}" mixes command kinds; children must share one kind.`,
    );
  }
  const commandKind = children[0]!.commandKind;
  if (commandKind === "slash" && group.aliases.length > 0) {
    throw new CommandValidationError(
      `Command group "${group.name}" declares aliases but its commands are slash-only.`,
    );
  }
  if (commandKind === "prefix" && hasRootRegistrationSettings(group)) {
    throw new CommandValidationError(
      `Command group "${group.name}" declares slash registration settings but its commands are prefix-only.`,
    );
  }

  const definition: CommandGroupDefinition = {
    name: group.name,
    ...(group.nameLocalizations === undefined
      ? {}
      : { nameLocalizations: group.nameLocalizations }),
    description: group.description,
    ...(group.descriptionLocalizations === undefined
      ? {}
      : { descriptionLocalizations: group.descriptionLocalizations }),
    ...(group.defaultMemberPermissions === undefined
      ? {}
      : { defaultMemberPermissions: group.defaultMemberPermissions }),
    ...(group.contexts === undefined ? {} : { contexts: group.contexts }),
    ...(group.integrationTypes === undefined
      ? {}
      : { integrationTypes: group.integrationTypes }),
    ...(group.nsfw === undefined ? {} : { nsfw: group.nsfw }),
  };

  return { nodeKind: "group", group, commandKind, definition, children };
}

function validateKindApplicability(
  command: Command,
  options: readonly CommandOptionDefinition[],
): void {
  if (command.kind === "slash") {
    if (command.aliases.length > 0) {
      throw new CommandValidationError(
        `Command "${command.name}" declares aliases, which have no effect on a slash command.`,
      );
    }
    const restOption = options.find(
      (option) => "prefix" in option && option.prefix !== undefined,
    );
    if (restOption !== undefined) {
      throw new CommandValidationError(
        `Option "${restOption.name}" on "${command.name}" declares prefix parsing on a slash command.`,
      );
    }
  }

  if (command.kind === "prefix") {
    const inert: string[] = [];
    if (command.autoDefer !== undefined) inert.push("autoDefer");
    if (command.defaultMemberPermissions !== undefined) inert.push("defaultMemberPermissions");
    if (command.contexts !== undefined) inert.push("contexts");
    if (command.integrationTypes !== undefined) inert.push("integrationTypes");
    if (command.nsfw !== undefined) inert.push("nsfw");
    if (command.nameLocalizations !== undefined) inert.push("nameLocalizations");
    if (command.descriptionLocalizations !== undefined) inert.push("descriptionLocalizations");
    if (inert.length > 0) {
      throw new CommandValidationError(
        `Command "${command.name}" declares ${inert.join(", ")}, which have no effect on a prefix command.`,
      );
    }
    const autocompleteOption = options.find(
      (option) => "autocomplete" in option && option.autocomplete === true,
    );
    if (autocompleteOption !== undefined) {
      throw new CommandValidationError(
        `Option "${autocompleteOption.name}" on "${command.name}" declares autocomplete on a prefix command.`,
      );
    }
  }
}

function hasRootRegistrationSettings(group: CommandGroup): boolean {
  return (
    group.defaultMemberPermissions !== undefined ||
    group.contexts !== undefined ||
    group.integrationTypes !== undefined ||
    group.nsfw !== undefined ||
    group.nameLocalizations !== undefined ||
    group.descriptionLocalizations !== undefined
  );
}

function optionDefinition(
  command: Command,
  name: string,
  field: OptionField<unknown, boolean>,
): CommandOptionDefinition {
  const config = field.config;
  const base = {
    name,
    ...(config.nameLocalizations === undefined
      ? {}
      : { nameLocalizations: config.nameLocalizations }),
    description:
      config.description ?? (command.kind === "prefix" ? name : ""),
    ...(config.descriptionLocalizations === undefined
      ? {}
      : { descriptionLocalizations: config.descriptionLocalizations }),
    ...(config.required === undefined ? {} : { required: config.required }),
  };

  switch (field.type) {
    case ApplicationCommandOptionType.String: {
      const string = config as StringOptionConfig;
      return {
        ...base,
        type: field.type,
        ...(string.choices === undefined ? {} : { choices: string.choices }),
        ...(string.autocomplete === undefined ? {} : { autocomplete: string.autocomplete }),
        ...(string.minLength === undefined ? {} : { minLength: string.minLength }),
        ...(string.maxLength === undefined ? {} : { maxLength: string.maxLength }),
        ...(string.prefix === undefined ? {} : { prefix: string.prefix }),
      };
    }
    case ApplicationCommandOptionType.Integer:
    case ApplicationCommandOptionType.Number: {
      const numeric = config as NumericOptionConfig;
      return {
        ...base,
        type: field.type,
        ...(numeric.choices === undefined ? {} : { choices: numeric.choices }),
        ...(numeric.autocomplete === undefined ? {} : { autocomplete: numeric.autocomplete }),
        ...(numeric.minValue === undefined ? {} : { minValue: numeric.minValue }),
        ...(numeric.maxValue === undefined ? {} : { maxValue: numeric.maxValue }),
      };
    }
    case ApplicationCommandOptionType.Channel: {
      const channel = config as ChannelOptionConfig;
      return {
        ...base,
        type: field.type,
        ...(channel.channelTypes === undefined ? {} : { channelTypes: channel.channelTypes }),
      };
    }
    case ApplicationCommandOptionType.Boolean:
    case ApplicationCommandOptionType.User:
    case ApplicationCommandOptionType.Role:
    case ApplicationCommandOptionType.Mentionable:
    case ApplicationCommandOptionType.Attachment:
      return { ...base, type: field.type } as CommandOptionDefinition;
    default:
      throw new CommandValidationError(
        `Option field "${name}" on "${command.name}" has an unknown type.`,
      );
  }
}
