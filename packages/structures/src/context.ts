import type { Cache, MemoryStoreChange } from "@eunia/cache";
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

const relationIndexes = new WeakMap<StructureCache, GuildRelationIndex>();

export function memberCacheKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function setCachedRole(
  ctx: StructureContext,
  guildId: string,
  raw: types.Role,
): void {
  relationIndex(ctx);
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
  relationIndex(ctx);
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
  relationIndex(ctx);
  ctx.cache.channels.set(raw.id, raw);
}

export function removeCachedGuildChannel(
  ctx: StructureContext,
  _guildId: string | undefined,
  channelId: string,
): void {
  relationIndex(ctx);
  ctx.cache.channels.delete(channelId);
}

export function upsertCachedGuildMembers(
  ctx: StructureContext,
  guildId: string,
  entries: readonly { userId: string; raw: types.GuildMember }[],
): void {
  relationIndex(ctx);
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
  relationIndex(ctx);
  ctx.cache.members.delete(memberCacheKey(guildId, userId));
}

export function cachedGuildChannelIds(
  ctx: StructureContext,
  guildId: string,
): readonly string[] {
  return relationIndex(ctx).channelIds(guildId);
}

export function cachedGuildMemberIds(
  ctx: StructureContext,
  guildId: string,
): readonly string[] {
  return relationIndex(ctx).memberIds(guildId);
}

export function cachedGuildRoleIds(
  ctx: StructureContext,
  guildId: string,
): readonly string[] {
  return relationIndex(ctx).roleIds(guildId);
}

class GuildRelationIndex {
  private readonly channels = new Map<string, Set<string>>();
  private readonly members = new Map<string, Set<string>>();
  private readonly roles = new Map<string, Set<string>>();

  constructor(private readonly cache: StructureCache) {
    cache.channels.hot.subscribe((change) => this.channelChanged(change));
    cache.members.hot.subscribe((change) => this.memberChanged(change));
    cache.roles.hot.subscribe((change) => this.roleChanged(change));

    for (const [id, raw] of cache.channels.entries()) this.addChannel(id, raw);
    for (const key of cache.members.keys()) this.addMember(key);
    for (const [id, cached] of cache.roles.entries()) this.add(this.roles, cached.guildId, id);
  }

  channelIds(guildId: string): readonly string[] {
    return [...(this.channels.get(guildId) ?? [])];
  }

  memberIds(guildId: string): readonly string[] {
    return [...(this.members.get(guildId) ?? [])];
  }

  roleIds(guildId: string): readonly string[] {
    return [...(this.roles.get(guildId) ?? [])];
  }

  private channelChanged(change: MemoryStoreChange<types.Channel>): void {
    if (change.type === "clear") {
      this.channels.clear();
      return;
    }
    if (change.type === "set") {
      if (change.previous !== undefined) this.removeChannel(change.id, change.previous);
      this.addChannel(change.id, change.value);
      return;
    }
    this.removeChannel(change.id, change.value);
  }

  private memberChanged(change: MemoryStoreChange<types.GuildMember>): void {
    if (change.type === "clear") {
      this.members.clear();
      return;
    }
    if (change.type === "set") {
      this.addMember(change.id);
      return;
    }
    this.removeMember(change.id);
  }

  private roleChanged(change: MemoryStoreChange<CachedRole>): void {
    if (change.type === "clear") {
      this.roles.clear();
      return;
    }
    if (change.type === "set") {
      if (change.previous !== undefined) {
        this.remove(this.roles, change.previous.guildId, change.id);
      }
      this.add(this.roles, change.value.guildId, change.id);
      return;
    }
    this.remove(this.roles, change.value.guildId, change.id);
  }

  private addChannel(id: string, raw: types.Channel): void {
    if (raw.guild_id !== undefined) this.add(this.channels, raw.guild_id, id);
  }

  private removeChannel(id: string, raw: types.Channel): void {
    if (raw.guild_id !== undefined) this.remove(this.channels, raw.guild_id, id);
  }

  private addMember(key: string): void {
    const guildId = guildIdFromMemberKey(key);
    if (guildId !== undefined) this.add(this.members, guildId, key.slice(guildId.length + 1));
  }

  private removeMember(key: string): void {
    const guildId = guildIdFromMemberKey(key);
    if (guildId !== undefined) {
      this.remove(this.members, guildId, key.slice(guildId.length + 1));
    }
  }

  private add(index: Map<string, Set<string>>, guildId: string, id: string): void {
    let ids = index.get(guildId);
    if (ids === undefined) {
      ids = new Set();
      index.set(guildId, ids);
    }
    ids.add(id);
  }

  private remove(index: Map<string, Set<string>>, guildId: string, id: string): void {
    const ids = index.get(guildId);
    if (ids === undefined) return;
    ids.delete(id);
    if (ids.size === 0) index.delete(guildId);
  }
}

function relationIndex(ctx: StructureContext): GuildRelationIndex {
  let index = relationIndexes.get(ctx.cache);
  if (index === undefined) {
    index = new GuildRelationIndex(ctx.cache);
    relationIndexes.set(ctx.cache, index);
  }
  return index;
}

function guildIdFromMemberKey(key: string): string | undefined {
  const separator = key.indexOf(":");
  return separator === -1 ? undefined : key.slice(0, separator);
}
