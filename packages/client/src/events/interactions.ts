import type * as types from "@eunia/types";
import { createInteraction, memberCacheKey } from "@eunia/structures";
import type { DispatchHandlerMap } from "./types";

export const interactionHandlers: DispatchHandlerMap = {
  INTERACTION_CREATE(client, ctx, data) {
    const raw = data as types.Interaction;
    const user = raw.member?.user ?? raw.user;
    if (user !== undefined) ctx.cache.users.set(user.id, user);
    if (raw.guild_id !== undefined && raw.member !== undefined && user !== undefined) {
      ctx.cache.members.set(memberCacheKey(raw.guild_id, user.id), raw.member);
    }

    const interaction = createInteraction(raw, ctx);
    void client.handleCommand(interaction).catch(() => undefined);
    client.emit("interactionCreate", interaction);
  },
};
