import type { Cache } from "@eunia/cache";
import type { EuniaRest } from "@eunia/rest";
import { ChannelType } from "@eunia/types";
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

export function upsertCachedGuildChannel(
  ctx: StructureContext,
  raw: types.Channel,
): void {
  ctx.cache.channels.set(raw.id, raw);
  const guildId = raw.guild_id;
  if (guildId === undefined) return;
  const guild = ctx.cache.guilds.resolve(guildId);
  if (guild === undefined) return;

  const channels = (guild.channels ?? []).filter((channel) => channel.id !== raw.id);
  const threads = (guild.threads ?? []).filter((thread) => thread.id !== raw.id);
  if (isThread(raw)) threads.push(raw);
  else channels.push(raw);
  ctx.cache.guilds.set(guildId, { ...guild, channels, threads });
}

export function removeCachedGuildChannel(
  ctx: StructureContext,
  guildId: string | undefined,
  channelId: string,
): void {
  ctx.cache.channels.delete(channelId);
  if (guildId === undefined) return;
  const guild = ctx.cache.guilds.resolve(guildId);
  if (guild === undefined) return;
  ctx.cache.guilds.set(guildId, {
    ...guild,
    channels: (guild.channels ?? []).filter((channel) => channel.id !== channelId),
    threads: (guild.threads ?? []).filter((thread) => thread.id !== channelId),
  });
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

  const guild = ctx.cache.guilds.resolve(guildId);
  if (guild === undefined) return;
  const members = new Map<string, types.GuildMember>();
  for (const member of guild.members ?? []) {
    const userId = member.user?.id;
    if (userId !== undefined) members.set(userId, member);
  }
  for (const { userId, raw } of entries) members.set(userId, raw);
  ctx.cache.guilds.set(guildId, { ...guild, members: [...members.values()] });
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
  const guild = ctx.cache.guilds.resolve(guildId);
  if (guild === undefined) return;
  ctx.cache.guilds.set(guildId, {
    ...guild,
    members: (guild.members ?? []).filter((member) => member.user?.id !== userId),
  });
}

function isThread(channel: types.Channel): boolean {
  return (
    channel.type === ChannelType.AnnouncementThread ||
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread
  );
}
