# Types

Discord API v10 payload types and protocol enums used by Eunia.

```sh
bun add @sillyfrogster/eunia@alpha
```

The type module covers common users, guilds, members, roles, channels, messages,
emojis, stickers, polls, entitlements, current message components, application
commands, interactions, auto moderation, scheduled events, invites,
subscriptions, permissions, and typed gateway dispatch payloads. It contains no
client state and has no runtime dependencies.

Raw payload types use bare protocol nouns; qualify them through the import
path:

```ts
import { types } from "@sillyfrogster/eunia";

const message: types.Message = payload;
const allowed = types.can(memberPermissions, types.PermissionFlags.BanMembers);
```

Voice payloads are outside this release.
