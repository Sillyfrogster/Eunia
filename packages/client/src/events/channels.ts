import type * as types from "@eunia/types";
import {
  Channel,
  removeCachedGuildChannel,
  upsertCachedGuildChannel,
  type StructureContext,
} from "@eunia/structures";
import type { Client } from "../client";
import type { DispatchHandlerMap } from "./types";

const create = (client: Client, ctx: StructureContext, data: unknown): void => {
  const raw = data as types.Channel;
  upsertCachedGuildChannel(ctx, raw);
  client.emit("channelCreate", new Channel(raw, ctx));
};

const update = (client: Client, ctx: StructureContext, data: unknown): void => {
  const patch = data as types.Channel;
  const previousRaw = ctx.cache.channels.resolve(patch.id);
  const raw = previousRaw === undefined ? patch : { ...previousRaw, ...patch };
  upsertCachedGuildChannel(ctx, raw);
  client.emit(
    "channelUpdate",
    new Channel(raw, ctx),
    previousRaw === undefined ? undefined : new Channel(previousRaw, ctx),
  );
};

const remove = (client: Client, ctx: StructureContext, data: unknown): void => {
  const event = data as types.Channel;
  const previousRaw = ctx.cache.channels.resolve(event.id) ?? event;
  removeCachedGuildChannel(ctx, previousRaw.guild_id, event.id);
  client.emit("channelDelete", new Channel(previousRaw, ctx));
};

export const channelHandlers: DispatchHandlerMap = {
  CHANNEL_CREATE: create,
  CHANNEL_UPDATE: update,
  CHANNEL_DELETE: remove,
  THREAD_CREATE: create,
  THREAD_UPDATE: update,
  THREAD_DELETE: remove,
};
