import type { MemoryStoreChange } from "@eunia/cache";
import type * as types from "@eunia/types";
import {
  memberCacheKey,
  type CachedRole,
  type StructureCache,
  type StructureContext,
} from "./context";

const relationIndexes = new WeakMap<StructureCache, GuildRelationIndex>();
const GUILD_RELATION_MARKERS = "guild-relations";

type CachedGuildRelation = "channel" | "member" | "role";

export async function purgeCachedGuildRelations(
  ctx: StructureContext,
  guildId: string,
): Promise<void> {
  const channels = new Set(cachedGuildChannelIds(ctx, guildId));
  const members = new Set(cachedGuildMemberIds(ctx, guildId));
  const roles = new Set(cachedGuildRoleIds(ctx, guildId));

  for (const id of channels) ctx.cache.channels.delete(id);
  for (const userId of members) {
    ctx.cache.members.delete(memberCacheKey(guildId, userId));
  }
  for (const id of roles) ctx.cache.roles.delete(id);
  for (const [id, message] of ctx.cache.messages.entries()) {
    if (message.guild_id === guildId) ctx.cache.messages.delete(id);
  }
  if (!ctx.cache.hasRemoteAdapter) return;

  const markerStore = relationMarkerStore(ctx);
  const markers = await markerStore.list(`${guildId}:`);
  for (const marker of markers) {
    const relation = parseGuildRelationMarker(marker, guildId);
    if (relation === undefined) continue;
    if (relation.kind === "channel") ctx.cache.channels.delete(relation.id);
    else if (relation.kind === "member") {
      ctx.cache.members.delete(memberCacheKey(guildId, relation.id));
    } else {
      ctx.cache.roles.delete(relation.id);
    }
    markerStore.delete(marker);
  }
  await Promise.all([
    ctx.cache.channels.flush(),
    ctx.cache.members.flush(),
    ctx.cache.roles.flush(),
    ctx.cache.messages.flush(),
    markerStore.flush(),
  ]);
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

export function trackGuildRelation(
  ctx: StructureContext,
  guildId: string,
  kind: CachedGuildRelation,
  id: string,
): void {
  if (!ctx.cache.hasRemoteAdapter) return;
  relationMarkerStore(ctx).set(guildRelationMarker(guildId, kind, id), true);
}

export function untrackGuildRelation(
  ctx: StructureContext,
  guildId: string,
  kind: CachedGuildRelation,
  id: string,
): void {
  if (!ctx.cache.hasRemoteAdapter) return;
  relationMarkerStore(ctx).delete(guildRelationMarker(guildId, kind, id));
}

function relationMarkerStore(ctx: StructureContext) {
  return ctx.cache.domain<boolean>(GUILD_RELATION_MARKERS, { maxSize: 10_000 });
}

function guildRelationMarker(
  guildId: string,
  kind: CachedGuildRelation,
  id: string,
): string {
  return `${guildId}:${kind}:${id}`;
}

function parseGuildRelationMarker(
  marker: string,
  guildId: string,
): { kind: CachedGuildRelation; id: string } | undefined {
  const prefix = `${guildId}:`;
  if (!marker.startsWith(prefix)) return undefined;
  const [kind, id, extra] = marker.slice(prefix.length).split(":");
  if (
    extra !== undefined ||
    id === undefined ||
    (kind !== "channel" && kind !== "member" && kind !== "role")
  ) {
    return undefined;
  }
  return { kind, id };
}
