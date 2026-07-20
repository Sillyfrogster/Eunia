# @eunia/types

Discord API v10 payload types and protocol enums used by Eunia.

```sh
bun add @eunia/types
```

The package covers common users, guilds, members, roles, channels, messages,
emojis, stickers, polls, entitlements, current message components, application
commands, interactions, auto moderation, scheduled events, invites,
subscriptions, permissions, and typed gateway dispatch payloads. It contains no
client state and has no runtime dependencies.

Raw payload types use bare protocol nouns; qualify them through the import
path:

```ts
import type * as types from "@eunia/types";
import { ComponentType, PermissionFlags, can } from "@eunia/types";

const message: types.Message = payload;
const allowed = can(memberPermissions, PermissionFlags.BanMembers);
```

Voice payloads are outside this release.
