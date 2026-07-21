---
title: Cache
description: Cache domains, stores, policies, Redis, Valkey, and custom adapters.
---

## Cache

```ts
new Cache(options?: CacheOptions)
```

Built-in domains are `users`, `guilds`, `channels`, `messages`, `members`, and `roles`. Each one is a `CacheStore`.

| Member | Purpose |
| --- | --- |
| `domain<T>(name, policy?)` | Return or create a custom domain. |
| `hasRemoteAdapter` | Whether persistence is configured. |
| `flush()` | Wait for pending writes. |
| `close()` | Flush and close the adapter. |

`CacheOptions` accepts `adapter`, per-domain `policies`, and `onError`. `EuniaCache` is an alias for `Cache`.

## CacheStore

```ts
new CacheStore<T>({ namespace, policy?, adapter?, onError?, now? })
```

| Member | Purpose |
| --- | --- |
| `namespace` | Adapter namespace. |
| `policy` | Resolved limits and TTL values. |
| `hot` | In-memory `MemoryStore`. |
| `resolve(id)` | Read from memory only. |
| `get(id)` | Read from memory, then the adapter. |
| `has(id)` | Check memory. |
| `set(id, value, ttl?)` | Update memory and queue persistence. |
| `delete(id)` | Delete from memory and queue persistence. |
| `clear()` | Clear the namespace. |
| `size` | In-memory entry count. |
| `pendingOperations` | Active adapter reads and writes. |
| `keys()`, `values()`, `entries()` | Iterate in-memory entries. |
| `list(prefix?)` | List matching memory and adapter keys. |
| `flush()` | Wait for queued writes. |

### CachePolicy

| Field | Meaning |
| --- | --- |
| `maxSize` | Maximum in-memory entries. |
| `ttl` | Default in-memory lifetime. |
| `readThroughTtl` | Lifetime for values loaded from an adapter. |
| `maxPendingOperations` | Adapter work allowed before backpressure. |

`CacheBackpressureError` includes `namespace`, `operation`, `limit`, `pendingOperations`, and code `CACHE_BACKPRESSURE`.

## MemoryStore

`MemoryStore<T>` is a bounded least-recently-used store with optional expiry.

| Member | Purpose |
| --- | --- |
| `get(id)`, `resolve(id)` | Read and refresh recency. |
| `set(id, value, ttl?)` | Store a value. |
| `delete(id)`, `clear()` | Remove values. |
| `has(id)` | Check a value and remove it if expired. |
| `subscribe(listener)` | Receive set, delete, and clear changes. Returns an unsubscribe function. |
| `size`, `keys()`, `values()`, `entries()` | Inspect current values. |

The constructor accepts `maxSize`, `ttl`, and a custom `now` function. Passing a number sets `maxSize` directly.

## Redis and Valkey

```ts
new RedisCacheAdapter({ url?, prefix?, client? })
new ValkeyCacheAdapter({ url?, prefix?, client? })
```

Both adapters store JSON values and use millisecond TTLs. A custom `client` must implement `RedisClientLike`.

Use a built-in adapter through `CacheOptions`:

```ts
const cache = new Cache({
  adapter: { driver: "valkey", url: process.env.VALKEY_URL },
});
```

`{ driver: "memory" }` disables persistence.

## Custom adapters

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

Error handlers receive the error and a `CacheErrorContext` containing the operation, namespace, and optional key.

## Constants and types

`DEFAULT_CACHE_POLICIES`, `DEFAULT_CACHE_READ_THROUGH_TTL`, `DEFAULT_CACHE_MAX_PENDING_OPERATIONS`, `CacheShape`, `BuiltInCacheDomain`, `BuiltInCacheAdapterConfig`, `MemoryAdapterConfig`, `RedisAdapterConfig`, `ResolvedCachePolicy`, `MemoryStoreOptions`, `MemoryStoreChange`, `MemoryStoreListener`, `RedisCacheAdapterOptions`, `RedisClientLike`, `CacheAdapterOperation`, `CacheErrorContext`, and `CacheErrorHandler`.
