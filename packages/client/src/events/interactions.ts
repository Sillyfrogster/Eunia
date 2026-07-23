import type * as types from "@eunia/types";
import { createInteraction, upsertCachedGuildMember } from "@eunia/structures";
import type { DispatchHandlerMap } from "./types";

export const interactionHandlers: DispatchHandlerMap = {
  INTERACTION_CREATE(client, ctx, data) {
    const raw = data as types.Interaction;
    const user = raw.member?.user ?? raw.user;
    if (user !== undefined) ctx.cache.users.set(user.id, user);
    if (raw.guild_id !== undefined && raw.member !== undefined && user !== undefined) {
      upsertCachedGuildMember(ctx, raw.guild_id, user.id, raw.member);
    }

    const interaction = createInteraction(raw, ctx);
    client.handleGatewayCommand(interaction);
    client.emit("interactionCreate", interaction);
  },
};
