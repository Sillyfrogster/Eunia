import type { ISO8601Timestamp, Snowflake } from "./common";
import type { GuildMember } from "./guild";
import type { User } from "./user";

export enum GuildScheduledEventPrivacyLevel {
  GuildOnly = 2,
}

export enum GuildScheduledEventEntityType {
  StageInstance = 1,
  Voice = 2,
  External = 3,
}

export enum GuildScheduledEventStatus {
  Scheduled = 1,
  Active = 2,
  Completed = 3,
  Canceled = 4,
}

export enum GuildScheduledEventRecurrenceFrequency {
  Yearly = 0,
  Monthly = 1,
  Weekly = 2,
  Daily = 3,
}

export enum GuildScheduledEventRecurrenceWeekday {
  Monday = 0,
  Tuesday = 1,
  Wednesday = 2,
  Thursday = 3,
  Friday = 4,
  Saturday = 5,
  Sunday = 6,
}

export enum GuildScheduledEventRecurrenceMonth {
  January = 1,
  February = 2,
  March = 3,
  April = 4,
  May = 5,
  June = 6,
  July = 7,
  August = 8,
  September = 9,
  October = 10,
  November = 11,
  December = 12,
}

export interface GuildScheduledEventRecurrenceNWeekday {
  n: number;
  day: GuildScheduledEventRecurrenceWeekday;
}

export interface GuildScheduledEventRecurrenceRule {
  start: ISO8601Timestamp;
  end: ISO8601Timestamp | null;
  frequency: GuildScheduledEventRecurrenceFrequency;
  interval: number;
  by_weekday: GuildScheduledEventRecurrenceWeekday[] | null;
  by_n_weekday: GuildScheduledEventRecurrenceNWeekday[] | null;
  by_month: GuildScheduledEventRecurrenceMonth[] | null;
  by_month_day: number[] | null;
  by_year_day: number[] | null;
  count: number | null;
}

export interface GuildScheduledEventRecurrenceRuleCreate {
  start: ISO8601Timestamp;
  frequency: GuildScheduledEventRecurrenceFrequency;
  interval: number;
  by_weekday?: GuildScheduledEventRecurrenceWeekday[];
  by_n_weekday?: GuildScheduledEventRecurrenceNWeekday[];
  by_month?: GuildScheduledEventRecurrenceMonth[];
  by_month_day?: number[];
}

interface GuildScheduledEventBase {
  id: Snowflake;
  guild_id: Snowflake;
  creator_id?: Snowflake | null;
  name: string;
  description?: string | null;
  scheduled_start_time: ISO8601Timestamp;
  privacy_level: GuildScheduledEventPrivacyLevel;
  status: GuildScheduledEventStatus;
  entity_id: Snowflake | null;
  creator?: User;
  user_count?: number;
  image?: string | null;
  recurrence_rule: GuildScheduledEventRecurrenceRule | null;
}

export type GuildScheduledEvent =
  | (GuildScheduledEventBase & {
      entity_type:
        | GuildScheduledEventEntityType.StageInstance
        | GuildScheduledEventEntityType.Voice;
      channel_id: Snowflake;
      entity_metadata: null;
      scheduled_end_time: ISO8601Timestamp | null;
    })
  | (GuildScheduledEventBase & {
      entity_type: GuildScheduledEventEntityType.External;
      channel_id: null;
      entity_metadata: { location: string };
      scheduled_end_time: ISO8601Timestamp;
    });

interface GuildScheduledEventCreateBase {
  name: string;
  privacy_level: GuildScheduledEventPrivacyLevel;
  scheduled_start_time: ISO8601Timestamp;
  description?: string;
  image?: string;
  recurrence_rule?: GuildScheduledEventRecurrenceRuleCreate;
}

export type GuildScheduledEventCreate =
  | (GuildScheduledEventCreateBase & {
      entity_type:
        | GuildScheduledEventEntityType.StageInstance
        | GuildScheduledEventEntityType.Voice;
      channel_id: Snowflake;
      entity_metadata?: never;
      scheduled_end_time?: ISO8601Timestamp;
    })
  | (GuildScheduledEventCreateBase & {
      entity_type: GuildScheduledEventEntityType.External;
      channel_id?: null;
      entity_metadata: { location: string };
      scheduled_end_time: ISO8601Timestamp;
    });

export interface GuildScheduledEventModify {
  channel_id?: Snowflake | null;
  entity_metadata?: { location?: string } | null;
  name?: string;
  privacy_level?: GuildScheduledEventPrivacyLevel;
  scheduled_start_time?: ISO8601Timestamp;
  scheduled_end_time?: ISO8601Timestamp;
  description?: string | null;
  entity_type?: GuildScheduledEventEntityType;
  status?: GuildScheduledEventStatus;
  image?: string | null;
  recurrence_rule?: GuildScheduledEventRecurrenceRuleCreate | null;
}

export interface GuildScheduledEventUser {
  guild_scheduled_event_id: Snowflake;
  user: User;
  member?: GuildMember;
}

export interface GuildScheduledEventUserEvent {
  guild_scheduled_event_id: Snowflake;
  user_id: Snowflake;
  guild_id: Snowflake;
}
