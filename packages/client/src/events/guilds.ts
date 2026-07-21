import type * as types from "@eunia/types";
import {
  Guild,
  GuildMember,
  Role,
  memberCacheKey,
  removeCachedGuildMember,
  resolveCachedRole,
  setCachedGuild,
  setCachedRole,
  upsertCachedGuildMember,
  upsertCachedGuildMembers,
  type StructureContext,
} from "@eunia/structures";
import type { DispatchHandlerMap } from "./types";

export const guildHandlers: DispatchHandlerMap = {
  GUILD_CREATE(client, ctx, data) {
    const raw = data as types.Guild;
    setCachedGuild(ctx, raw);
    client.emit("guildCreate", new Guild(raw, ctx));
  },

  GUILD_UPDATE(client, ctx, data) {
    const patch = data as types.Guild;
    const previousRaw = ctx.cache.guilds.resolve(patch.id);
    const raw = previousRaw === undefined ? patch : { ...previousRaw, ...patch };
    setCachedGuild(ctx, raw);
    client.emit(
      "guildUpdate",
      new Guild(raw, ctx),
      previousRaw === undefined ? undefined : new Guild(previousRaw, ctx),
    );
  },

  GUILD_DELETE(client, ctx, data) {
    const event = data as types.GuildDeleteEvent;
    const previousRaw = ctx.cache.guilds.resolve(event.id);
    const unavailable = event.unavailable === true;
    if (unavailable && previousRaw !== undefined) {
      ctx.cache.guilds.set(event.id, { ...previousRaw, unavailable: true });
    } else {
      ctx.cache.guilds.delete(event.id);
      clearGuildCaches(ctx, event.id, previousRaw);
    }
    client.emit("guildDelete", {
      id: event.id,
      unavailable,
      ...(previousRaw === undefined ? {} : { guild: new Guild(previousRaw, ctx) }),
    });
  },

  GUILD_MEMBER_ADD(client, ctx, data) {
    const { guild_id: guildId, ...raw } = data as types.GuildMemberAddEvent;
    const userId = raw.user?.id;
    if (userId === undefined) return;
    upsertCachedGuildMember(ctx, guildId, userId, raw);
    client.emit("guildMemberAdd", new GuildMember(raw, ctx, guildId, userId));
  },

  GUILD_MEMBER_UPDATE(client, ctx, data) {
    const event = data as types.GuildMemberUpdateEvent;
    const key = memberCacheKey(event.guild_id, event.user.id);
    const previousRaw = ctx.cache.members.resolve(key);
    const { guild_id: _guildId, joined_at: _joinedAt, ...update } = event;
    const raw: types.GuildMember = {
      ...previousRaw,
      ...update,
      user: event.user,
      roles: event.roles,
      joined_at: event.joined_at ?? previousRaw?.joined_at ?? new Date(0).toISOString(),
      deaf: event.deaf ?? previousRaw?.deaf ?? false,
      mute: event.mute ?? previousRaw?.mute ?? false,
      flags: previousRaw?.flags ?? 0,
    };
    upsertCachedGuildMember(ctx, event.guild_id, event.user.id, raw);
    client.emit(
      "guildMemberUpdate",
      new GuildMember(raw, ctx, event.guild_id, event.user.id),
      previousRaw === undefined
        ? undefined
        : new GuildMember(previousRaw, ctx, event.guild_id, event.user.id),
    );
  },

  GUILD_MEMBER_REMOVE(client, ctx, data) {
    const event = data as types.GuildMemberRemoveEvent;
    const key = memberCacheKey(event.guild_id, event.user.id);
    const previousRaw = ctx.cache.members.resolve(key);
    removeCachedGuildMember(ctx, event.guild_id, event.user.id);
    ctx.cache.users.set(event.user.id, event.user);
    client.emit("guildMemberRemove", {
      guildId: event.guild_id,
      userId: event.user.id,
      ...(previousRaw === undefined
        ? {}
        : { member: new GuildMember(previousRaw, ctx, event.guild_id, event.user.id) }),
    });
  },

  GUILD_MEMBERS_CHUNK(_client, ctx, data) {
    const chunk = data as {
      guild_id: string;
      members: types.GuildMember[];
    };
    upsertCachedGuildMembers(
      ctx,
      chunk.guild_id,
      chunk.members.flatMap((raw) => {
        const userId = raw.user?.id;
        return userId === undefined ? [] : [{ userId, raw }];
      }),
    );
  },

  GUILD_ROLE_CREATE(client, ctx, data) {
    const event = data as types.GuildRoleEvent;
    setCachedRole(ctx, event.guild_id, event.role);
    client.emit("roleCreate", new Role(event.role, ctx, event.guild_id));
  },

  GUILD_ROLE_UPDATE(client, ctx, data) {
    const event = data as types.GuildRoleEvent;
    const previous = resolveCachedRole(ctx, event.guild_id, event.role.id);
    setCachedRole(ctx, event.guild_id, event.role);
    client.emit(
      "roleUpdate",
      new Role(event.role, ctx, event.guild_id),
      previous === undefined ? undefined : new Role(previous, ctx, event.guild_id),
    );
  },

  GUILD_ROLE_DELETE(client, ctx, data) {
    const event = data as types.GuildRoleDeleteEvent;
    const previous = resolveCachedRole(ctx, event.guild_id, event.role_id);
    ctx.cache.roles.delete(event.role_id);
    client.emit("roleDelete", {
      guildId: event.guild_id,
      roleId: event.role_id,
      ...(previous === undefined ? {} : { role: new Role(previous, ctx, event.guild_id) }),
    });
  },
};

function clearGuildCaches(
  ctx: StructureContext,
  guildId: string,
  guild: types.Guild | undefined,
): void {
  for (const [id, channel] of ctx.cache.channels.entries()) {
    if (channel.guild_id === guildId) ctx.cache.channels.delete(id);
  }
  for (const [id, message] of ctx.cache.messages.entries()) {
    if (message.guild_id === guildId) ctx.cache.messages.delete(id);
  }
  for (const key of ctx.cache.members.keys()) {
    if (key.startsWith(`${guildId}:`)) ctx.cache.members.delete(key);
  }
  for (const role of guild?.roles ?? []) ctx.cache.roles.delete(role.id);
}
