import type { Snowflake } from "./common";

export enum StagePrivacyLevel {
  Public = 1,
  GuildOnly = 2,
}

export interface StageInstance {
  id: Snowflake;
  guild_id: Snowflake;
  channel_id: Snowflake;
  topic: string;
  privacy_level: StagePrivacyLevel;
  discoverable_disabled: boolean;
  guild_scheduled_event_id: Snowflake | null;
}
