import type { ISO8601Timestamp, Snowflake } from "./common";
import type { Emoji } from "./emoji";
import type { GuildMember } from "./guild";

export interface VoiceState {
  guild_id?: Snowflake;
  channel_id: Snowflake | null;
  user_id: Snowflake;
  member?: GuildMember;
  session_id: string;
  deaf: boolean;
  mute: boolean;
  self_deaf: boolean;
  self_mute: boolean;
  self_stream?: boolean;
  self_video: boolean;
  suppress: boolean;
  request_to_speak_timestamp: ISO8601Timestamp | null;
}

export interface VoiceServerUpdateEvent {
  token: string;
  guild_id: Snowflake;
  endpoint: string | null;
}

export enum VoiceChannelEffectAnimationType {
  Premium = 0,
  Basic = 1,
}

export interface VoiceChannelEffectSendEvent {
  channel_id: Snowflake;
  guild_id: Snowflake;
  user_id: Snowflake;
  emoji?: Emoji | null;
  animation_type?: VoiceChannelEffectAnimationType | null;
  animation_id?: number;
  sound_id?: Snowflake | number;
  sound_volume?: number;
}
