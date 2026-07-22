---
title: Discord types
description: Raw Discord payloads, enums, permissions, and gateway events.
---

Raw Discord data is exported through the `types` namespace. This avoids collisions with Eunia structures.

```ts
import { Message, types } from "@sillyfrogster/eunia";

declare const raw: types.Message;
declare const hydrated: Message;
```

## Type groups

| Group | Main exports |
| --- | --- |
| Common | `Snowflake`, `BitfieldString`, `ISO8601Timestamp`, `Awaitable`, `JsonValue`, `Locale`, `Localizations` |
| Applications | Command definitions, options, choices, permissions, integration types, contexts, applications, and teams |
| Audit logs | Entries, changes, and optional entry details |
| Auto moderation | Rules, triggers, metadata, actions, and create or modify payloads |
| Channels | `Channel`, `ChannelType`, overwrites, threads, forum tags, flags, layouts, and video quality |
| Emojis | `Emoji`, `PartialEmoji` |
| Entitlements | `Entitlement`, `EntitlementType` |
| Gateway | Typed Discord dispatch payloads, including guild, channel, message, interaction, voice, soundboard, and rate-limit events |
| Guilds | `Guild`, `GuildMember`, `Role`, integrations, bans, welcome screens, levels, flags, and permission utilities |
| Interactions | Command, autocomplete, component, and modal interaction payloads and responses |
| Invites | Invites, metadata, targets, flags, and create or delete events |
| Messages | Messages, edits, embeds, attachments, reactions, polls, components, modal fields, resolved data, and uploads |
| Scheduled events | Event payloads, recurrence rules, statuses, privacy, and entity types |
| Soundboard | `SoundboardSound` |
| Stage instances | `StageInstance`, `StagePrivacyLevel` |
| Stickers | `Sticker`, `StickerItem`, `StickerPack`, and format or type enums |
| Subscriptions | `Subscription`, `SubscriptionStatus` |
| Users | `User`, `PartialUser`, flags, premium types, collectibles, nameplates, and primary guild data |
| Voice | Voice states, voice server updates, and voice channel effects |

## Permissions

These permission values are also direct package exports:

| Export | Purpose |
| --- | --- |
| `PermissionFlags` | Named Discord permission bits. |
| `toPermissionBits(input)` | Convert names, bits, or mixed input to one bitfield. |
| `can(actual, required)` | Test whether every required bit is present. |
| `canAny(actual, anyOf)` | Test whether at least one bit is present. |
| `missing(actual, required)` | Return missing permission names. |
| `toFlagNames(bits)` | Return names present in a bitfield. |

The related namespace types are `PermissionFlag`, `PermissionFlagName`, and `PermissionInput`.

## Common enums

Frequently used enums include `ApplicationCommandType`, `ApplicationCommandOptionType`, `ApplicationIntegrationType`, `InteractionContextType`, `ChannelType`, `OverwriteType`, `InteractionType`, `InteractionCallbackType`, `MessageType`, `MessageFlags`, `ComponentType`, `ButtonStyle`, `TextInputStyle`, `ActivityType`, `UserFlags`, and `RoleFlags`.

## Gateway event map

`types.GatewayDispatchMap` maps Discord event names to their payloads. `types.GatewayDispatchName` is its key union. The client emits any gateway event through its `dispatch` event, including events without a high-level structure event.
