import type * as types from "@eunia/types";
import {
  memberCacheKey,
  type StructureContext,
} from "./context";
import {
  trackGuildRelation,
  untrackGuildRelation,
} from "./guild-relations";

export function setCachedRole(
  ctx: StructureContext,
  guildId: string,
  raw: types.Role,
): void {
  ctx.cache.roles.set(raw.id, { guildId, raw });
  trackGuildRelation(ctx, guildId, "role", raw.id);
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
    upsertCachedGuildChannel(ctx, { ...channel, guild_id: raw.id });
  }
  for (const thread of threads) {
    upsertCachedGuildChannel(ctx, { ...thread, guild_id: raw.id });
  }
  for (const role of roles) setCachedRole(ctx, raw.id, role);
  upsertCachedGuildMembers(
    ctx,
    raw.id,
    members.flatMap((member) => {
      const userId = member.user?.id;
      return userId === undefined ? [] : [{ userId, raw: member }];
    }),
  );
}

export function upsertCachedGuildChannel(
  ctx: StructureContext,
  raw: types.Channel,
): void {
  ctx.cache.channels.set(raw.id, raw);
  if (raw.guild_id !== undefined) {
    trackGuildRelation(ctx, raw.guild_id, "channel", raw.id);
  }
}

export function removeCachedGuildChannel(
  ctx: StructureContext,
  guildId: string | undefined,
  channelId: string,
): void {
  ctx.cache.channels.delete(channelId);
  if (guildId !== undefined) {
    untrackGuildRelation(ctx, guildId, "channel", channelId);
  }
}

export function upsertCachedGuildMembers(
  ctx: StructureContext,
  guildId: string,
  entries: readonly { userId: string; raw: types.GuildMember }[],
): void {
  for (const { userId, raw } of entries) {
    ctx.cache.members.set(memberCacheKey(guildId, userId), raw);
    if (raw.user !== undefined) ctx.cache.users.set(raw.user.id, raw.user);
    trackGuildRelation(ctx, guildId, "member", userId);
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
  untrackGuildRelation(ctx, guildId, "member", userId);
}

export function removeCachedRole(
  ctx: StructureContext,
  guildId: string,
  roleId: string,
): void {
  ctx.cache.roles.delete(roleId);
  untrackGuildRelation(ctx, guildId, "role", roleId);
}
