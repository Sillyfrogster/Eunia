import type { BitfieldString, ISO8601Timestamp, Locale, Snowflake } from "./common";
import type { Channel } from "./channel";
import type { Emoji } from "./emoji";
import type { Sticker } from "./sticker";
import type { Collectibles, User } from "./user";

export enum GuildVerificationLevel {
  None = 0,
  Low = 1,
  Medium = 2,
  High = 3,
  VeryHigh = 4,
}

export enum GuildDefaultMessageNotificationLevel {
  AllMessages = 0,
  OnlyMentions = 1,
}

export enum GuildExplicitContentFilterLevel {
  Disabled = 0,
  MembersWithoutRoles = 1,
  AllMembers = 2,
}

export enum GuildMFALevel {
  None = 0,
  Elevated = 1,
}

export enum GuildPremiumTier {
  None = 0,
  Tier1 = 1,
  Tier2 = 2,
  Tier3 = 3,
}

export enum GuildNSFWLevel {
  Default = 0,
  Explicit = 1,
  Safe = 2,
  AgeRestricted = 3,
}

export enum SystemChannelFlags {
  SuppressJoinNotifications = 1 << 0,
  SuppressPremiumSubscriptions = 1 << 1,
  SuppressGuildReminderNotifications = 1 << 2,
  SuppressJoinNotificationReplies = 1 << 3,
  SuppressRoleSubscriptionPurchaseNotifications = 1 << 4,
  SuppressRoleSubscriptionPurchaseNotificationReplies = 1 << 5,
}

export const PermissionFlags = {
  CreateInstantInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  PrioritySpeaker: 1n << 8n,
  Stream: 1n << 9n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  SendTtsMessages: 1n << 12n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  UseExternalEmojis: 1n << 18n,
  ViewGuildInsights: 1n << 19n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  MuteMembers: 1n << 22n,
  DeafenMembers: 1n << 23n,
  MoveMembers: 1n << 24n,
  UseVad: 1n << 25n,
  ChangeNickname: 1n << 26n,
  ManageNicknames: 1n << 27n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ManageGuildExpressions: 1n << 30n,
  UseApplicationCommands: 1n << 31n,
  RequestToSpeak: 1n << 32n,
  ManageEvents: 1n << 33n,
  ManageThreads: 1n << 34n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  UseExternalStickers: 1n << 37n,
  SendMessagesInThreads: 1n << 38n,
  UseEmbeddedActivities: 1n << 39n,
  ModerateMembers: 1n << 40n,
  ViewCreatorMonetizationAnalytics: 1n << 41n,
  UseSoundboard: 1n << 42n,
  CreateGuildExpressions: 1n << 43n,
  CreateEvents: 1n << 44n,
  UseExternalSounds: 1n << 45n,
  SendVoiceMessages: 1n << 46n,
  SetVoiceChannelStatus: 1n << 48n,
  SendPolls: 1n << 49n,
  UseExternalApps: 1n << 50n,
  PinMessages: 1n << 51n,
  BypassSlowmode: 1n << 52n,
} as const;

export type PermissionFlag = (typeof PermissionFlags)[keyof typeof PermissionFlags];
export type PermissionFlagName = keyof typeof PermissionFlags;
export type PermissionInput = bigint | BitfieldString | readonly PermissionFlag[];

/** Folds a PermissionInput into a single bigint bitfield. */
export function toPermissionBits(value: PermissionInput): bigint {
  if (Array.isArray(value)) {
    return value.reduce<bigint>((bits, flag) => bits | flag, 0n);
  }
  return BigInt(value as bigint | BitfieldString);
}

function hasAdministrator(permissions: bigint): boolean {
  return (permissions & PermissionFlags.Administrator) === PermissionFlags.Administrator;
}

/** Returns true when the bitfield contains every flag in `required` (Administrator implies all). */
export function can(permissions: bigint, required: bigint): boolean {
  if (hasAdministrator(permissions)) return true;
  return (permissions & required) === required;
}

/** Returns true when the bitfield contains at least one flag in `anyOf` (Administrator implies all). */
export function canAny(permissions: bigint, anyOf: bigint): boolean {
  if (hasAdministrator(permissions)) return true;
  return (permissions & anyOf) !== 0n;
}

/** Names the flags in `required` that the bitfield lacks (empty for Administrator). */
export function missing(permissions: bigint, required: bigint): PermissionFlagName[] {
  if (hasAdministrator(permissions)) return [];
  return toFlagNames(required & ~permissions);
}

/** Names every flag set in the bitfield. */
export function toFlagNames(permissions: bigint): PermissionFlagName[] {
  const names: PermissionFlagName[] = [];
  for (const [name, flag] of Object.entries(PermissionFlags)) {
    if ((permissions & flag) === flag) names.push(name as PermissionFlagName);
  }
  return names;
}

export enum RoleFlags {
  InPrompt = 1 << 0,
}

