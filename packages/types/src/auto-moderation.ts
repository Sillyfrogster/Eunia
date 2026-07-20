import type { Snowflake } from "./common";

export enum AutoModerationRuleEventType {
  MessageSend = 1,
  MemberUpdate = 2,
}

export enum AutoModerationRuleTriggerType {
  Keyword = 1,
  Spam = 3,
  KeywordPreset = 4,
  MentionSpam = 5,
  MemberProfile = 6,
}

export enum AutoModerationKeywordPresetType {
  Profanity = 1,
  SexualContent = 2,
  Slurs = 3,
}

export enum AutoModerationActionType {
  BlockMessage = 1,
  SendAlertMessage = 2,
  Timeout = 3,
  BlockMemberInteraction = 4,
}

export interface AutoModerationRuleTriggerMetadata {
  keyword_filter?: string[];
  regex_patterns?: string[];
  presets?: AutoModerationKeywordPresetType[];
  allow_list?: string[];
  mention_total_limit?: number;
  mention_raid_protection_enabled?: boolean;
}

export type AutoModerationAction =
  | {
      type: AutoModerationActionType.BlockMessage;
      metadata?: { custom_message?: string };
    }
  | {
      type: AutoModerationActionType.SendAlertMessage;
      metadata: { channel_id: Snowflake };
    }
  | {
      type: AutoModerationActionType.Timeout;
      metadata: { duration_seconds: number };
    }
  | {
      type: AutoModerationActionType.BlockMemberInteraction;
      metadata?: never;
    };

export interface AutoModerationRule {
  id: Snowflake;
  guild_id: Snowflake;
  name: string;
  creator_id: Snowflake;
  event_type: AutoModerationRuleEventType;
  trigger_type: AutoModerationRuleTriggerType;
  trigger_metadata: AutoModerationRuleTriggerMetadata;
  actions: AutoModerationAction[];
  enabled: boolean;
  exempt_roles: Snowflake[];
  exempt_channels: Snowflake[];
}

export interface AutoModerationRuleCreate {
  name: string;
  event_type: AutoModerationRuleEventType;
  trigger_type: AutoModerationRuleTriggerType;
  trigger_metadata?: AutoModerationRuleTriggerMetadata;
  actions: AutoModerationAction[];
  enabled?: boolean;
  exempt_roles?: Snowflake[];
  exempt_channels?: Snowflake[];
}

export type AutoModerationRuleModify = Partial<
  Pick<
    AutoModerationRule,
    | "name"
    | "event_type"
    | "trigger_metadata"
    | "actions"
    | "enabled"
    | "exempt_roles"
    | "exempt_channels"
  >
>;
