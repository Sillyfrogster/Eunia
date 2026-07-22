import { routePath, withQuery } from "@eunia/rest";
import {
  Message,
  type AuditLogOptions,
  type StructureContext,
} from "@eunia/structures";
import type * as types from "@eunia/types";
import { requireId } from "./cached";

export interface ListPinsOptions {
  before?: Date | types.ISO8601Timestamp;
  limit?: number;
}

export interface ChannelPin {
  pinnedAt: Date;
  message: Message;
}

export interface ChannelPinPage {
  items: ChannelPin[];
  hasMore: boolean;
}

/** Pin REST operations. */
export class PinsDomain {
  constructor(private readonly ctx: StructureContext) {}

  async list(channelId: string, options: ListPinsOptions = {}): Promise<ChannelPinPage> {
    requireId(channelId);
    if (
      options.limit !== undefined &&
      (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 50)
    ) {
      throw new RangeError("Pin list limit must be between 1 and 50.");
    }
    const before = options.before instanceof Date
      ? options.before.toISOString()
      : options.before;
    const payload = await this.ctx.rest.get<types.MessagePinResponse>(
      withQuery(
        routePath("/channels/{channelId}/messages/pins", { channelId }),
        { before, limit: options.limit },
      ),
    );
    return {
      items: payload.items.map((pin) => {
        this.cacheMessage(pin.message);
        return {
          pinnedAt: new Date(pin.pinned_at),
          message: new Message(pin.message, this.ctx),
        };
      }),
      hasMore: payload.has_more,
    };
  }

  async add(
    channelId: string,
    messageId: string,
    audit: AuditLogOptions = {},
  ): Promise<void> {
    requireId(channelId, messageId);
    await this.ctx.rest.put(
      routePath("/channels/{channelId}/messages/pins/{messageId}", {
        channelId,
        messageId,
      }),
      undefined,
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
    this.setPinned(messageId, true);
  }

  async remove(
    channelId: string,
    messageId: string,
    audit: AuditLogOptions = {},
  ): Promise<void> {
    requireId(channelId, messageId);
    await this.ctx.rest.delete(
      routePath("/channels/{channelId}/messages/pins/{messageId}", {
        channelId,
        messageId,
      }),
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
    this.setPinned(messageId, false);
  }

  private cacheMessage(raw: types.Message): void {
    this.ctx.cache.messages.set(raw.id, raw);
    this.ctx.cache.users.set(raw.author.id, raw.author);
  }

  private setPinned(messageId: string, pinned: boolean): void {
    const raw = this.ctx.cache.messages.resolve(messageId);
    if (raw !== undefined) this.ctx.cache.messages.set(messageId, { ...raw, pinned });
  }
}
