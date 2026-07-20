import type { Application } from "./application";
import type { ChannelType } from "./channel";
import type { ISO8601Timestamp, Snowflake } from "./common";
import type { Guild, Role } from "./guild";
import type { GuildScheduledEvent } from "./scheduled-event";
import type { User } from "./user";

export enum InviteType {
  Guild = 0,
  GroupDM = 1,
  Friend = 2,
}

export enum InviteTargetType {
  Stream = 1,
  EmbeddedApplication = 2,
}

export enum InviteFlags {
  IsGuestInvite = 1 << 0,
}

export type InviteGuild = Pick<
  Guild,
  | "id"
  | "name"
  | "icon"
  | "splash"
  | "banner"
  | "description"
  | "features"
  | "verification_level"
  | "vanity_url_code"
  | "nsfw_level"
  | "premium_subscription_count"
>;

export interface InviteChannel {
  id: Snowflake;
  name: string | null;
  type: ChannelType;
}

export type InviteTargetApplication = Pick<
  Application,
  "id" | "name" | "icon" | "description"
>;

export type InviteRole = Pick<
  Role,
  "id" | "name" | "position" | "color" | "colors" | "icon" | "unicode_emoji"
>;

export interface Invite {
  type: InviteType;
  code: string;
  guild?: InviteGuild;
  channel?: InviteChannel | null;
  inviter?: User;
  target_type?: InviteTargetType;
  target_user?: User;
  target_application?: InviteTargetApplication;
  approximate_presence_count?: number;
  approximate_member_count?: number;
  expires_at?: ISO8601Timestamp | null;
  guild_scheduled_event?: GuildScheduledEvent;
  flags?: number;
  roles?: InviteRole[];
}

export interface InviteMetadata {
  uses: number;
  max_uses: number;
  max_age: number;
  temporary: boolean;
  created_at: ISO8601Timestamp;
}

export type InviteWithMetadata = Invite & InviteMetadata;

export interface InviteCreateEvent extends InviteMetadata {
  channel_id: Snowflake;
  code: string;
  guild_id?: Snowflake;
  inviter?: User;
  target_type?: InviteTargetType;
  target_user?: User;
  target_application?: InviteTargetApplication;
  expires_at?: ISO8601Timestamp | null;
  role_ids?: Snowflake[];
}

export interface InviteDeleteEvent {
  channel_id: Snowflake;
  guild_id?: Snowflake;
  code: string;
}
