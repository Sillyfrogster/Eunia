import { routePath, type RoutePath } from "@eunia/rest";
import { Guild, type StructureContext } from "@eunia/structures";
import type * as types from "@eunia/types";
import { CachedDomain } from "./cached";

/** Guild cache accessors. */
export class GuildsDomain extends CachedDomain<types.Guild, Guild> {
  constructor(ctx: StructureContext) {
    super(ctx, ctx.cache.guilds);
  }

  protected route(id: string): RoutePath {
    return routePath("/guilds/{guildId}", { guildId: id });
  }

  protected hydrate(raw: types.Guild): Guild {
    return new Guild(raw, this.ctx);
  }
}
