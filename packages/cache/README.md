# Cache

Eunia's cache keeps frequently used Discord payloads in bounded memory. It
can also read from and write to Redis, Valkey, or a custom adapter.

```sh
bun add eunia@alpha
```

## Create a cache

The default cache only uses memory.

```ts
import { Cache } from "eunia";

const cache = new Cache({
  policies: {
    messages: { maxSize: 500, ttl: 10 * 60 * 1_000 },
  },
});
```

Use `adapter: { driver: "memory" }` when you want to make that choice
explicit in shared configuration.

Every built-in domain has a size limit. Messages have a smaller limit and a
default expiry because they change more often than other Discord data.

Adapter work is bounded too. Each domain accepts up to 1,000 pending reads,
writes, and clears by default. Set `maxPendingOperations` on a domain policy to
change that limit.

Use `resolve()` for an immediate memory lookup. Use `get()` when a missing
value should be loaded from the configured adapter.

```ts
const cached = cache.users.resolve(userId);
const loaded = await cache.users.get(userId);
```

A value loaded by `get()` stays in memory for `readThroughTtl`. This defaults
to the policy's `ttl`, or five minutes when the policy has no `ttl`. The expiry
is fixed when the adapter value enters memory. Reading the hot value does not
extend that deadline or write the value back to the adapter.

```ts
const cache = new Cache({
  adapter: { driver: "redis" },
  policies: {
    users: {
      maxSize: 10_000,
      readThroughTtl: 60_000,
      maxPendingOperations: 2_000,
    },
  },
});
```

Accepted `set()`, `delete()`, and `clear()` calls update memory before
returning. Adapter writes continue in the background. Adapter changes for the
same key stay ordered.

Background write failures are sent to `onError`. They do not roll back memory
or block later writes. A failed adapter read is sent to `onError` and rejected
by `get()`.

## Backpressure

When a domain reaches `maxPendingOperations`, a new `get()` rejects with
`CacheBackpressureError`. `set()`, `delete()`, and `clear()` throw the same
error before changing memory. This keeps a slow or hung adapter from growing
the process without a bound. `pendingOperations` reports the current work for
a domain.

Concurrent reads for one key share one adapter request. Writes keep their
order. While one write for a key is active, repeated queued changes for that
same key are reduced to the latest change. A `clear()` remains an ordering
barrier, so writes made after it cannot move ahead of it.

Backpressure is separate from adapter failures, so it is returned to the
caller instead of `onError`. Increasing the limit allows larger bursts but
uses more memory when an adapter stalls. An adapter timeout should be handled
by the adapter itself; `flush()` still waits for accepted writes to finish.

## Redis and Valkey

Choose either built-in driver in the cache options.

```ts
const cache = new Cache({
  adapter: {
    driver: "redis",
    url: "redis://localhost:6379",
    prefix: "my-bot",
  },
  onError(error, context) {
    console.error(context.operation, context.namespace, error);
  },
});
```

Use `driver: "valkey"` for Valkey. Both drivers use Bun's Redis client and
store values as JSON. Redis and Valkey values must be JSON serializable.

Namespace clears use incremental `SCAN` and `DEL` batches. Each page is
deleted before the next page is read, so a large namespace is not collected in
process memory first.

Call `flush()` when all queued writes must finish. Call `close()` during
shutdown to flush every domain and close the adapter.

```ts
await cache.close();
```

## Custom adapters and domains

Pass any object that implements `CacheAdapter` to use another cache system. The
adapter receives the domain separately from the key, so it must keep
namespaces isolated.

`ttl` controls values written through `set()`, both in memory and in the
adapter. `readThroughTtl` only controls the in-memory copy loaded from an
adapter. All TTL values are measured in milliseconds.

Third-party modules can create their own bounded domain without changing
Eunia's built-in cache shape.

```ts
const sessions = cache.domain<{ userId: string }>("my-module:sessions", {
  maxSize: 1_000,
  ttl: 30 * 60 * 1_000,
});

sessions.set(sessionId, { userId });
```
