/**
 * Internal wire-facing definition shapes. Built from a command's declared
 * fields at registration; never part of the public surface.
 */
import type {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  Localizations,
  PermissionInput,
} from "@eunia/types";
import type { CommandChoice } from "./types";

interface OptionDefinitionBase<T extends ApplicationCommandOptionType> {
  readonly type: T;
  readonly name: string;
  readonly nameLocalizations?: Localizations;
  readonly description: string;
  readonly descriptionLocalizations?: Localizations;
  readonly required?: boolean;
}

export interface StringOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.String> {
  readonly choices?: readonly CommandChoice<string>[];
  readonly autocomplete?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly prefix?: { readonly rest?: boolean };
}

export interface IntegerOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.Integer> {
  readonly choices?: readonly CommandChoice<number>[];
  readonly autocomplete?: boolean;
  readonly minValue?: number;
  readonly maxValue?: number;
}

export interface NumberOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.Number> {
  readonly choices?: readonly CommandChoice<number>[];
  readonly autocomplete?: boolean;
  readonly minValue?: number;
  readonly maxValue?: number;
}

export interface BooleanOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.Boolean> {}

export interface UserOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.User> {}

export interface ChannelOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.Channel> {
  readonly channelTypes?: readonly ChannelType[];
}

export interface RoleOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.Role> {}

export interface MentionableOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.Mentionable> {}

export interface AttachmentOptionDefinition
  extends OptionDefinitionBase<ApplicationCommandOptionType.Attachment> {}

export type CommandOptionDefinition =
  | StringOptionDefinition
  | IntegerOptionDefinition
  | NumberOptionDefinition
  | BooleanOptionDefinition
  | UserOptionDefinition
  | ChannelOptionDefinition
  | RoleOptionDefinition
  | MentionableOptionDefinition
  | AttachmentOptionDefinition;

export interface CommandDefinition {
  readonly name: string;
  readonly nameLocalizations?: Localizations;
  readonly description: string;
  readonly descriptionLocalizations?: Localizations;
  readonly options?: readonly CommandOptionDefinition[];
  readonly defaultMemberPermissions?: PermissionInput | null;
  readonly contexts?: readonly InteractionContextType[] | null;
  readonly integrationTypes?: readonly ApplicationIntegrationType[];
  readonly nsfw?: boolean;
}

export type CommandGroupDefinition = Omit<CommandDefinition, "options">;
