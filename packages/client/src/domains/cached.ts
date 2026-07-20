import type { CacheStore } from "@eunia/cache";
import type { RoutePath } from "@eunia/rest";
import type { StructureContext } from "@eunia/structures";

/**
 * Shared get/peek/pull triad for domains keyed by a single id.
 * get = cache first, network on miss; peek = sync cache only;
 * pull = network always, cache refreshed.
 */
export abstract class CachedDomain<Raw, Value> {
  protected constructor(
    protected readonly ctx: StructureContext,
    protected readonly store: CacheStore<Raw>,
  ) {}

  protected abstract route(id: string): RoutePath;
  protected abstract hydrate(raw: Raw): Value;

  async get(id: string): Promise<Value> {
    requireId(id);
    const cached = await this.store.get(id);
    if (cached !== undefined) return this.hydrate(cached);
    return this.pull(id);
  }

  peek(id: string): Value | undefined {
    const raw = this.store.resolve(id);
    return raw === undefined ? undefined : this.hydrate(raw);
  }

  async pull(id: string): Promise<Value> {
    requireId(id);
    const raw = await this.ctx.rest.get<Raw>(this.route(id));
    this.store.set(id, raw);
    return this.hydrate(raw);
  }
}

export function requireId(...ids: readonly string[]): void {
  for (const id of ids) {
    if (id.length === 0) throw new TypeError("An id is required.");
  }
}
