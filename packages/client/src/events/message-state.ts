import type { StructureContext } from "@eunia/structures";
import { ReactionType, type Message, type PartialEmoji, type Reaction } from "@eunia/types";
import type * as types from "@eunia/types";

type MessageUpdate = (message: Message) => Message | undefined;

export function updateCachedMessage(
  ctx: StructureContext,
  messageId: string,
  update: MessageUpdate,
): void {
  const message = ctx.cache.messages.resolve(messageId);
  if (message === undefined) return;
  const next = update(message);
  if (next !== undefined) ctx.cache.messages.set(messageId, next);
}

export function addCachedReaction(
  ctx: StructureContext,
  event: types.MessageReactionAddEvent,
  botId: string | undefined,
): void {
  updateCachedMessage(ctx, event.message_id, (message) => {
    const reactions = [...(message.reactions ?? [])];
    const index = reactions.findIndex((reaction) => sameEmoji(reaction.emoji, event.emoji));
    const burst = event.type === ReactionType.Burst;
    const current = index < 0 ? undefined : reactions[index];
    const reaction: Reaction = current === undefined
      ? {
          count: 1,
          count_details: { burst: burst ? 1 : 0, normal: burst ? 0 : 1 },
          me: !burst && event.user_id === botId,
          me_burst: burst && event.user_id === botId,
          emoji: {
            id: event.emoji.id,
            name: event.emoji.name,
            ...(event.emoji.animated === undefined
              ? {}
              : { animated: event.emoji.animated }),
          },
          burst_colors: event.burst_colors ?? [],
        }
      : {
          ...current,
          count: current.count + 1,
          count_details: {
            burst: current.count_details.burst + (burst ? 1 : 0),
            normal: current.count_details.normal + (burst ? 0 : 1),
          },
          me: current.me || (!burst && event.user_id === botId),
          me_burst: current.me_burst || (burst && event.user_id === botId),
          burst_colors: event.burst_colors ?? current.burst_colors,
        };
    if (index < 0) reactions.push(reaction);
    else reactions[index] = reaction;
    return { ...message, reactions };
  });
}

export function removeCachedReaction(
  ctx: StructureContext,
  event: types.MessageReactionRemoveEvent,
  botId: string | undefined,
): void {
  updateCachedMessage(ctx, event.message_id, (message) => {
    const reactions = [...(message.reactions ?? [])];
    const index = reactions.findIndex((reaction) => sameEmoji(reaction.emoji, event.emoji));
    if (index < 0) return undefined;

    const current = reactions[index];
    if (current === undefined) return undefined;
    if (current.count <= 1) {
      reactions.splice(index, 1);
      return { ...message, reactions };
    }

    const burst = event.type === ReactionType.Burst;
    const burstCount = Math.max(0, current.count_details.burst - (burst ? 1 : 0));
    reactions[index] = {
      ...current,
      count: current.count - 1,
      count_details: {
        burst: burstCount,
        normal: Math.max(0, current.count_details.normal - (burst ? 0 : 1)),
      },
      me: current.me && (burst || event.user_id !== botId),
      me_burst: current.me_burst && (!burst || event.user_id !== botId),
      burst_colors: burstCount === 0 ? [] : current.burst_colors,
    };
    return { ...message, reactions };
  });
}

export function removeAllCachedReactions(ctx: StructureContext, messageId: string): void {
  updateCachedMessage(ctx, messageId, (message) => ({ ...message, reactions: [] }));
}

export function removeCachedEmojiReactions(
  ctx: StructureContext,
  messageId: string,
  emoji: PartialEmoji,
): void {
  updateCachedMessage(ctx, messageId, (message) => ({
    ...message,
    reactions: (message.reactions ?? []).filter((reaction) =>
      !sameEmoji(reaction.emoji, emoji)),
  }));
}

export function updateCachedPollVote(
  ctx: StructureContext,
  event: types.MessagePollVoteEvent,
  change: 1 | -1,
  botId: string | undefined,
): void {
  updateCachedMessage(ctx, event.message_id, (message) => {
    if (message.poll === undefined) return undefined;
    const currentResults = message.poll.results;
    if (currentResults === undefined && change < 0) return undefined;

    const answerCounts = [...(currentResults?.answer_counts ?? [])];
    const index = answerCounts.findIndex((answer) => answer.id === event.answer_id);
    const current = index < 0 ? undefined : answerCounts[index];
    if (current === undefined) {
      if (change < 0) return undefined;
      answerCounts.push({
        id: event.answer_id,
        count: 1,
        me_voted: event.user_id === botId,
      });
    } else {
      answerCounts[index] = {
        ...current,
        count: Math.max(0, current.count + change),
        me_voted: event.user_id === botId ? change > 0 : current.me_voted,
      };
    }
    return {
      ...message,
      poll: {
        ...message.poll,
        results: {
          is_finalized: currentResults?.is_finalized ?? false,
          answer_counts: answerCounts,
        },
      },
    };
  });
}

function sameEmoji(left: PartialEmoji, right: PartialEmoji): boolean {
  if (left.id !== null || right.id !== null) return left.id === right.id;
  return left.name === right.name;
}
