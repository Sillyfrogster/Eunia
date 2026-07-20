import type { ISO8601Timestamp, Snowflake } from "./common";

export enum EntitlementType {
  Purchase = 1,
  PremiumSubscription = 2,
  DeveloperGift = 3,
  TestModePurchase = 4,
  FreePurchase = 5,
  UserGift = 6,
  PremiumPurchase = 7,
  ApplicationSubscription = 8,
}

export interface Entitlement {
  id: Snowflake;
  sku_id: Snowflake;
  application_id: Snowflake;
  user_id?: Snowflake;
  type: EntitlementType;
  deleted: boolean;
  starts_at?: ISO8601Timestamp;
  ends_at?: ISO8601Timestamp;
  guild_id?: Snowflake;
  consumed?: boolean;
  subscription_id?: Snowflake;
}
