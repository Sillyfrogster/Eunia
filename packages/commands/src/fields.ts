/**
 * Option fields. A command declares `sides = option.integer({ required: true })`
 * and reads it with `ctx.get(this.sides)`; the field's key in the class body
 * becomes the option's wire name at registration. The Value/Required type
 * parameters exist only for `ctx.get` inference.
 */
import { ApplicationCommandOptionType, type ChannelType, type Localizations } from "@eunia/types";
import type {
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

export interface StringOptionConfig extends OptionConfigBase {
  readonly choices?: readonly CommandChoice<string>[];
  readonly autocomplete?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  /** Prefix parsing: `rest: true` consumes the remaining input as one value. */
  readonly prefix?: { readonly rest?: boolean };
}

export interface NumericOptionConfig extends OptionConfigBase {
  readonly choices?: readonly CommandChoice<number>[];
  readonly autocomplete?: boolean;
  readonly minValue?: number;
  readonly maxValue?: number;
}

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

export class OptionField<Value, Required extends boolean = boolean> {
  /** Wire name; assigned from the class field key at registration. */
  name = "";
  declare readonly valueType: Value;
  declare readonly requiredType: Required;

  constructor(
    readonly type: ApplicationCommandOptionType,
    readonly config: OptionConfig,
  ) {}

  get required(): boolean {
    return this.config.required === true;
  }
}

type RequiredOf<C extends OptionConfigBase | undefined> = C extends { required: true }
  ? true
  : false;

function field<Value, C extends OptionConfigBase | undefined>(
  type: ApplicationCommandOptionType,
  config: C,
): OptionField<Value, RequiredOf<C>> {
  return new OptionField<Value, RequiredOf<C>>(type, { ...(config ?? {}) });
}

export const option = {
  string<const C extends StringOptionConfig | undefined = undefined>(config?: C) {
    return field<string, C>(ApplicationCommandOptionType.String, config as C);
  },
  integer<const C extends NumericOptionConfig | undefined = undefined>(config?: C) {
    return field<number, C>(ApplicationCommandOptionType.Integer, config as C);
  },
  number<const C extends NumericOptionConfig | undefined = undefined>(config?: C) {
    return field<number, C>(ApplicationCommandOptionType.Number, config as C);
  },
  boolean<const C extends BooleanOptionConfig | undefined = undefined>(config?: C) {
    return field<boolean, C>(ApplicationCommandOptionType.Boolean, config as C);
  },
  user<const C extends UserOptionConfig | undefined = undefined>(config?: C) {
    return field<ResolvedUser, C>(ApplicationCommandOptionType.User, config as C);
  },
  channel<const C extends ChannelOptionConfig | undefined = undefined>(config?: C) {
    return field<ResolvedChannel, C>(ApplicationCommandOptionType.Channel, config as C);
  },
  role<const C extends RoleOptionConfig | undefined = undefined>(config?: C) {
    return field<ResolvedRole, C>(ApplicationCommandOptionType.Role, config as C);
  },
  mentionable<const C extends MentionableOptionConfig | undefined = undefined>(config?: C) {
    return field<ResolvedMentionable, C>(ApplicationCommandOptionType.Mentionable, config as C);
  },
  attachment<const C extends AttachmentOptionConfig | undefined = undefined>(config?: C) {
    return field<ResolvedAttachment, C>(ApplicationCommandOptionType.Attachment, config as C);
  },
};
