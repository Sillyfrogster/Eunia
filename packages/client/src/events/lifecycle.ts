import type * as types from "@eunia/types";
import { User } from "@eunia/structures";
import type { DispatchHandlerMap } from "./types";

export const lifecycleHandlers: DispatchHandlerMap = {
  READY(client, ctx, data, shardId) {
    const ready = data as types.ReadyEvent;
    const raw: types.User = { ...ready.user, bot: true };
    ctx.cache.users.set(raw.id, raw);
    client.recordReady(ready, shardId);
  },

  USER_UPDATE(client, ctx, data) {
    const raw = data as types.User;
    const previous = ctx.cache.users.resolve(raw.id);
    ctx.cache.users.set(raw.id, raw);
    client.emit(
      "userUpdate",
      new User(raw, ctx),
      previous === undefined ? undefined : new User(previous, ctx),
    );
  },
};
