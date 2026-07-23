import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
} from "@eunia/types";
import type {
  AnyCommand,
  CommandGroup,
  CommandNode,
} from "./command";
import { isCommandNode } from "./command";
import type {
  CommandDefinition,
  CommandGroupDefinition,
  CommandOptionDefinition,
} from "./definition";
import { CommandValidationError } from "./errors";
import {
  isOptionField,
  type OptionField,
  type ChannelOptionConfig,
  type NumericOptionConfig,
  type StringOptionConfig,
} from "./fields";
import {
  bindListener,
  bindListenerBuilders,
  isListenerField,
  listenerRoute,
  type ListenerField,
  type ListenerHandle,
  type ListenerBuilders,
} from "./listeners";

export interface PreparedListener {
  readonly route: string;
  readonly field: ListenerField;
}

export interface PreparedCommand {
  readonly nodeKind: "command";
  readonly command: AnyCommand;
  readonly path: readonly string[];
  readonly applicationType?: ApplicationCommandType;
  readonly prefix: boolean;
  readonly aliases: readonly string[];
  readonly definition: CommandDefinition;
  readonly options: readonly CommandOptionDefinition[];
  readonly fields: ReadonlyMap<string, OptionField<unknown, boolean>>;
  readonly listeners: ReadonlyMap<string, PreparedListener>;
  readonly listenerHandles: Readonly<Record<string, ListenerHandle<ListenerField>>>;
  readonly listenerBuilders: ListenerBuilders;
}

export interface PreparedGroup {
  readonly nodeKind: "group";
  readonly group: CommandGroup;
  readonly path: readonly string[];
  readonly applicationType?: ApplicationCommandType.ChatInput;
  readonly prefix: boolean;
  readonly aliases: readonly string[];
  readonly definition: CommandGroupDefinition;
  readonly children: readonly PreparedNode[];
}

export type PreparedNode = PreparedCommand | PreparedGroup;

export function prepareNode(
  node: CommandNode,
  parentPath: readonly string[] = [],
): PreparedNode {
  if (!isCommandNode(node)) {
    throw new CommandValidationError(
      "Commands must be created with a command definition function.",
    );
  }
  const path = Object.freeze([...parentPath, node.name]);
  return node.type === "group"
    ? prepareGroup(node, path)
    : prepareCommand(node, path);
}

function prepareCommand(
  command: AnyCommand,
  path: readonly string[],
): PreparedCommand {
  const fields = new Map<string, OptionField<unknown, boolean>>();
  const listeners = new Map<string, PreparedListener>();
  const listenerHandles: Record<
    string,
    ListenerHandle<ListenerField>
  > = Object.create(null) as Record<
    string,
    ListenerHandle<ListenerField>
  >;
  const options: CommandOptionDefinition[] = [];

  if (command.type === "chat" || command.type === "prefix") {
    for (const [name, field] of Object.entries(command.options)) {
      if (!isOptionField(field)) {
        throw new CommandValidationError(
          `Option "${name}" on "${command.name}" is not an option definition.`,
        );
      }
      fields.set(name, field);
      options.push(optionDefinition(command, name, field));
    }
  }

  for (const [name, field] of Object.entries(command.listeners)) {
    if (!isListenerField(field)) {
      throw new CommandValidationError(
        `Listener "${name}" on "${command.name}" is not a listener definition.`,
      );
    }
    const route = listenerRoute([command.type, ...path, name, field.kind]);
    listeners.set(name, { route, field });
    listenerHandles[name] = bindListener(field, route);
  }

  const applicationType = applicationTypeFor(command);
  const registration =
    command.type === "prefix" ? undefined : command.registration;
  const description =
    command.type === "user" || command.type === "message"
      ? ""
      : command.description;
  const definition: CommandDefinition = {
    name: command.name,
    ...(registration?.nameLocalizations === undefined
      ? {}
      : { nameLocalizations: registration.nameLocalizations }),
    description,
    ...(command.type !== "chat" ||
    command.registration?.descriptionLocalizations === undefined
      ? {}
      : {
          descriptionLocalizations:
            command.registration.descriptionLocalizations,
        }),
    ...(options.length === 0 ? {} : { options: Object.freeze(options) }),
    ...(registration?.defaultMemberPermissions === undefined
      ? {}
      : {
          defaultMemberPermissions:
            registration.defaultMemberPermissions,
        }),
    ...(registration?.contexts === undefined
      ? {}
      : { contexts: registration.contexts }),
    ...(registration?.integrationTypes === undefined
      ? {}
      : { integrationTypes: registration.integrationTypes }),
    ...(registration?.nsfw === undefined ? {} : { nsfw: registration.nsfw }),
  };

  const frozenListenerHandles = Object.freeze(listenerHandles);
  return Object.freeze({
    nodeKind: "command",
    command,
    path,
    ...(applicationType === undefined ? {} : { applicationType }),
    prefix: supportsPrefix(command),
    aliases: prefixAliases(command),
    definition: Object.freeze(definition),
    options: Object.freeze(options),
    fields,
    listeners,
    listenerHandles: frozenListenerHandles,
    listenerBuilders: bindListenerBuilders(frozenListenerHandles),
  });
}

