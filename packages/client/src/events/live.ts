import { upsertCachedGuildMember } from "@eunia/structures";
import type * as types from "@eunia/types";
import { patchCachedChannel } from "./cache";
import type { DispatchHandlerMap } from "./types";

export const liveHandlers: DispatchHandlerMap = {
  CHANNEL_PINS_UPDATE(client, ctx, data) {
    const event = data as types.ChannelPinsUpdateEvent;
    if (event.last_pin_timestamp !== undefined) {
      patchCachedChannel(ctx, event.channel_id, {
        last_pin_timestamp: event.last_pin_timestamp,
      });
    }
    client.emit("channelPinsUpdate", event);
  },

  PRESENCE_UPDATE(client, ctx, data) {
    const event = data as types.PresenceUpdateEvent;
    const user = ctx.cache.users.resolve(event.user.id);
    if (user !== undefined) ctx.cache.users.set(user.id, { ...user, ...event.user });
    client.emit("presenceUpdate", event);
  },

  TYPING_START(client, ctx, data) {
    const event = data as types.TypingStartEvent;
    if (event.guild_id !== undefined && event.member !== undefined) {
      upsertCachedGuildMember(ctx, event.guild_id, event.user_id, event.member);
    }
    client.emit("typingStart", event);
  },

  WEBHOOKS_UPDATE(client, _ctx, data) {
    client.emit("webhooksUpdate", data as types.WebhooksUpdateEvent);
  },
};
