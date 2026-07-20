import type { BitfieldString, Locale, Localizations, Snowflake } from "./common";
import type { ChannelType } from "./channel";
import type { PartialGuild, PermissionInput } from "./guild";
import type { PartialUser } from "./user";

export enum ApplicationCommandType {
  ChatInput = 1,
  User = 2,
  Message = 3,
  PrimaryEntryPoint = 4,
}

export enum ApplicationCommandOptionType {
  Subcommand = 1,
  SubcommandGroup = 2,
  String = 3,
  Integer = 4,
  Boolean = 5,
  User = 6,
  Channel = 7,
  Role = 8,
  Mentionable = 9,
  Number = 10,
  Attachment = 11,
}

export enum ApplicationIntegrationType {
  GuildInstall = 0,
  UserInstall = 1,
}

export enum InteractionContextType {
  Guild = 0,
  BotDM = 1,
  PrivateChannel = 2,
}

export enum EntryPointCommandHandlerType {
  AppHandler = 1,
  DiscordLaunchActivity = 2,
}

export enum ApplicationCommandPermissionType {
  Role = 1,
  User = 2,
  Channel = 3,
}

export interface InstallParams {
  scopes: string[];
  permissions: BitfieldString;
}

export interface ApplicationIntegrationTypeConfiguration {
  oauth2_install_params?: InstallParams;
}

export interface TeamMember {
  membership_state: 1 | 2;
  team_id: Snowflake;
  user: PartialUser;
  role?: string;
  permissions?: string[];
}

export interface Team {
  icon: string | null;
  id: Snowflake;
  members: TeamMember[];
  name: string;
  owner_user_id: Snowflake;
}

export interface Application {
  id: Snowflake;
  name: string;
  icon: string | null;
  description: string;
  rpc_origins?: string[];
  bot_public: boolean;
  bot_require_code_grant: boolean;
  bot?: PartialUser;
  terms_of_service_url?: string;
  privacy_policy_url?: string;
  owner?: PartialUser;
  verify_key: string;
  team: Team | null;
  guild_id?: Snowflake;
  guild?: PartialGuild;
  primary_sku_id?: Snowflake;
  slug?: string;
  cover_image?: string;
  flags?: number;
  flags_new?: BitfieldString;
  approximate_guild_count?: number;
  approximate_user_install_count?: number;
  approximate_user_authorization_count?: number;
  redirect_uris?: string[];
  interactions_endpoint_url?: string | null;
  role_connections_verification_url?: string | null;
  event_webhooks_url?: string | null;
  event_webhooks_status?: 1 | 2 | 3;
  event_webhooks_types?: string[];
  tags?: string[];
  install_params?: InstallParams;
  integration_types_config?: Partial<
    Record<ApplicationIntegrationType, ApplicationIntegrationTypeConfiguration>
  >;
  custom_install_url?: string;
}

export interface ApplicationCommandChoice<T extends string | number = string | number> {
  name: string;
  name_localizations?: Localizations | null;
  value: T;
}

export interface ApplicationCommandOptionBase<T extends ApplicationCommandOptionType> {
  type: T;
  name: string;
  name_localizations?: Localizations | null;
  description: string;
  description_localizations?: Localizations | null;
}

type CommandOptionChoices<T extends string | number> =
  | {
      choices?: ApplicationCommandChoice<T>[];
      autocomplete?: false;
    }
  | {
      choices?: never;
      autocomplete: true;
    };

export type ApplicationCommandSubcommandOption =
  ApplicationCommandOptionBase<ApplicationCommandOptionType.Subcommand> & {
    options?: ApplicationCommandBasicOption[];
  };

export type ApplicationCommandSubcommandGroupOption =
  ApplicationCommandOptionBase<ApplicationCommandOptionType.SubcommandGroup> & {
    options: ApplicationCommandSubcommandOption[];
  };

export type ApplicationCommandStringOption =
  ApplicationCommandOptionBase<ApplicationCommandOptionType.String> &
    CommandOptionChoices<string> & {
      required?: boolean;
      min_length?: number;
      max_length?: number;
    };

