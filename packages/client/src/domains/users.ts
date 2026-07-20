import { routePath, type RoutePath } from "@eunia/rest";
import { User, type StructureContext } from "@eunia/structures";
import type * as types from "@eunia/types";
import { CachedDomain } from "./cached";

/** User cache accessors. */
export class UsersDomain extends CachedDomain<types.User, User> {
  constructor(ctx: StructureContext) {
    super(ctx, ctx.cache.users);
  }

  protected route(id: string): RoutePath {
    return routePath("/users/{userId}", { userId: id });
  }

  protected hydrate(raw: types.User): User {
    return new User(raw, this.ctx);
  }
}
