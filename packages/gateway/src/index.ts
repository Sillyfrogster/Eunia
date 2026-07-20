/**
 * Public surface of @eunia/gateway. Anything not exported here is an
 * internal detail.
 */

export {
  Shard,
  ShardState,
  type ShardOptions,
  type ReconnectInfo,
  type CloseInfo,
} from "./shard";
export {
  ShardManager,
  shardIdForGuild,
  type ShardManagerOptions,
  type ShardPlan,
} from "./manager";
export {
  GATEWAY_VERSION,
  GatewayOpcode,
  Intents,
  GatewayCloseCode,
  FATAL_CLOSE_CODES,
} from "./constants";
export type {
  GatewayPayload,
  HelloData,
  IdentifyData,
  ResumeData,
  ReadyData,
  GatewayBotInfo,
  GatewayActivity,
  GatewayPresence,
  RequestGuildMembersData,
} from "./types";
export { ActivityType } from "./types";
