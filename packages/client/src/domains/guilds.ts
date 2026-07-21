import { routePath, type RoutePath } from "@eunia/rest";
import { Guild, setCachedGuild, type StructureContext } from "@eunia/structures";
import type * as types from "@eunia/types";
import { CachedDomain, requireId } from "./cached";

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

  override async pull(id: string): Promise<Guild> {
    requireId(id);
    const raw = await this.ctx.rest.get<types.Guild>(this.route(id));
    setCachedGuild(this.ctx, raw);
    return this.hydrate(raw);
  }
}
