import type { ISO8601Timestamp, Snowflake } from "./common";

export enum SubscriptionStatus {
  Active = 0,
  Inactive = 1,
  Ending = 2,
}

export interface Subscription {
  id: Snowflake;
  user_id: Snowflake;
  sku_ids: Snowflake[];
  entitlement_ids: Snowflake[];
  renewal_sku_ids: Snowflake[] | null;
  current_period_start: ISO8601Timestamp;
  current_period_end: ISO8601Timestamp;
  status: SubscriptionStatus;
  canceled_at: ISO8601Timestamp | null;
  country?: string;
}
