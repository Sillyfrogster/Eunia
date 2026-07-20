import { routePath } from "@eunia/rest";
import type { StructureContext } from "@eunia/structures";
import { requireId } from "./cached";

/** Pin REST operations. */
export class PinsDomain {
  constructor(private readonly ctx: StructureContext) {}

  async add(channelId: string, messageId: string): Promise<void> {
    requireId(channelId, messageId);
    await this.ctx.rest.put(
      routePath("/channels/{channelId}/messages/pins/{messageId}", {
        channelId,
        messageId,
      }),
    );
    this.setPinned(messageId, true);
  }

  async remove(channelId: string, messageId: string): Promise<void> {
    requireId(channelId, messageId);
    await this.ctx.rest.delete(
      routePath("/channels/{channelId}/messages/pins/{messageId}", {
        channelId,
        messageId,
      }),
    );
    this.setPinned(messageId, false);
  }

  private setPinned(messageId: string, pinned: boolean): void {
    const raw = this.ctx.cache.messages.resolve(messageId);
    if (raw !== undefined) this.ctx.cache.messages.set(messageId, { ...raw, pinned });
  }
}
