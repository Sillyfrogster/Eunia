---
title: Packages
description: The modules included in the Eunia package.
---

Install one npm package:

```sh
bun add @sillyfrogster/eunia@alpha
```

Eunia uses internal workspaces to keep the source modular. Public exports come from `@sillyfrogster/eunia`.

| Module | Includes |
| --- | --- |
| Client | Event routing, domain accessors, services, modules, and public re-exports |
| Commands | Slash and prefix commands, options, groups, listeners, guards, middleware, and cooldowns |
| Structures | Users, guilds, channels, messages, members, roles, interactions, and payload helpers |
| Cache | Bounded memory, Redis, Valkey, and custom adapters |
| Gateway | Sessions, heartbeats, resume, reconnects, presence, and sharding |
| REST | Rate limits, retries, uploads, audit reasons, timeouts, and typed errors |
| Helpers | Embed, component, and modal template registries |
| Shared | Logger interfaces and runtime utilities |
| Types | Discord API payloads, enums, permissions, and gateway dispatch types |

## Public imports

Most values are named exports:

```ts
import {
  Client,
  Command,
  Intents,
  PermissionFlags,
  type CommandContext,
} from "@sillyfrogster/eunia";
```

Raw Discord payloads are available through the `types` namespace. This keeps raw payload names separate from hydrated structures:

```ts
import { Message, types } from "@sillyfrogster/eunia";

declare const payload: types.Message;
declare const message: Message;
```

## Lower-level use

The client combines the modules for most bots. You can also use the cache, gateway, REST client, command manager, or structures directly through the same package exports.

Use the [API reference](../api/) to look up public exports. Use [feature coverage](../coverage/) to check which Discord areas have high-level methods.
