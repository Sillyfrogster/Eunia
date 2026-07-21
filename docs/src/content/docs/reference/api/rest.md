---
title: REST
description: Requests, routes, uploads, rate limits, diagnostics, and errors.
---

## EuniaRest

```ts
new EuniaRest(options: RestOptions)
```

Requests are authenticated, rate limited, retried when safe, and bounded by a timeout.

| Method | Signature |
| --- | --- |
| `get` | `get<T>(path, options?)` |
| `post` | `post<T>(path, body?, options?)` |
| `patch` | `patch<T>(path, body?, options?)` |
| `put` | `put<T>(path, body?, options?)` |
| `delete` | `delete<T>(path, options?)` |
| `request` | `request<T>(method, path, options?)` |

`path` may be a bound `RoutePath` or a raw string beginning with `/`. Bound routes keep Discord rate-limit buckets separate correctly.

### RestOptions

| Field | Purpose |
| --- | --- |
| `token` | Required bot token. |
| `version` | Discord API version. Defaults to `API_VERSION`. |
| `baseUrl` | API origin. |
| `userAgent` | Request user agent. |
| `timeoutMs` | Per-attempt timeout. |
| `retries` | Retry budget. |
| `globalRequestsPerSecond` | Local global request limit. |
| `maxBuckets` | Maximum tracked route buckets. |
| `bucketTtlMs` | Idle bucket lifetime. |
| `invalidRequestWarning` | Warning threshold within ten minutes. |
| `onInvalidRequestWarning` | Warning callback. |
| `logger` | REST logger. |
| `fetch` | Custom fetch implementation. |

### RestRequestOptions

`body`, `files`, `auth`, `global`, `reason`, `headers`, `signal`, and `idempotent`.

Set `auth: false` for tokenless endpoints. Set `global: false` only when the endpoint is outside Discord's global limit. Set `idempotent: true` when a non-GET request may safely retry after a network or server failure.

### Uploads

```ts
interface RestFile {
  data: Blob | ArrayBuffer | ArrayBufferView;
  name: string;
  description?: string;
}
```

Pass files through `RestRequestOptions.files`. The REST client builds the multipart body and attachment descriptors.

## Routes

```ts
const route = routePath("/channels/{channelId}/messages/{messageId}", {
  channelId,
  messageId,
});
```

`RoutePath` contains the interpolated `path`, original `template`, and `majorParam` used for rate limits. `routePath` URL-encodes parameters except Discord's `@me` and `@original` markers.

`withQuery(route, query)` appends defined scalar or array values. It preserves route metadata when passed a `RoutePath`.

## Diagnostics

`rest.diagnostics` returns:

| Field | Meaning |
| --- | --- |
| `buckets` | Active rate-limit buckets. |
| `learnedRoutes` | Routes mapped to Discord bucket hashes. |
| `invalidRequests` | Recent 401, 403, and 429 responses. |

## Errors

`DiscordError` represents a Discord error response. It includes `status`, Discord `code`, `method`, `routeKey`, and the parsed `raw` body.

`RateLimitExhaustedError` is thrown when 429 responses exceed the retry budget. It includes `retryAfterMs`, `scope`, and whether the limit was global.

## Other exports

`API_VERSION`, `HttpMethod`, `RequestPath`, `QueryValue`, `RoutePath`, `RestDiagnostics`, `RestFile`, `RestOptions`, and `RestRequestOptions`.
