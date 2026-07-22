import {
  Channel,
  removeCachedGuildChannel,
  upsertCachedGuildChannel,
} from "@eunia/structures";
import type * as types from "@eunia/types";
import type { ThreadDeleteInfo } from "./client-events";
import type { DispatchHandlerMap } from "./types";

export const threadHandlers: DispatchHandlerMap = {
  THREAD_CREATE(client, ctx, data) {
    const raw = data as types.ThreadCreateEvent;
    upsertCachedGuildChannel(ctx, raw);
    client.emit("threadCreate", new Channel(raw, ctx));
  },

  THREAD_UPDATE(client, ctx, data) {
    const patch = data as types.ChannelUpdateEvent;
    const previousRaw = ctx.cache.channels.resolve(patch.id);
    const raw = previousRaw === undefined ? patch : { ...previousRaw, ...patch };
    upsertCachedGuildChannel(ctx, raw);
    client.emit(
      "threadUpdate",
      new Channel(raw, ctx),
      previousRaw === undefined ? undefined : new Channel(previousRaw, ctx),
    );
  },

  THREAD_DELETE(client, ctx, data) {
    const event = data as types.ThreadDeleteEvent;
    const previousRaw = ctx.cache.channels.resolve(event.id);
    removeCachedGuildChannel(ctx, event.guild_id, event.id);
    const info: ThreadDeleteInfo = {
      ...event,
      ...(previousRaw === undefined ? {} : { thread: new Channel(previousRaw, ctx) }),
    };
    client.emit("threadDelete", info);
  },

  THREAD_LIST_SYNC(client, ctx, data) {
    const event = data as types.ThreadListSyncEvent;
    for (const thread of event.threads) {
      upsertCachedGuildChannel(ctx, { ...thread, guild_id: event.guild_id });
    }
    for (const member of event.members) {
      if (member.id === undefined) continue;
      const thread = ctx.cache.channels.resolve(member.id);
      if (thread !== undefined) {
        upsertCachedGuildChannel(ctx, { ...thread, member });
      }
    }
    client.emit("threadListSync", event);
  },

  THREAD_MEMBER_UPDATE(client, ctx, data) {
    const event = data as types.ThreadMemberUpdateEvent;
    if (event.id !== undefined) {
      const thread = ctx.cache.channels.resolve(event.id);
      if (thread !== undefined) upsertCachedGuildChannel(ctx, { ...thread, member: event });
    }
    client.emit("threadMemberUpdate", event);
  },

  THREAD_MEMBERS_UPDATE(client, ctx, data) {
    const event = data as types.ThreadMembersUpdateEvent;
    const thread = ctx.cache.channels.resolve(event.id);
    if (thread !== undefined) {
      upsertCachedGuildChannel(ctx, { ...thread, member_count: event.member_count });
    }
    client.emit("threadMembersUpdate", event);
  },
};
