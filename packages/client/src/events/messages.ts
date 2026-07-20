import type * as types from "@eunia/types";
import { Message, type StructureContext } from "@eunia/structures";
import type { DispatchHandlerMap } from "./types";

export const messageHandlers: DispatchHandlerMap = {
  MESSAGE_CREATE(client, ctx, data) {
    const raw = data as types.Message;
    cacheMessage(ctx, raw);
    const message = new Message(raw, ctx);
    void client.handleCommand(message).catch(() => undefined);
    client.emit("messageCreate", message);
  },

  MESSAGE_UPDATE(client, ctx, data) {
    const patch = data as types.MessageUpdateEvent;
    const previousRaw = ctx.cache.messages.resolve(patch.id);
    const raw = previousRaw === undefined
      ? isCompleteMessage(patch)
        ? patch
        : undefined
      : { ...previousRaw, ...patch };
    if (raw !== undefined) cacheMessage(ctx, raw);
    client.emit(
      "messageUpdate",
      raw === undefined ? undefined : new Message(raw, ctx),
      previousRaw === undefined ? undefined : new Message(previousRaw, ctx),
      Object.freeze({ ...patch }),
    );
  },

  MESSAGE_DELETE(client, ctx, data) {
    const event = data as types.MessageDeleteEvent;
    const previousRaw = ctx.cache.messages.resolve(event.id);
    ctx.cache.messages.delete(event.id);
    client.emit("messageDelete", {
      ...event,
      ...(previousRaw === undefined ? {} : { message: new Message(previousRaw, ctx) }),
    });
  },

  MESSAGE_DELETE_BULK(client, ctx, data) {
    const event = data as types.MessageDeleteBulkEvent;
    const messages: Message[] = [];
    for (const id of event.ids) {
      const raw = ctx.cache.messages.resolve(id);
      if (raw !== undefined) messages.push(new Message(raw, ctx));
      ctx.cache.messages.delete(id);
    }
    client.emit("messageDeleteBulk", {
      ...event,
      messages: Object.freeze(messages),
    });
  },
};

function cacheMessage(
  ctx: StructureContext,
  raw: types.Message,
): void {
  ctx.cache.messages.set(raw.id, raw);
  ctx.cache.users.set(raw.author.id, raw.author);
}

function isCompleteMessage(value: types.MessageUpdateEvent): value is types.Message {
  return (
    value.author !== undefined &&
    value.content !== undefined &&
    value.timestamp !== undefined &&
    value.edited_timestamp !== undefined &&
    value.tts !== undefined &&
    value.mention_everyone !== undefined &&
    value.mentions !== undefined &&
    value.mention_roles !== undefined &&
    value.attachments !== undefined &&
    value.embeds !== undefined &&
    value.pinned !== undefined &&
    value.type !== undefined
  );
}
