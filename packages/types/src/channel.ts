import type { BitfieldString, ISO8601Timestamp, Snowflake } from "./common";
import type { GuildMember } from "./guild";
import type { User } from "./user";

export enum ChannelType {
  GuildText = 0,
  DM = 1,
  GuildVoice = 2,
  GroupDM = 3,
  GuildCategory = 4,
  GuildAnnouncement = 5,
  AnnouncementThread = 10,
  PublicThread = 11,
  PrivateThread = 12,
  GuildStageVoice = 13,
  GuildDirectory = 14,
  GuildForum = 15,
  GuildMedia = 16,
}

export enum OverwriteType {
  Role = 0,
  Member = 1,
}

export enum VideoQualityMode {
  Auto = 1,
  Full = 2,
}

export enum ChannelFlags {
  Pinned = 1 << 1,
  RequireTag = 1 << 4,
  HideMediaDownloadOptions = 1 << 15,
  IsSpoilerChannel = 1 << 21,
}

export enum SortOrderType {
  LatestActivity = 0,
  CreationDate = 1,
}

export enum ForumLayoutType {
  NotSet = 0,
  ListView = 1,
  GalleryView = 2,
}

export type ThreadAutoArchiveDuration = 60 | 1_440 | 4_320 | 10_080;

export interface PermissionOverwrite {
  id: Snowflake;
  type: OverwriteType;
  allow: BitfieldString;
  deny: BitfieldString;
}

export interface ThreadMetadata {
  archived: boolean;
  auto_archive_duration: ThreadAutoArchiveDuration;
  archive_timestamp: ISO8601Timestamp;
  locked: boolean;
  invitable?: boolean;
  create_timestamp?: ISO8601Timestamp | null;
}

export interface ThreadMember {
  id?: Snowflake;
  user_id?: Snowflake;
  join_timestamp: ISO8601Timestamp;
  flags: number;
  member?: GuildMember;
}

interface ForumTagBase {
  id: Snowflake;
  name: string;
  moderated: boolean;
}

export type ForumTag = ForumTagBase &
  (
    | { emoji_id: Snowflake; emoji_name: null }
    | { emoji_id: null; emoji_name: string }
    | { emoji_id: null; emoji_name: null }
  );

export type DefaultReaction =
  | { emoji_id: Snowflake; emoji_name: null }
  | { emoji_id: null; emoji_name: string };

/** A channel returned by the HTTP API or gateway. */
export interface Channel {
  id: Snowflake;
  type: ChannelType;
  guild_id?: Snowflake;
  position?: number;
  permission_overwrites?: PermissionOverwrite[];
  name?: string | null;
  topic?: string | null;
  nsfw?: boolean;
  last_message_id?: Snowflake | null;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  recipients?: User[];
  icon?: string | null;
  owner_id?: Snowflake;
  application_id?: Snowflake;
  managed?: boolean;
  parent_id?: Snowflake | null;
  last_pin_timestamp?: ISO8601Timestamp | null;
  rtc_region?: string | null;
  video_quality_mode?: VideoQualityMode;
  message_count?: number;
  member_count?: number;
  thread_metadata?: ThreadMetadata;
  member?: ThreadMember;
  default_auto_archive_duration?: ThreadAutoArchiveDuration;
  permissions?: BitfieldString;
  app_permissions?: BitfieldString;
  flags?: number;
  total_message_sent?: number;
  available_tags?: ForumTag[];
  applied_tags?: Snowflake[];
  default_reaction_emoji?: DefaultReaction | null;
  default_thread_rate_limit_per_user?: number;
  default_sort_order?: SortOrderType | null;
  default_forum_layout?: ForumLayoutType;
}
