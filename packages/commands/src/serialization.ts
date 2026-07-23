import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
} from "@eunia/types";
import type * as types from "@eunia/types";
import type {
  CommandDefinition,
  CommandGroupDefinition,
  CommandOptionDefinition,
} from "./definition";
import { CommandValidationError } from "./errors";
import { resolvePermissionBits } from "./permissions";
import type { PreparedCommand, PreparedGroup, PreparedNode } from "./prepare";
import type { CommandChoice } from "./types";

export function serializeCommand(
  node: PreparedNode,
  scope: "global" | "guild" = "global",
): types.ApplicationCommandCreate {
  const type = node.applicationType;
  if (type === undefined) {
    throw new CommandValidationError(
      `Prefix-only command "${node.definition.name}" cannot be published.`,
    );
  }
  if (
    type === ApplicationCommandType.User ||
    type === ApplicationCommandType.Message
  ) {
    if (node.nodeKind !== "command") {
      throw new CommandValidationError(
        "Context commands cannot contain command groups.",
      );
    }
    return serializeContextRoot(node.definition, type, scope);
  }

  const root = serializeChatInputRoot(node.definition, scope);
  if (node.nodeKind === "command") {
    const options = node.definition.options?.map(serializeOption);
    return options === undefined || options.length === 0
      ? root
      : { ...root, options };
  }

  return {
    ...root,
    options: applicationChildren(node).map(serializeBranch),
  };
}

function serializeChatInputRoot(
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
    ...serializeRootSettings(definition, scope),
  };
}

function serializeContextRoot(
  definition: CommandDefinition,
  type: ApplicationCommandType.User | ApplicationCommandType.Message,
  scope: "global" | "guild",
): types.ContextMenuApplicationCommandCreate {
  return {
    name: definition.name,
    ...(definition.nameLocalizations === undefined
      ? {}
      : { name_localizations: definition.nameLocalizations }),
    type,
    ...serializeRootSettings(definition, scope),
  };
}

function serializeRootSettings(
  definition: CommandDefinition | CommandGroupDefinition,
  scope: "global" | "guild",
): Omit<types.ApplicationCommandCreateBase, "name" | "name_localizations"> {
  return {
    ...(definition.defaultMemberPermissions === undefined
      ? {}
      : {
          default_member_permissions:
            definition.defaultMemberPermissions === null
              ? null
              : `${resolvePermissionBits(
                  definition.defaultMemberPermissions,
                )}` as `${bigint}`,
        }),
    ...(scope === "guild" || definition.contexts === undefined
      ? {}
      : {
          contexts:
            definition.contexts === null ? null : [...definition.contexts],
        }),
    ...(scope === "guild" || definition.integrationTypes === undefined
      ? {}
      : { integration_types: [...definition.integrationTypes] }),
    ...(definition.nsfw === undefined ? {} : { nsfw: definition.nsfw }),
  };
}

function serializeBranch(
  node: PreparedNode,
):
  | types.ApplicationCommandSubcommandOption
  | types.ApplicationCommandSubcommandGroupOption {
  if (node.applicationType !== ApplicationCommandType.ChatInput) {
    throw new CommandValidationError(
      `Prefix-only command "${node.definition.name}" cannot be serialized as a subcommand.`,
    );
  }
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
        : {
            description_localizations:
              node.definition.descriptionLocalizations,
          }),
      options: applicationChildren(node).map((child) => {
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

function serializeSubcommand(
  node: PreparedCommand,
): types.ApplicationCommandSubcommandOption {
  return {
    type: ApplicationCommandOptionType.Subcommand,
    name: node.definition.name,
    ...(node.definition.nameLocalizations === undefined
      ? {}
      : { name_localizations: node.definition.nameLocalizations }),
    description: node.definition.description,
    ...(node.definition.descriptionLocalizations === undefined
      ? {}
      : {
          description_localizations:
            node.definition.descriptionLocalizations,
        }),
    ...(node.definition.options === undefined ||
    node.definition.options.length === 0
      ? {}
      : { options: node.definition.options.map(serializeOption) }),
  };
}

function serializeOption(
  option: CommandOptionDefinition,
): types.ApplicationCommandBasicOption {
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
        ...(option.minLength === undefined
          ? {}
          : { min_length: option.minLength }),
        ...(option.maxLength === undefined
          ? {}
          : { max_length: option.maxLength }),
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
        ...(option.minValue === undefined
          ? {}
          : { min_value: option.minValue }),
        ...(option.maxValue === undefined
          ? {}
          : { max_value: option.maxValue }),
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
        ...(option.minValue === undefined
          ? {}
          : { min_value: option.minValue }),
        ...(option.maxValue === undefined
          ? {}
          : { max_value: option.maxValue }),
      };
    case ApplicationCommandOptionType.Channel:
      return {
        ...common,
        type: ApplicationCommandOptionType.Channel,
        ...(option.channelTypes === undefined
          ? {}
          : { channel_types: [...option.channelTypes] }),
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

function applicationChildren(group: PreparedGroup): readonly PreparedNode[] {
  return group.children.filter(
    (child) =>
      child.applicationType === ApplicationCommandType.ChatInput,
  );
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
