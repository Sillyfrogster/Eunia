import { routePath } from "@eunia/rest";
import type { StructureContext } from "@eunia/structures";
import { requireId } from "./cached";

/** Reaction REST operations. */
export class ReactionsDomain {
  constructor(private readonly ctx: StructureContext) {}

  /** Adds the bot's reaction. */
  async add(channelId: string, messageId: string, emoji: string): Promise<void> {
    requireId(channelId, messageId, emoji);
    await this.ctx.rest.put(
      routePath("/channels/{channelId}/messages/{messageId}/reactions/{emoji}/@me", {
        channelId,
        messageId,
        emoji,
      }),
    );
  }

  /** Removes one user's reaction; the bot's own when no user id is given. */
  async remove(
    channelId: string,
    messageId: string,
    emoji: string,
    userId = "@me",
  ): Promise<void> {
    requireId(channelId, messageId, emoji);
    await this.ctx.rest.delete(
      routePath("/channels/{channelId}/messages/{messageId}/reactions/{emoji}/{userId}", {
        channelId,
        messageId,
        emoji,
        userId,
      }),
    );
  }

  /** Removes every reaction, or every reaction for one emoji. */
  async clear(channelId: string, messageId: string, emoji?: string): Promise<void> {
    requireId(channelId, messageId);
    await this.ctx.rest.delete(
      emoji === undefined
        ? routePath("/channels/{channelId}/messages/{messageId}/reactions", {
            channelId,
            messageId,
          })
        : routePath("/channels/{channelId}/messages/{messageId}/reactions/{emoji}", {
            channelId,
            messageId,
            emoji,
          }),
    );
  }
}
