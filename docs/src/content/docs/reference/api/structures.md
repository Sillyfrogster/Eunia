---
title: Structures
description: Users, guilds, channels, messages, members, roles, and interactions.
---

Structures wrap immutable Discord payload snapshots. `raw` is read-only, and `toJSON()` returns a mutable clone. ID-based structures also expose `id`, `createdTimestamp`, and `createdAt`.

## User

| Member | Returns |
| --- | --- |
| `username` | `string` |
| `displayName` | `string` |
| `isBot` | `boolean` |
| `mention` | `string` |
| `tag` | `string` |
| `avatarURL(options?)` | `string \| undefined` |
| `displayAvatarURL(options?)` | `string` |
| `defaultAvatarURL` | `string` |
| `bannerURL(options?)` | `string \| undefined` |
| `createDM()` | `Promise<Channel>` |
| `send(input)` | `Promise<Message>` |

## Channel

Properties: `name`, `topic`, `guildId`, `mention`, `isDM`, `isThread`, `isTextBased`, and cached `guild`.

| Method | Returns |
| --- | --- |
| `permissionsFor(member)` | Effective channel permission bitfield |
| `fetchGuild()` | `Promise<Guild \| undefined>` |
| `send(input)` | `Promise<Message>` |
| `fetchMessage(messageId)` | `Promise<Message>` |
| `edit(options, audit?)` | `Promise<Channel>` |
| `updateTopic(topic)` | `Promise<Channel>` |
| `delete(audit?)` | `Promise<Channel>` |
| `triggerTyping()` | `Promise<void>` |

## Message

Properties: `author`, `content`, `channelId`, `guildId`, `editedAt`, cached `channel`, cached `guild`, and `url`.

| Method | Returns |
| --- | --- |
| `fetchChannel()` | `Promise<Channel>` |
| `fetchGuild()` | `Promise<Guild \| undefined>` |
| `reply(input)` | `Promise<Message>` |
| `edit(input)` | `Promise<Message>` |
| `delete()` | `Promise<void>` |
| `react(emoji)` | `Promise<void>` |
| `removeOwnReaction(emoji)` | `Promise<void>` |
| `pin(audit?)` | `Promise<void>` |
| `unpin(audit?)` | `Promise<void>` |

## Guild

Properties: `name`, `ownerId`, cached `owner`, `channels`, `roles`, and `members`.

| Method | Returns |
| --- | --- |
| `iconURL(options?)`, `bannerURL(options?)`, `splashURL(options?)` | CDN URL or `undefined` |
| `channel(id)`, `member(id)`, `role(id)` | Cached structure or `undefined` |
| `fetchOwner()` | `Promise<User>` |
| `fetchChannel(id)` | `Promise<Channel>` |
| `fetchMember(id)` | `Promise<GuildMember>` |
| `fetchRoles()` | `Promise<ReadonlyMap<string, Role>>` |
| `fetchRole(id)` | `Promise<Role>` |
| `ban(userId, options?)`, `unban(userId, audit?)` | `Promise<void>` |
| `createRole(options?, audit?)` | `Promise<Role>` |
| `applicationCommands(applicationId)` | Raw guild commands |
| `createApplicationCommand(applicationId, definition)` | Created raw command |

## GuildMember

Properties: `raw`, `guildId`, `id`, creation and join times, `mention`, cached `user`, cached `guild`, `displayName`, `permissions`, `guildPermissions`, `roles`, and `highestRole`.

| Method | Returns |
| --- | --- |
| `can(required)`, `canAny(anyOf)` | `boolean` |
| `missing(required)` | Missing permission names |
| `displayAvatarURL(options?)` | URL or `undefined` |
| `fetchUser()` | `Promise<User>` |
| `fetchGuild()` | `Promise<Guild>` |
| `edit(options)` | `Promise<GuildMember>` |
| `setNickname(nickname, audit?)` | `Promise<GuildMember>` |
| `timeout(until, audit?)` | `Promise<GuildMember>` |
| `kick(audit?)`, `ban(options?)` | `Promise<void>` |
| `addRole(role, audit?)`, `removeRole(role, audit?)` | `Promise<void>` |

## Role

Properties: `guildId`, `name`, `mention`, `permissions`, and cached `guild`.

| Method | Returns |
| --- | --- |
| `iconURL(options?)` | URL or `undefined` |
| `fetchGuild()` | `Promise<Guild>` |
| `edit(options, audit?)` | `Promise<Role>` |
| `delete(audit?)` | `Promise<void>` |

## Interaction

`Interaction` is a union narrowed by `kind`: `command`, `autocomplete`, `button`, `select`, or `modal`.

All kinds expose the raw payload, IDs, response state, cached user/member/channel/guild values, fetch methods, resolved user/channel/role/message lookups, and `toJSON()`.

| Kind | Added members |
| --- | --- |
| `command` | `commandName`, `respond`, `defer`, `original`, `followup`, `modal` |
| `autocomplete` | `commandName`, `autocomplete` |
| `button` | `customId`, `message`, `respond`, `defer`, `original`, `followup`, `update`, `modal` |
| `select` | Button members plus `values` |
| `modal` | `customId`, `message`, response members, `update`, `field`, `textField` |

`original` has `get()`, `edit(input)`, and `delete()`.

`createInteraction(raw, context)` creates the narrowed structure. `isInteraction(value)` checks whether a value came from that function.

Response-state errors are `InteractionAlreadyAcknowledgedError` and `InteractionNotAcknowledgedError`.

## Message inputs and CDN utilities

`Sendable` accepts a string, embed, embed list, or message payload. `normalizeSendable(input, mode?)` validates and normalizes it. `splitMessageFiles(data)` separates upload files from the JSON body.

`snowflakeTimestamp(id)` returns the creation timestamp. `cdnAssetUrl(parts, hash, options?)` builds a Discord CDN URL. Constants are `DISCORD_EPOCH` and `CDN_BASE_URL`.

## Input types

`ChannelEditInput`, `GuildBanInput`, `RoleCreateInput`, `MemberEditInput`, `BanInput`, `RoleEditInput`, `DeferOptions`, `ModalFieldValue`, `OriginalMessage`, `Sendable`, `MessageRequestParts`, `CDNImageOptions`, `ImageExtension`, and `AuditLogOptions`.

## Cache context helpers

Advanced integrations may use `StructureContext`, `StructureCache`, `StructureCacheShape`, `CachedRole`, and the exported cache-key, lookup, upsert, removal, and guild-relation helpers.
