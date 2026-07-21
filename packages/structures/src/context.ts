import type { Cache } from "@eunia/cache";
import type { EuniaRest } from "@eunia/rest";
import type * as types from "@eunia/types";

export interface StructureCacheShape {
  user: types.User;
  guild: types.Guild;
  channel: types.Channel;
  message: types.Message;
  member: types.GuildMember;
  role: CachedRole;
}

export interface CachedRole {
  guildId: string;
  raw: types.Role;
}

export type StructureCache = Cache<StructureCacheShape>;

export interface StructureContext {
  rest: EuniaRest;
  cache: StructureCache;
}

export function memberCacheKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function setCachedRole(
  ctx: StructureContext,
  guildId: string,
  raw: types.Role,
): void {
  ctx.cache.roles.set(raw.id, { guildId, raw });
}

export function resolveCachedRole(
  ctx: StructureContext,
  guildId: string,
  roleId: string,
): types.Role | undefined {
  const cached = ctx.cache.roles.resolve(roleId);
  return cached?.guildId === guildId ? cached.raw : undefined;
}

export async function getCachedRole(
  ctx: StructureContext,
  guildId: string,
  roleId: string,
): Promise<types.Role | undefined> {
  const cached = await ctx.cache.roles.get(roleId);
  return cached?.guildId === guildId ? cached.raw : undefined;
}

export function setCachedGuild(ctx: StructureContext, raw: types.Guild): void {
  const channels = raw.channels ?? [];
  const threads = raw.threads ?? [];
  const members = raw.members ?? [];
  const roles = raw.roles ?? [];

  ctx.cache.guilds.set(raw.id, {
    ...raw,
    channels: [],
    threads: [],
    members: [],
    roles: [],
  });

  for (const channel of channels) {
    ctx.cache.channels.set(channel.id, { ...channel, guild_id: raw.id });
  }
  for (const thread of threads) {
    ctx.cache.channels.set(thread.id, { ...thread, guild_id: raw.id });
  }
  for (const role of roles) setCachedRole(ctx, raw.id, role);
  for (const member of members) {
    const user = member.user;
    if (user === undefined) continue;
    const userId = user.id;
    ctx.cache.members.set(memberCacheKey(raw.id, userId), member);
    ctx.cache.users.set(userId, user);
  }
}

export function upsertCachedGuildChannel(
  ctx: StructureContext,
  raw: types.Channel,
): void {
  ctx.cache.channels.set(raw.id, raw);
}

export function removeCachedGuildChannel(
  ctx: StructureContext,
  _guildId: string | undefined,
  channelId: string,
): void {
  ctx.cache.channels.delete(channelId);
}

export function upsertCachedGuildMembers(
  ctx: StructureContext,
  guildId: string,
  entries: readonly { userId: string; raw: types.GuildMember }[],
): void {
  for (const { userId, raw } of entries) {
    ctx.cache.members.set(memberCacheKey(guildId, userId), raw);
    if (raw.user !== undefined) ctx.cache.users.set(raw.user.id, raw.user);
  }
}

export function upsertCachedGuildMember(
  ctx: StructureContext,
  guildId: string,
  userId: string,
  raw: types.GuildMember,
): void {
  upsertCachedGuildMembers(ctx, guildId, [{ userId, raw }]);
}

export function removeCachedGuildMember(
  ctx: StructureContext,
  guildId: string,
  userId: string,
): void {
  ctx.cache.members.delete(memberCacheKey(guildId, userId));
}
