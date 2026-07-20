import { routePath, type RoutePath } from "@eunia/rest";
import {
  Channel,
  removeCachedGuildChannel,
  upsertCachedGuildChannel,
  type AuditLogOptions,
  type ChannelEditInput,
  type StructureContext,
} from "@eunia/structures";
import type * as types from "@eunia/types";
import { CachedDomain, requireId } from "./cached";

/** Channel cache accessors and REST operations. */
export class ChannelsDomain extends CachedDomain<types.Channel, Channel> {
  constructor(ctx: StructureContext) {
    super(ctx, ctx.cache.channels);
  }

  protected route(id: string): RoutePath {
    return routePath("/channels/{channelId}", { channelId: id });
  }

  protected hydrate(raw: types.Channel): Channel {
    return new Channel(raw, this.ctx);
  }

  async edit(
    channelId: string,
    input: ChannelEditInput,
    audit: AuditLogOptions = {},
  ): Promise<Channel> {
    requireId(channelId);
    const raw = await this.ctx.rest.patch<types.Channel>(
      routePath("/channels/{channelId}", { channelId }),
      input,
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
    upsertCachedGuildChannel(this.ctx, raw);
    return new Channel(raw, this.ctx);
  }

  async delete(channelId: string, audit: AuditLogOptions = {}): Promise<Channel> {
    requireId(channelId);
    const raw = await this.ctx.rest.delete<types.Channel>(
      routePath("/channels/{channelId}", { channelId }),
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
    removeCachedGuildChannel(this.ctx, raw.guild_id, raw.id);
    return new Channel(raw, this.ctx);
  }

  async typing(channelId: string): Promise<void> {
    requireId(channelId);
    await this.ctx.rest.post(
      routePath("/channels/{channelId}/typing", { channelId }),
    );
  }
}
