import type * as types from "@eunia/types";
import {
  addCachedReaction,
  removeAllCachedReactions,
  removeCachedEmojiReactions,
  removeCachedReaction,
  updateCachedPollVote,
} from "./message-state";
import type { DispatchHandlerMap } from "./types";

export const messageActivityHandlers: DispatchHandlerMap = {
  MESSAGE_REACTION_ADD(client, ctx, data) {
    const event = data as types.MessageReactionAddEvent;
    addCachedReaction(ctx, event, client.botId);
    client.emit("messageReactionAdd", event);
  },

  MESSAGE_REACTION_REMOVE(client, ctx, data) {
    const event = data as types.MessageReactionRemoveEvent;
    removeCachedReaction(ctx, event, client.botId);
    client.emit("messageReactionRemove", event);
  },

  MESSAGE_REACTION_REMOVE_ALL(client, ctx, data) {
    const event = data as types.MessageReactionRemoveAllEvent;
    removeAllCachedReactions(ctx, event.message_id);
    client.emit("messageReactionRemoveAll", event);
  },

  MESSAGE_REACTION_REMOVE_EMOJI(client, ctx, data) {
    const event = data as types.MessageReactionRemoveEmojiEvent;
    removeCachedEmojiReactions(ctx, event.message_id, event.emoji);
    client.emit("messageReactionRemoveEmoji", event);
  },

  MESSAGE_POLL_VOTE_ADD(client, ctx, data) {
    const event = data as types.MessagePollVoteEvent;
    updateCachedPollVote(ctx, event, 1, client.botId);
    client.emit("messagePollVoteAdd", event);
  },

  MESSAGE_POLL_VOTE_REMOVE(client, ctx, data) {
    const event = data as types.MessagePollVoteEvent;
    updateCachedPollVote(ctx, event, -1, client.botId);
    client.emit("messagePollVoteRemove", event);
  },
};
