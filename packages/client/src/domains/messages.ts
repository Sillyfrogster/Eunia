import { routePath, withQuery } from "@eunia/rest";
import {
  Message,
  normalizeSendable,
  splitMessageFiles,
  type Sendable,
  type StructureContext,
} from "@eunia/structures";
import type * as types from "@eunia/types";
import { requireId } from "./cached";

interface MessageListLimit {
  limit?: number;
}

export type ListMessagesOptions = MessageListLimit &
  (
    | { before: string; after?: never; around?: never }
    | { after: string; before?: never; around?: never }
    | { around: string; before?: never; after?: never }
    | { before?: never; after?: never; around?: never }
  );

/** Message cache accessors and REST operations. */
export class MessagesDomain {
  constructor(private readonly ctx: StructureContext) {}

  async get(channelId: string, messageId: string): Promise<Message> {
    requireId(channelId, messageId);
    const cached = await this.ctx.cache.messages.get(messageId);
    if (cached !== undefined && cached.channel_id === channelId) {
      return new Message(cached, this.ctx);
    }
    return this.pull(channelId, messageId);
  }

  peek(channelId: string, messageId: string): Message | undefined {
    const raw = this.ctx.cache.messages.resolve(messageId);
    if (raw === undefined || raw.channel_id !== channelId) return undefined;
    return new Message(raw, this.ctx);
  }

  async pull(channelId: string, messageId: string): Promise<Message> {
    requireId(channelId, messageId);
    const raw = await this.ctx.rest.get<types.Message>(
      routePath("/channels/{channelId}/messages/{messageId}", { channelId, messageId }),
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  async list(
    channelId: string,
    options: ListMessagesOptions = {},
  ): Promise<Message[]> {
    requireId(channelId);
    validateListOptions(options);
    const payload = await this.ctx.rest.get<types.Message[]>(
      withQuery(
        routePath("/channels/{channelId}/messages", { channelId }),
        {
          before: options.before,
          after: options.after,
          around: options.around,
          limit: options.limit,
        },
      ),
    );
    return payload.map((raw) => {
      this.cacheMessage(raw);
      return new Message(raw, this.ctx);
    });
  }

  async send(channelId: string, input: Sendable): Promise<Message> {
    requireId(channelId);
    const request = splitMessageFiles(normalizeSendable(input));
    const raw = await this.ctx.rest.post<types.Message>(
      routePath("/channels/{channelId}/messages", { channelId }),
      request.body,
      request.files === undefined ? {} : { files: request.files },
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  async edit(channelId: string, messageId: string, input: Sendable): Promise<Message> {
    requireId(channelId, messageId);
    const request = splitMessageFiles(normalizeSendable(input, "edit"));
    const raw = await this.ctx.rest.patch<types.Message>(
      routePath("/channels/{channelId}/messages/{messageId}", { channelId, messageId }),
      request.body,
      request.files === undefined ? {} : { files: request.files },
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  async delete(channelId: string, messageId: string): Promise<void> {
    requireId(channelId, messageId);
    await this.ctx.rest.delete(
      routePath("/channels/{channelId}/messages/{messageId}", { channelId, messageId }),
    );
    this.ctx.cache.messages.delete(messageId);
  }

  private cacheMessage(raw: types.Message): void {
    this.ctx.cache.messages.set(raw.id, raw);
    this.ctx.cache.users.set(raw.author.id, raw.author);
  }
}

function validateListOptions(options: ListMessagesOptions): void {
  const anchors = [options.before, options.after, options.around].filter(
    (value): value is string => value !== undefined,
  );
  if (anchors.length > 1) {
    throw new TypeError("Message list accepts only one of before, after, or around.");
  }
  if (anchors.length === 1) requireId(anchors[0] ?? "");
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)
  ) {
    throw new RangeError("Message list limit must be between 1 and 100.");
  }
}
