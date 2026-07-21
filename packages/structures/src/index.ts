export { Channel, type ChannelEditInput } from "./structures/Channel";
export { Guild, type GuildBanInput, type RoleCreateInput } from "./structures/Guild";
export {
  GuildMember,
  type BanInput,
  type MemberEditInput,
} from "./structures/GuildMember";
export {
  createInteraction,
  isInteraction,
  InteractionAlreadyAcknowledgedError,
  InteractionNotAcknowledgedError,
  type DeferOptions,
  type Interaction,
  type InteractionKind,
  type InteractionState,
  type ModalFieldValue,
  type OriginalMessage,
} from "./structures/Interaction";
export { Message } from "./structures/Message";
export { Role, type RoleEditInput } from "./structures/Role";
export { User } from "./structures/User";

export {
  CDN_BASE_URL,
  DISCORD_EPOCH,
  cdnAssetUrl,
  snowflakeTimestamp,
  type CDNImageOptions,
  type ImageExtension,
} from "./utils/discord";
export {
  normalizeSendable,
  splitMessageFiles,
  type MessageRequestParts,
  type Sendable,
} from "./utils/messages";
export type { AuditLogOptions } from "./utils/rest";

export {
  cachedGuildChannelIds,
  cachedGuildMemberIds,
  cachedGuildRoleIds,
  getCachedRole,
  memberCacheKey,
  removeCachedGuildChannel,
  removeCachedGuildMember,
  resolveCachedRole,
  setCachedGuild,
  setCachedRole,
  upsertCachedGuildChannel,
  upsertCachedGuildMember,
  upsertCachedGuildMembers,
  type CachedRole,
  type StructureCache,
  type StructureCacheShape,
  type StructureContext,
} from "./context";
