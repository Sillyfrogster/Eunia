import type {
  ApplicationCommandChoice,
  ApplicationIntegrationType,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionContextType,
} from "./application";
import type { BitfieldString, Locale, Snowflake } from "./common";
import type { Entitlement } from "./entitlement";
import type { GuildMember } from "./guild";
import type {
  Message,
  MessageCreate,
  ModalComponent,
  ModalSubmitComponent,
  ResolvedData,
  ResolvedChannel,
  ComponentType,
} from "./message";
import type { User } from "./user";

export enum InteractionType {
  Ping = 1,
  ApplicationCommand = 2,
  MessageComponent = 3,
  ApplicationCommandAutocomplete = 4,
  ModalSubmit = 5,
}

export enum InteractionCallbackType {
  Pong = 1,
  ChannelMessageWithSource = 4,
  DeferredChannelMessageWithSource = 5,
  DeferredUpdateMessage = 6,
  UpdateMessage = 7,
  ApplicationCommandAutocompleteResult = 8,
  Modal = 9,
  PremiumRequired = 10,
  LaunchActivity = 12,
}

export interface ApplicationCommandInteractionOption {
  name: string;
  type: ApplicationCommandOptionType;
  value?: string | number | boolean;
  options?: ApplicationCommandInteractionOption[];
  focused?: boolean;
}

export interface ApplicationCommandInteractionData {
  id: Snowflake;
  name: string;
  type: ApplicationCommandType;
  resolved?: ResolvedData;
  options?: ApplicationCommandInteractionOption[];
  guild_id?: Snowflake;
  target_id?: Snowflake;
}

export type MessageComponentType =
  | ComponentType.Button
  | ComponentType.StringSelect
  | ComponentType.UserSelect
  | ComponentType.RoleSelect
  | ComponentType.MentionableSelect
  | ComponentType.ChannelSelect;

export interface MessageComponentInteractionData {
  custom_id: string;
  component_type: MessageComponentType;
  id?: number;
  values?: string[];
  resolved?: ResolvedData;
}

export interface ModalSubmitInteractionData {
  custom_id: string;
  components: ModalSubmitComponent[];
  resolved?: ResolvedData;
}

export type InteractionData =
  | ApplicationCommandInteractionData
  | MessageComponentInteractionData
  | ModalSubmitInteractionData;

/** An interaction received from the gateway or an HTTP endpoint. */
export interface InteractionBase {
  id: Snowflake;
  application_id: Snowflake;
  guild?: { id: Snowflake; locale?: Locale; features?: string[] };
  guild_id?: Snowflake;
  channel?: ResolvedChannel;
  channel_id?: Snowflake;
  member?: GuildMember;
  user?: User;
  token: string;
  version: 1;
  message?: Message;
  app_permissions?: BitfieldString;
  locale?: Locale;
  guild_locale?: Locale;
  entitlements: Entitlement[];
  authorizing_integration_owners: Partial<
    Record<`${ApplicationIntegrationType}`, Snowflake>
  >;
  context?: InteractionContextType;
  attachment_size_limit: number;
}

export interface InteractionResponseData
  extends Pick<
    MessageCreate,
    "tts" | "content" | "embeds" | "allowed_mentions" | "flags" | "attachments" | "poll"
  > {
  components?: MessageCreate["components"];
  files?: MessageCreate["files"];
}

export interface AutocompleteInteractionResponseData {
  choices: ApplicationCommandChoice[];
}

export interface ModalInteractionResponseData {
  custom_id: string;
  title: string;
  components: ModalComponent[];
}

export type InteractionResponse =
  | {
      type:
        | InteractionCallbackType.Pong
        | InteractionCallbackType.DeferredUpdateMessage
        | InteractionCallbackType.PremiumRequired
        | InteractionCallbackType.LaunchActivity;
      data?: never;
    }
  | {
      type:
        | InteractionCallbackType.ChannelMessageWithSource
        | InteractionCallbackType.UpdateMessage;
      data?: InteractionResponseData;
    }
  | {
      type: InteractionCallbackType.DeferredChannelMessageWithSource;
      data?: Pick<InteractionResponseData, "flags">;
    }
  | {
      type: InteractionCallbackType.ApplicationCommandAutocompleteResult;
      data: AutocompleteInteractionResponseData;
    }
  | {
      type: InteractionCallbackType.Modal;
      data: ModalInteractionResponseData;
    };

export interface InteractionCallback {
  id: Snowflake;
  type: InteractionType;
  activity_instance_id?: string;
  response_message_id?: Snowflake;
  response_message_loading?: boolean;
  response_message_ephemeral?: boolean;
}

export interface InteractionCallbackResource {
  type: InteractionCallbackType;
  activity_instance?: { id: string };
  message?: Message;
}

export interface InteractionCallbackResponse {
  interaction: InteractionCallback;
  resource?: InteractionCallbackResource;
}

export type PingInteraction = InteractionBase & {
  type: InteractionType.Ping;
  data?: never;
};

export type ApplicationCommandInteraction = InteractionBase & {
  type: InteractionType.ApplicationCommand;
  data: ApplicationCommandInteractionData;
};

export type AutocompleteInteraction = InteractionBase & {
  type: InteractionType.ApplicationCommandAutocomplete;
  data: ApplicationCommandInteractionData;
};

export type MessageComponentInteraction = InteractionBase & {
  type: InteractionType.MessageComponent;
  data: MessageComponentInteractionData;
};

export type ModalSubmitInteraction = InteractionBase & {
  type: InteractionType.ModalSubmit;
  data: ModalSubmitInteractionData;
};

export type Interaction =
  | PingInteraction
  | ApplicationCommandInteraction
  | AutocompleteInteraction
  | MessageComponentInteraction
  | ModalSubmitInteraction;