function prepareGroup(
  group: CommandGroup,
  path: readonly string[],
): PreparedGroup {
  if (group.children.length === 0) {
    throw new CommandValidationError(
      `Command group "${group.name}" has no commands.`,
    );
  }

  const children = group.children.map((child) => prepareNode(child, path));
  const contextCommand = children.find(
    (child) =>
      child.applicationType === ApplicationCommandType.User ||
      child.applicationType === ApplicationCommandType.Message,
  );
  if (contextCommand !== undefined) {
    throw new CommandValidationError(
      `Command group "${group.name}" contains a context command.`,
    );
  }

  const application = children.some(
    (child) => child.applicationType === ApplicationCommandType.ChatInput,
  );
  const prefix = children.some((child) => child.prefix);
  if (!application && group.registration !== undefined) {
    throw new CommandValidationError(
      `Command group "${group.name}" has application settings but no chat-input commands.`,
    );
  }
  if (!prefix && group.prefix !== undefined) {
    throw new CommandValidationError(
      `Command group "${group.name}" has prefix settings but no prefix commands.`,
    );
  }

  const definition: CommandGroupDefinition = {
    name: group.name,
    ...(group.registration?.nameLocalizations === undefined
      ? {}
      : { nameLocalizations: group.registration.nameLocalizations }),
    description: group.description,
    ...(group.registration?.descriptionLocalizations === undefined
      ? {}
      : {
          descriptionLocalizations:
            group.registration.descriptionLocalizations,
        }),
    ...(group.registration?.defaultMemberPermissions === undefined
      ? {}
      : {
          defaultMemberPermissions:
            group.registration.defaultMemberPermissions,
        }),
    ...(group.registration?.contexts === undefined
      ? {}
      : { contexts: group.registration.contexts }),
    ...(group.registration?.integrationTypes === undefined
      ? {}
      : { integrationTypes: group.registration.integrationTypes }),
    ...(group.registration?.nsfw === undefined
      ? {}
      : { nsfw: group.registration.nsfw }),
  };

  return Object.freeze({
    nodeKind: "group",
    group,
    path,
    ...(application
      ? { applicationType: ApplicationCommandType.ChatInput as const }
      : {}),
    prefix,
    aliases: Object.freeze([...(group.prefix?.aliases ?? [])]),
    definition: Object.freeze(definition),
    children: Object.freeze(children),
  });
}

function applicationTypeFor(
  command: AnyCommand,
): ApplicationCommandType | undefined {
  switch (command.type) {
    case "chat":
      return ApplicationCommandType.ChatInput;
    case "user":
      return ApplicationCommandType.User;
    case "message":
      return ApplicationCommandType.Message;
    case "prefix":
      return undefined;
  }
}

function supportsPrefix(command: AnyCommand): boolean {
  return command.type === "prefix" ||
    (command.type === "chat" && command.prefix !== undefined);
}

function prefixAliases(command: AnyCommand): readonly string[] {
  if (command.type === "prefix") return command.aliases;
  if (command.type !== "chat" || command.prefix === undefined) return [];
  return command.prefix === true ? [] : command.prefix.aliases ?? [];
}

function optionDefinition(
  command: Extract<AnyCommand, { type: "chat" | "prefix" }>,
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
      config.description ?? (command.type === "prefix" ? name : ""),
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
        ...(string.autocomplete === undefined
          ? {}
          : { autocomplete: true }),
        ...(string.minLength === undefined
          ? {}
          : { minLength: string.minLength }),
        ...(string.maxLength === undefined
          ? {}
          : { maxLength: string.maxLength }),
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
        ...(numeric.autocomplete === undefined
          ? {}
          : { autocomplete: true }),
        ...(numeric.minValue === undefined
          ? {}
          : { minValue: numeric.minValue }),
        ...(numeric.maxValue === undefined
          ? {}
          : { maxValue: numeric.maxValue }),
      };
    }
    case ApplicationCommandOptionType.Channel: {
      const channel = config as ChannelOptionConfig;
      return {
        ...base,
        type: field.type,
        ...(channel.channelTypes === undefined
          ? {}
          : { channelTypes: channel.channelTypes }),
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
        `Option "${name}" on "${command.name}" has an unknown type.`,
      );
  }
}
