import type {
  CacheAdapter,
  CacheErrorHandler,
} from "./adapter";
import {
  RedisCacheAdapter,
  ValkeyCacheAdapter,
} from "./redis";
import { CacheStore, type CachePolicy } from "./store";

export interface CacheShape {
  user: unknown;
  guild: unknown;
  channel: unknown;
  message: unknown;
  member?: unknown;
  role?: unknown;
}

export type BuiltInCacheDomain =
  | "users"
  | "guilds"
  | "channels"
  | "messages"
  | "members"
  | "roles";

export const DEFAULT_CACHE_POLICIES = {
  users: { maxSize: 10_000 },
  guilds: { maxSize: 1_000 },
  channels: { maxSize: 10_000 },
  messages: { maxSize: 1_000, ttl: 15 * 60 * 1_000 },
  members: { maxSize: 25_000 },
  roles: { maxSize: 5_000 },
} as const satisfies Record<BuiltInCacheDomain, CachePolicy>;

export interface RedisAdapterConfig {
  driver: "redis" | "valkey";
  url?: string;
  prefix?: string;
}

export interface MemoryAdapterConfig {
  driver: "memory";
}

export type BuiltInCacheAdapterConfig = MemoryAdapterConfig | RedisAdapterConfig;

export interface CacheOptions {
  adapter?: CacheAdapter | BuiltInCacheAdapterConfig;
  policies?: Partial<Record<BuiltInCacheDomain, CachePolicy>>;
  onError?: CacheErrorHandler;
}

type ShapeValue<S, K extends PropertyKey> = K extends keyof S ? S[K] : unknown;

export class Cache<S extends CacheShape = CacheShape> {
  readonly users: CacheStore<ShapeValue<S, "user">>;
  readonly guilds: CacheStore<ShapeValue<S, "guild">>;
  readonly channels: CacheStore<ShapeValue<S, "channel">>;
  readonly messages: CacheStore<ShapeValue<S, "message">>;
  readonly members: CacheStore<ShapeValue<S, "member">>;
  readonly roles: CacheStore<ShapeValue<S, "role">>;

  private readonly adapter: CacheAdapter | undefined;
  private readonly onError: CacheErrorHandler | undefined;
  private readonly domains = new Map<string, CacheStore<unknown>>();
  private closePromise: Promise<void> | undefined;

  constructor(options: CacheOptions = {}) {
    this.adapter = createAdapter(options.adapter);
    this.onError = options.onError;

    this.users = this.createDomain(
      "users",
      mergePolicy(DEFAULT_CACHE_POLICIES.users, options.policies?.users),
    );
    this.guilds = this.createDomain(
      "guilds",
      mergePolicy(DEFAULT_CACHE_POLICIES.guilds, options.policies?.guilds),
    );
    this.channels = this.createDomain(
      "channels",
      mergePolicy(DEFAULT_CACHE_POLICIES.channels, options.policies?.channels),
    );
    this.messages = this.createDomain(
      "messages",
      mergePolicy(DEFAULT_CACHE_POLICIES.messages, options.policies?.messages),
    );
    this.members = this.createDomain(
      "members",
      mergePolicy(DEFAULT_CACHE_POLICIES.members, options.policies?.members),
    );
    this.roles = this.createDomain(
      "roles",
      mergePolicy(DEFAULT_CACHE_POLICIES.roles, options.policies?.roles),
    );
  }

  domain<T>(name: string, policy?: CachePolicy): CacheStore<T> {
    const existing = this.domains.get(name);
    if (existing !== undefined) return existing as CacheStore<T>;
    return this.createDomain<T>(name, policy ?? { maxSize: 1_000 });
  }

  get hasRemoteAdapter(): boolean {
    return this.adapter !== undefined;
  }

  async flush(): Promise<void> {
    await Promise.all([...this.domains.values()].map((store) => store.flush()));
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeAdapter();
    return this.closePromise;
  }

  private createDomain<T>(name: string, policy: CachePolicy): CacheStore<T> {
    const store = new CacheStore<T>({
      namespace: name,
      policy,
      ...(this.adapter === undefined ? {} : { adapter: this.adapter }),
      ...(this.onError === undefined ? {} : { onError: this.onError }),
    });
    this.domains.set(name, store as CacheStore<unknown>);
    return store;
  }

  private async closeAdapter(): Promise<void> {
    await this.flush();
    if (this.adapter === undefined) return;

    try {
      await this.adapter.close();
    } catch (error) {
      if (this.onError !== undefined) {
        try {
          await this.onError(error, { operation: "close", namespace: "*" });
        } catch {
          throw error;
        }
      }
      throw error;
    }
  }
}

function createAdapter(
  config: CacheAdapter | BuiltInCacheAdapterConfig | undefined,
): CacheAdapter | undefined {
  if (config === undefined) return undefined;
  if ("get" in config) return config;
  if (config.driver === "memory") return undefined;

  const options = {
    ...(config.url === undefined ? {} : { url: config.url }),
    ...(config.prefix === undefined ? {} : { prefix: config.prefix }),
  };
  return config.driver === "redis"
    ? new RedisCacheAdapter(options)
    : new ValkeyCacheAdapter(options);
}

function mergePolicy(
  defaults: CachePolicy,
  overrides: CachePolicy | undefined,
): CachePolicy {
  return { ...defaults, ...overrides };
}
