# Caching

Eunia caches raw Discord payloads. Structures are created when you read them,
so cached values stay serializable and do not keep old client objects alive.

Every cache domain has a bounded memory layer. Messages also expire by
default. These limits prevent an active bot from growing memory without a
bound.

## Memory

Memory is the default. You can also select it by name:

```ts
const client = new Client({
  token,
  intents,
  cache: {
    adapter: { driver: "memory" },
    policies: {
      users: { maxSize: 20_000 },
      messages: { maxSize: 2_000, ttl: 10 * 60_000 },
    },
  },
});
```

`maxSize` uses least-recently-used eviction. `ttl` is measured in
milliseconds and expires lazily, without one timer per item.

## Redis and Valkey

Both built-in remote drivers use Bun's Redis client:

```ts
const client = new Client({
  token,
  intents,
  cache: {
    adapter: {
      driver: "redis",
      url: "redis://localhost:6379",
      prefix: "my-bot",
    },
  },
});
```

Use `driver: "valkey"` for a Valkey server. The URL still uses the Redis
protocol, such as `redis://localhost:6379` or `rediss://host:6379`.

Remote values use JSON. Discord payloads are JSON-safe. Values in a custom
domain must also be JSON serializable when stored in Redis or Valkey.

## Read and write behavior

Each domain is a `CacheStore`:

```ts
const hot = client.cache.users.resolve(userId);
const loaded = await client.cache.users.get(userId);
```

- `resolve()` reads the hot memory layer only.
- `get()` reads memory, then the remote adapter on a miss.
- Concurrent misses for one key share one remote read.
- `set()`, `delete()`, and `clear()` update memory before returning.
- Remote writes for one key keep their order.
- Writes to different keys can run together.
- A read cannot restore data over a newer local write or delete.

Structure properties such as `message.channel` use `resolve()` and never hide
network work. Methods such as `message.fetchChannel()` may use `get()` and
REST.

## Custom adapter

Implement six operations to use another system. This example adapts an
existing key-value backend:

```ts
import type { CacheAdapter } from "@sillyfrogster/eunia";

interface KeyValueBackend {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
  close(): Promise<void>;
}

class MyCacheAdapter implements CacheAdapter {
  constructor(private readonly backend: KeyValueBackend) {}

  get(namespace: string, key: string): Promise<unknown | undefined> {
    return this.backend.get(this.key(namespace, key));
  }

  set(namespace: string, key: string, value: unknown, ttl?: number): Promise<void> {
    return this.backend.set(this.key(namespace, key), value, ttl);
  }

  delete(namespace: string, key: string): Promise<void> {
    return this.backend.delete(this.key(namespace, key));
  }

  async keys(namespace: string, prefix = ""): Promise<string[]> {
    const namespacePrefix = this.prefix(namespace);
    const keys = await this.backend.keys(
      `${namespacePrefix}${encodeURIComponent(prefix)}`,
    );
    return keys.map((key) => decodeURIComponent(key.slice(namespacePrefix.length)));
  }

  clear(namespace: string): Promise<void> {
    return this.backend.deletePrefix(this.prefix(namespace));
  }

  close(): Promise<void> {
    return this.backend.close();
  }

  private key(namespace: string, key: string): string {
    return `${this.prefix(namespace)}${encodeURIComponent(key)}`;
  }

  private prefix(namespace: string): string {
    return `eunia:${encodeURIComponent(namespace)}:`;
  }
}
```

Pass an instance as `cache.adapter`. Namespace and key are separate so the
adapter can isolate built-in and third-party data. `keys()` returns logical
domain keys without the backend's namespace prefix.

Background write failures go to the `CacheOptions.onError` callback. The client
supplies a logger when no handler is set. Failed remote writes do not roll back
the current hot value.

## Custom domains

Modules can create their own bounded namespace:

```ts
const sessions = client.cache.domain<{ userId: string }>(
  "my-module:sessions",
  { maxSize: 1_000, ttl: 30 * 60_000 },
);

sessions.set(sessionId, { userId });
```

Use a module-specific prefix in the name. Asking for the same domain again
returns the same store.

## Shutdown

`client.stop()` flushes queued writes and closes the adapter. When using the
cache package by itself, call:

```ts
await cache.close();
```

Closing is safe to call more than once.