export type ApplicationCommandNumericOption =
  ApplicationCommandOptionBase<
    ApplicationCommandOptionType.Integer | ApplicationCommandOptionType.Number
  > &
    CommandOptionChoices<number> & {
      required?: boolean;
      min_value?: number;
      max_value?: number;
    };

export type ApplicationCommandChannelOption =
  ApplicationCommandOptionBase<ApplicationCommandOptionType.Channel> & {
    required?: boolean;
    channel_types?: ChannelType[];
  };

export type ApplicationCommandSimpleOption =
  ApplicationCommandOptionBase<
    | ApplicationCommandOptionType.Boolean
    | ApplicationCommandOptionType.User
    | ApplicationCommandOptionType.Role
    | ApplicationCommandOptionType.Mentionable
    | ApplicationCommandOptionType.Attachment
  > & {
  required?: boolean;
  };

export type ApplicationCommandBasicOption =
  | ApplicationCommandStringOption
  | ApplicationCommandNumericOption
  | ApplicationCommandChannelOption
  | ApplicationCommandSimpleOption;

export type ApplicationCommandOption =
  | ApplicationCommandSubcommandOption
  | ApplicationCommandSubcommandGroupOption
  | ApplicationCommandBasicOption;

export interface ApplicationCommandCreateBase {
  name: string;
  name_localizations?: Localizations | null;
  default_member_permissions?: BitfieldString | null;
  dm_permission?: boolean;
  default_permission?: boolean | null;
  contexts?: InteractionContextType[] | null;
  integration_types?: ApplicationIntegrationType[];
  nsfw?: boolean;
}

export type ChatInputApplicationCommandCreate = ApplicationCommandCreateBase & {
  type?: ApplicationCommandType.ChatInput;
  description: string;
  description_localizations?: Localizations | null;
  options?: ApplicationCommandOption[];
  handler?: never;
};

export type ContextMenuApplicationCommandCreate = ApplicationCommandCreateBase & {
  type: ApplicationCommandType.User | ApplicationCommandType.Message;
  description?: never;
  description_localizations?: never;
  options?: never;
  handler?: never;
};

export type PrimaryEntryPointApplicationCommandCreate =
  ApplicationCommandCreateBase & {
    type: ApplicationCommandType.PrimaryEntryPoint;
    description: string;
    description_localizations?: Localizations | null;
    options?: never;
    handler?: EntryPointCommandHandlerType;
  };

export type ApplicationCommandCreate =
  | ChatInputApplicationCommandCreate
  | ContextMenuApplicationCommandCreate
  | PrimaryEntryPointApplicationCommandCreate;

export interface ApplicationCommandBase extends ApplicationCommandCreateBase {
  id: Snowflake;
  application_id: Snowflake;
  guild_id?: Snowflake;
  description: string;
  description_localizations?: Localizations | null;
  version: Snowflake;
  name_localized?: string;
  description_localized?: string;
}

export type ApplicationCommand =
  | (ApplicationCommandBase & {
      type: ApplicationCommandType.ChatInput;
      options?: ApplicationCommandOption[];
      handler?: never;
    })
  | (ApplicationCommandBase & {
      type: ApplicationCommandType.User | ApplicationCommandType.Message;
      description: "";
      options?: never;
      handler?: never;
    })
  | (ApplicationCommandBase & {
      type: ApplicationCommandType.PrimaryEntryPoint;
      options?: never;
      handler?: EntryPointCommandHandlerType;
    });

type WithPermissionInput<T> = T extends ApplicationCommandCreate
  ? Omit<T, "default_member_permissions"> & {
      default_member_permissions?: PermissionInput | null;
    }
  : never;

export type ApplicationCommandDefinition = WithPermissionInput<ApplicationCommandCreate>;

export interface ApplicationCommandPermission {
  id: Snowflake;
  type: ApplicationCommandPermissionType;
  permission: boolean;
}

export interface ApplicationCommandPermissions {
  id: Snowflake;
  application_id: Snowflake;
  guild_id: Snowflake;
  permissions: ApplicationCommandPermission[];
}

export type ApplicationCommandLocalization = Partial<Record<Locale, string>>;
