import { ApplicationCommandOptionType, type ChannelType, type Localizations } from "@eunia/types";
import {
  freezeChoices,
  freezeLocalizations,
} from "./configuration";
import type {
  AutocompleteHandler,
  CommandChoice,
  ResolvedAttachment,
  ResolvedChannel,
  ResolvedMentionable,
  ResolvedRole,
  ResolvedUser,
} from "./types";

interface OptionConfigBase {
  readonly description?: string;
  readonly nameLocalizations?: Localizations;
  readonly descriptionLocalizations?: Localizations;
  readonly required?: boolean;
}

type CompletionConfig<T extends string | number> =
  | {
      readonly choices?: readonly CommandChoice<T>[];
      readonly autocomplete?: never;
    }
  | {
      readonly choices?: never;
      readonly autocomplete?: AutocompleteHandler<T>;
    };

export type StringOptionConfig = OptionConfigBase &
  CompletionConfig<string> & {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly prefix?: { readonly rest?: boolean };
  };

export type NumericOptionConfig = OptionConfigBase &
  CompletionConfig<number> & {
  readonly minValue?: number;
  readonly maxValue?: number;
  };

export interface BooleanOptionConfig extends OptionConfigBase {}
export interface UserOptionConfig extends OptionConfigBase {}
export interface RoleOptionConfig extends OptionConfigBase {}
export interface MentionableOptionConfig extends OptionConfigBase {}
export interface AttachmentOptionConfig extends OptionConfigBase {}

export interface ChannelOptionConfig extends OptionConfigBase {
  readonly channelTypes?: readonly ChannelType[];
}

export type OptionConfig =
  | StringOptionConfig
  | NumericOptionConfig
  | BooleanOptionConfig
  | ChannelOptionConfig;

declare const optionFieldBrand: unique symbol;

export interface OptionField<
  Value,
  Required extends boolean = boolean,
> {
  readonly [optionFieldBrand]: {
    readonly value: Value;
    readonly required: Required;
  };
  readonly type: ApplicationCommandOptionType;
  readonly config: OptionConfig;
  readonly required: boolean;
  readonly autocomplete: AutocompleteHandler | undefined;
}

class OptionFieldDefinition {
  constructor(
    readonly type: ApplicationCommandOptionType,
    readonly config: OptionConfig,
  ) {
    Object.freeze(this);
  }

  get required(): boolean {
    return this.config.required === true;
  }

  get autocomplete(): AutocompleteHandler | undefined {
    const handler = "autocomplete" in this.config
      ? this.config.autocomplete
      : undefined;
    return handler as AutocompleteHandler | undefined;
  }
}

export function isOptionField(
  value: unknown,
): value is OptionField<unknown, boolean> {
  return value instanceof OptionFieldDefinition;
}

type WithRequired<C, R extends boolean> =
  C extends unknown
    ? Omit<C, "required"> & {
        readonly required?: R;
      }
    : never;

function field<Value, R extends boolean>(
  type: ApplicationCommandOptionType,
  config: OptionConfigBase | undefined,
): OptionField<Value, R> {
  return new OptionFieldDefinition(
    type,
    freezeOptionConfig(config),
  ) as OptionField<Value, R>;
}

function freezeOptionConfig<C extends OptionConfigBase | undefined>(
  config: C,
): OptionConfig {
  const value: OptionConfigBase = config ?? {};
  const choices = (value as StringOptionConfig | NumericOptionConfig).choices;
  const channelTypes = (value as ChannelOptionConfig).channelTypes;
  const prefix = (value as StringOptionConfig).prefix;
  return Object.freeze({
    ...value,
    ...(value.nameLocalizations === undefined
      ? {}
      : {
          nameLocalizations: freezeLocalizations(
            value.nameLocalizations,
          ),
        }),
    ...(value.descriptionLocalizations === undefined
      ? {}
      : {
          descriptionLocalizations: freezeLocalizations(
            value.descriptionLocalizations,
          ),
        }),
    ...(choices === undefined
      ? {}
      : {
          choices: freezeChoices(
            choices as readonly CommandChoice<string | number>[],
          ),
        }),
    ...(channelTypes === undefined
      ? {}
      : { channelTypes: Object.freeze([...channelTypes]) }),
    ...(prefix === undefined
      ? {}
      : { prefix: Object.freeze({ ...prefix }) }),
  }) as OptionConfig;
}

export const option = {
  string<const R extends boolean = false>(
    config?: WithRequired<StringOptionConfig, R>,
  ) {
    return field<string, R>(ApplicationCommandOptionType.String, config);
  },
  integer<const R extends boolean = false>(
    config?: WithRequired<NumericOptionConfig, R>,
  ) {
    return field<number, R>(ApplicationCommandOptionType.Integer, config);
  },
  number<const R extends boolean = false>(
    config?: WithRequired<NumericOptionConfig, R>,
  ) {
    return field<number, R>(ApplicationCommandOptionType.Number, config);
  },
  boolean<const R extends boolean = false>(
    config?: WithRequired<BooleanOptionConfig, R>,
  ) {
    return field<boolean, R>(ApplicationCommandOptionType.Boolean, config);
  },
  user<const R extends boolean = false>(
    config?: WithRequired<UserOptionConfig, R>,
  ) {
    return field<ResolvedUser, R>(ApplicationCommandOptionType.User, config);
  },
  channel<const R extends boolean = false>(
    config?: WithRequired<ChannelOptionConfig, R>,
  ) {
    return field<ResolvedChannel, R>(ApplicationCommandOptionType.Channel, config);
  },
  role<const R extends boolean = false>(
    config?: WithRequired<RoleOptionConfig, R>,
  ) {
    return field<ResolvedRole, R>(ApplicationCommandOptionType.Role, config);
  },
  mentionable<const R extends boolean = false>(
    config?: WithRequired<MentionableOptionConfig, R>,
  ) {
    return field<ResolvedMentionable, R>(
      ApplicationCommandOptionType.Mentionable,
      config,
    );
  },
  attachment<const R extends boolean = false>(
    config?: WithRequired<AttachmentOptionConfig, R>,
  ) {
    return field<ResolvedAttachment, R>(
      ApplicationCommandOptionType.Attachment,
      config,
    );
  },
};
