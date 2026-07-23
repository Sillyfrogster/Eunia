import type { JsonValue, Snowflake } from "./common";

export interface AuditLogChange {
  new_value?: JsonValue;
  old_value?: JsonValue;
  key: string;
}

export interface AuditLogEntryOptions {
  [key: string]: string | undefined;
}

export interface AuditLogEntry {
  target_id: string | null;
  changes?: AuditLogChange[];
  user_id: Snowflake | null;
  id: Snowflake;
  action_type: number;
  options?: AuditLogEntryOptions;
  reason?: string;
}