export enum GuildMemberFlags {
  DidRejoin = 1 << 0,
  CompletedOnboarding = 1 << 1,
  BypassesVerification = 1 << 2,
  StartedOnboarding = 1 << 3,
  IsGuest = 1 << 4,
  StartedHomeActions = 1 << 5,
  CompletedHomeActions = 1 << 6,
  AutoModQuarantinedUsername = 1 << 7,
  DMSettingsUpsellAcknowledged = 1 << 9,
  AutoModQuarantinedGuildTag = 1 << 10,
}

export interface RoleColors {
  primary_color: number;
  secondary_color: number | null;
  tertiary_color: number | null;
}

export interface RoleTags {
  bot_id?: Snowflake;
  integration_id?: Snowflake;
  premium_subscriber?: null;
  subscription_listing_id?: Snowflake;
  available_for_purchase?: null;
  guild_connections?: null;
}

export interface Role {
  id: Snowflake;
  name: string;
  color: number;
  colors: RoleColors;
  hoist: boolean;
  icon: string | null;
  unicode_emoji: string | null;
  position: number;
  permissions: BitfieldString;
  managed: boolean;
  mentionable: boolean;
  tags?: RoleTags;
  flags: number;
}

export interface GuildMember {
  user?: User;
  nick?: string | null;
  avatar?: string | null;
  banner?: string | null;
  roles: Snowflake[];
  joined_at: ISO8601Timestamp | null;
  premium_since?: ISO8601Timestamp | null;
  deaf: boolean;
  mute: boolean;
  flags: number;
  pending?: boolean;
  permissions?: BitfieldString;
  communication_disabled_until?: ISO8601Timestamp | null;
  avatar_decoration_data?: User["avatar_decoration_data"];
  collectibles?: Collectibles | null;
}

export interface GuildBan {
  reason: string | null;
  user: User;
}

export enum IntegrationExpireBehavior {
  RemoveRole = 0,
  Kick = 1,
}

export interface IntegrationAccount {
  id: string;
  name: string;
}

export interface IntegrationApplication {
  id: Snowflake;
  name: string;
  icon: string | null;
  description: string;
  bot?: User;
}

export interface Integration {
  id: Snowflake;
  name: string;
  type: string;
  enabled: boolean;
  syncing?: boolean;
  role_id?: Snowflake;
  enable_emoticons?: boolean;
  expire_behavior?: IntegrationExpireBehavior;
  expire_grace_period?: number;
  user?: User;
  account: IntegrationAccount;
  synced_at?: ISO8601Timestamp;
  subscriber_count?: number;
  revoked?: boolean;
  application?: IntegrationApplication;
  scopes?: string[];
}

export interface WelcomeScreenChannel {
  channel_id: Snowflake;
  description: string;
  emoji_id: Snowflake | null;
  emoji_name: string | null;
}

export interface WelcomeScreen {
  description: string | null;
  welcome_channels: WelcomeScreenChannel[];
}

export interface GuildIncidentsData {
  invites_disabled_until?: ISO8601Timestamp | null;
  dms_disabled_until?: ISO8601Timestamp | null;
  dm_spam_detected_at?: ISO8601Timestamp | null;
  raid_detected_at?: ISO8601Timestamp | null;
}

export interface UnavailableGuild {
  id: Snowflake;
  unavailable: true;
}

/** A guild returned by the HTTP API or gateway. */
export interface Guild {
  id: Snowflake;
  name: string;
  icon: string | null;
  splash: string | null;
  discovery_splash: string | null;
  owner?: boolean;
  owner_id: Snowflake;
  permissions?: BitfieldString;
  afk_channel_id: Snowflake | null;
  afk_timeout: number;
  widget_enabled?: boolean;
  widget_channel_id?: Snowflake | null;
  verification_level: GuildVerificationLevel;
  default_message_notifications: GuildDefaultMessageNotificationLevel;
  explicit_content_filter: GuildExplicitContentFilterLevel;
  roles: Role[];
  emojis: Emoji[];
  features: string[];
  mfa_level: GuildMFALevel;
  application_id: Snowflake | null;
  system_channel_id: Snowflake | null;
  system_channel_flags: number;
  rules_channel_id: Snowflake | null;
  max_presences?: number | null;
  max_members?: number;
  vanity_url_code: string | null;
  description: string | null;
  banner: string | null;
  premium_tier: GuildPremiumTier;
  premium_subscription_count?: number;
  preferred_locale: Locale;
  public_updates_channel_id: Snowflake | null;
  max_video_channel_users?: number;
  max_stage_video_channel_users?: number;
  approximate_member_count?: number;
  approximate_presence_count?: number;
  nsfw_level: GuildNSFWLevel;
  welcome_screen?: WelcomeScreen;
  stickers?: Sticker[];
  premium_progress_bar_enabled: boolean;
  safety_alerts_channel_id: Snowflake | null;
  incidents_data: GuildIncidentsData | null;
  channels?: Channel[];
  threads?: Channel[];
  members?: GuildMember[];
  unavailable?: boolean;
  member_count?: number;
  joined_at?: ISO8601Timestamp;
  large?: boolean;
}

export type PartialGuild = Pick<
  Guild,
  "id" | "name" | "icon" | "banner" | "owner" | "permissions" | "features"
> &
  Pick<Guild, "approximate_member_count" | "approximate_presence_count">;
