import { User } from "@eunia/structures";
import type * as types from "@eunia/types";
import { patchCachedGuild } from "./cache";
import type { DispatchHandlerMap } from "./types";

export const guildResourceHandlers: DispatchHandlerMap = {
  GUILD_BAN_ADD(client, ctx, data) {
    const event = data as types.GuildBanEvent;
    ctx.cache.users.set(event.user.id, event.user);
    client.emit("guildBanAdd", {
      guildId: event.guild_id,
      user: new User(event.user, ctx),
    });
  },

  GUILD_BAN_REMOVE(client, ctx, data) {
    const event = data as types.GuildBanEvent;
    ctx.cache.users.set(event.user.id, event.user);
    client.emit("guildBanRemove", {
      guildId: event.guild_id,
      user: new User(event.user, ctx),
    });
  },

  GUILD_EMOJIS_UPDATE(client, ctx, data) {
    const event = data as types.GuildEmojisUpdateEvent;
    patchCachedGuild(ctx, event.guild_id, { emojis: event.emojis });
    client.emit("guildEmojisUpdate", event);
  },

  GUILD_STICKERS_UPDATE(client, ctx, data) {
    const event = data as types.GuildStickersUpdateEvent;
    patchCachedGuild(ctx, event.guild_id, { stickers: event.stickers });
    client.emit("guildStickersUpdate", event);
  },

  GUILD_INTEGRATIONS_UPDATE(client, _ctx, data) {
    client.emit("guildIntegrationsUpdate", data as types.GuildIntegrationsUpdateEvent);
  },

  INTEGRATION_CREATE(client, _ctx, data) {
    client.emit("integrationCreate", data as types.IntegrationCreateEvent);
  },

  INTEGRATION_UPDATE(client, _ctx, data) {
    client.emit("integrationUpdate", data as types.IntegrationUpdateEvent);
  },

  INTEGRATION_DELETE(client, _ctx, data) {
    client.emit("integrationDelete", data as types.IntegrationDeleteEvent);
  },

  GUILD_SCHEDULED_EVENT_CREATE(client, _ctx, data) {
    client.emit("guildScheduledEventCreate", data as types.GuildScheduledEvent);
  },

  GUILD_SCHEDULED_EVENT_UPDATE(client, _ctx, data) {
    client.emit("guildScheduledEventUpdate", data as types.GuildScheduledEvent);
  },

  GUILD_SCHEDULED_EVENT_DELETE(client, _ctx, data) {
    client.emit("guildScheduledEventDelete", data as types.GuildScheduledEvent);
  },

  GUILD_SCHEDULED_EVENT_USER_ADD(client, _ctx, data) {
    client.emit(
      "guildScheduledEventUserAdd",
      data as types.GuildScheduledEventUserEvent,
    );
  },

  GUILD_SCHEDULED_EVENT_USER_REMOVE(client, _ctx, data) {
    client.emit(
      "guildScheduledEventUserRemove",
      data as types.GuildScheduledEventUserEvent,
    );
  },

  INVITE_CREATE(client, _ctx, data) {
    client.emit("inviteCreate", data as types.InviteCreateEvent);
  },

  INVITE_DELETE(client, _ctx, data) {
    client.emit("inviteDelete", data as types.InviteDeleteEvent);
  },
};
