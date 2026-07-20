import type { Locale, Snowflake } from "./common";

export enum PremiumType {
  None = 0,
  NitroClassic = 1,
  Nitro = 2,
  NitroBasic = 3,
}

export enum UserFlags {
  Staff = 1 << 0,
  Partner = 1 << 1,
  HypeSquad = 1 << 2,
  BugHunterLevel1 = 1 << 3,
  HypeSquadBravery = 1 << 6,
  HypeSquadBrilliance = 1 << 7,
  HypeSquadBalance = 1 << 8,
  PremiumEarlySupporter = 1 << 9,
  TeamPseudoUser = 1 << 10,
  BugHunterLevel2 = 1 << 14,
  VerifiedBot = 1 << 16,
  VerifiedDeveloper = 1 << 17,
  CertifiedModerator = 1 << 18,
  BotHTTPInteractions = 1 << 19,
}

export interface AvatarDecorationData {
  asset: string;
  sku_id: Snowflake;
}

export type NameplatePalette =
  | "crimson"
  | "berry"
  | "sky"
  | "teal"
  | "forest"
  | "bubble_gum"
  | "violet"
  | "cobalt"
  | "clover"
  | "lemon"
  | "white";

export interface Nameplate {
  sku_id: Snowflake;
  asset: string;
  label: string;
  palette: NameplatePalette;
}

export interface Collectibles {
  nameplate?: Nameplate;
}

export interface UserPrimaryGuild {
  identity_guild_id: Snowflake | null;
  identity_enabled: boolean | null;
  tag: string | null;
  badge: string | null;
}

/** A user returned by the HTTP API or gateway. */
export interface User {
  id: Snowflake;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;
  mfa_enabled?: boolean;
  banner?: string | null;
  accent_color?: number | null;
  locale?: Locale;
  verified?: boolean;
  email?: string | null;
  flags?: number;
  premium_type?: PremiumType;
  public_flags?: number;
  avatar_decoration_data?: AvatarDecorationData | null;
  collectibles?: Collectibles | null;
  primary_guild?: UserPrimaryGuild | null;
}

export type PartialUser = Pick<User, "id"> & Partial<Omit<User, "id">>;
