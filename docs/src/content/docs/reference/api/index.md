---
title: API reference
description: Public classes, functions, options, and types exported by Eunia.
---

All public imports come from `@sillyfrogster/eunia`.

```ts
import { Client, Command, Intents, type ClientOptions } from "@sillyfrogster/eunia";
```

## Reference pages

| Area | Includes |
| --- | --- |
| [Client](./client/) | Client options, lifecycle, events, domains, modules, and services |
| [Commands](./commands/) | Command definitions, options, contexts, listeners, access, manager methods, and errors |
| [Structures](./structures/) | Users, guilds, channels, messages, members, roles, and interactions |
| [Cache](./cache/) | Cache domains, stores, policies, Redis, Valkey, and custom adapters |
| [Gateway](./gateway/) | Shards, intents, presence, member requests, and gateway constants |
| [REST](./rest/) | Requests, routes, uploads, rate limits, diagnostics, and errors |
| [Helpers](./helpers/) | Content template registries and Components V2 layout helpers |
| [Logging](./logging/) | Logger interface, console logger, silent logger, and formatting |
| [Discord types](./types/) | Raw Discord payloads, enums, permissions, and gateway events |

## Conventions

- `get` checks the cache and fetches on a miss.
- `peek` only checks the in-memory cache.
- `pull` always fetches and refreshes the cache.
- Structure properties such as `guild` and `channel` only return cached values. Their `fetch` methods may make a request.
- Times and time-to-live values use milliseconds unless the name says otherwise.
- `types` contains raw Discord data. Classes such as `Message` and `Guild` are Eunia structures.

Use [feature coverage](../coverage/) to check whether an area has a high-level API, raw access, or no support.
