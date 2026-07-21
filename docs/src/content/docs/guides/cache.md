---
title: Caching
description: Configure bounded memory, Redis, Valkey, or a custom adapter.
---

Eunia caches raw Discord payloads. Structures are created when you read them, so cached values stay serializable and do not keep old client objects alive.

Every domain has a bounded memory layer. Messages also expire by default.

## Memory

Memory is the default adapter:

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

`maxSize` uses least-recently-used eviction. `ttl` is measured in milliseconds and expires without one timer per item.

## Redis and Valkey

Both remote drivers use Bun's Redis client:

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

Use `driver: "valkey"` for Valkey. Both use Redis protocol URLs and store values as JSON.

## Read behavior

Each domain is a `CacheStore`:

```ts
const cached = client.cache.users.resolve(userId);
const loaded = await client.cache.users.get(userId);
```

- `resolve` reads the memory layer only.
- `get` reads memory, then the remote adapter on a miss.
- Concurrent misses for one key share one remote read.
- A read cannot restore data over a newer local write or delete.

Client domains use `peek`, `get`, and `pull`:

```ts
const cachedUser = client.users.peek(userId);
const user = await client.users.get(userId);
const freshUser = await client.users.pull(userId);
```

`peek` is synchronous. `get` reads cache before REST. `pull` always fetches and refreshes the cache.

## Write behavior

Accepted `set`, `delete`, and `clear` calls update memory before returning. Remote writes continue in the background.

- Writes for one key stay ordered.
- Writes for different keys can run together.
- Repeated queued changes for one key are reduced to the latest change.
- `clear` remains an ordering barrier.

Background failures go to `CacheOptions.onError`. They do not roll back the current memory value.

## Backpressure

Each domain accepts a bounded number of pending operations. When it reaches `maxPendingOperations`, new work throws `CacheBackpressureError` before memory grows without a limit.

```ts
const cache = new Cache({
  policies: {
    users: {
      maxSize: 10_000,
      readThroughTtl: 60_000,
      maxPendingOperations: 2_000,
    },
  },
});
```

`readThroughTtl` controls the memory copy loaded from a remote adapter. It does not change the adapter's stored expiry.

## Custom adapters

A `CacheAdapter` implements these operations:

```ts
interface CacheAdapter {
  get(namespace: string, key: string): Promise<unknown | undefined>;
  set(namespace: string, key: string, value: unknown, ttl?: number): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  keys(namespace: string, prefix?: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
  close(): Promise<void>;
}
```

The namespace and key are separate so adapters can isolate built-in and third-party data. `keys` returns logical keys without the adapter's storage prefix.

## Custom domains

Modules can create their own bounded namespace:

```ts
const sessions = client.cache.domain<{ userId: string }>(
  "my-module:sessions",
  { maxSize: 1_000, ttl: 30 * 60_000 },
);

sessions.set(sessionId, { userId });
```

Use a module-specific prefix. Asking for the same domain again returns the same store.

## Shutdown

`client.stop()` flushes queued writes and closes the adapter. When using the cache directly, call:

```ts
await cache.close();
```

Closing more than once is safe.
