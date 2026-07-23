---
title: Client
description: Client setup, lifecycle, events, domains, modules, and services.
---

## Client

```ts
new Client(options: ClientOptions)
```

`Client` connects the gateway, REST client, cache, commands, structures, and modules.

### ClientOptions

| Field | Type | Notes |
| --- | --- | --- |
| `token` | `string` | Required bot token. |
| `intents` | `number \| readonly number[]` | One bitfield or a list of intent values. |
| `applicationId` | `string` | Optional known application ID. |
| `botId` | `string` | Optional known bot user ID. |
| `ownerIds` | `readonly string[]` | Used by owner-only commands. |
| `rest` | `Omit<RestOptions, "token">` | REST settings. |
| `gateway` | `ClientGatewayOptions` | Shards, presence, and large threshold. |
| `cache` | `CacheOptions \| StructureCache` | Cache settings or an existing cache. |
| `commands` | `ClientCommandOptions` | Commands and command manager settings. |
| `modules` | `readonly EuniaModule[]` | Modules to load before connecting. |
| `logger` | `Logger` | Logger shared by the client and its children. |

`ClientGatewayOptions` accepts `shards`, `presence`, and `largeThreshold`.

`ClientCommandOptions` extends `CommandManagerOptions` with:

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `commands` | `readonly CommandNode[]` | `[]` | Definitions to register during construction. |
| `publishOnStart` | `false \| CommandPublishTarget` | `false` | Publish after the gateway is ready. |
| `autoHandle` | `boolean` | `true` | Route gateway interactions and messages through the command manager. |

Set `autoHandle: false` when an event listener or another router owns command
dispatch. The client still caches, hydrates, and emits `interactionCreate` and
`messageCreate`. Call `client.handleCommand(source)` for each source the
command framework should receive. This setting does not change registration or
`publishOnStart`.

### Properties

| Property | Type | Purpose |
| --- | --- | --- |
| `state` | `ClientState` | `idle`, `starting`, `ready`, `stopping`, `stopped`, or `failed`. |
| `isReady` | `boolean` | Whether startup completed. |
| `applicationId` | `string \| undefined` | Configured or gateway-provided application ID. |
| `botId` | `string \| undefined` | Configured or gateway-provided bot ID. |
| `self` | `User \| undefined` | Cached bot user. |
| `latencyMs` | `number \| null` | Average shard heartbeat latency. |
| `latencies` | `ReadonlyMap<number, number \| null>` | Heartbeat latency by shard. |
| `shardIds` | `readonly number[]` | Shards assigned to this process. |
| `totalShards` | `number` | Total shard count. |
| `readySessions` | `ReadonlyMap<number, Readonly<types.ReadyEvent>>` | READY payloads by shard. |
| `rest` | `EuniaRest` | REST client. |
| `cache` | `StructureCache` | Raw structure cache. |
| `commands` | `CommandManager` | Command registry and dispatcher. |
| `services` | `ServiceRegistry` | Services shared by modules. |

### Lifecycle and gateway methods

| Method | Returns |
| --- | --- |
| `use(module)` | `this` |
| `start()` | `Promise<this>` |
| `stop()` | `Promise<void>` |
| `destroy()` | `Promise<void>` |
| `handleCommand(source)` | `Promise<CommandHandleResult>` |
| `updatePresence(presence)` | `Promise<void>` |
| `requestGuildMembers(request)` | `Promise<void>` |
| `requestSoundboardSounds(request)` | `Promise<void>` |
| `requestChannelInfo(request)` | `Promise<void>` |
| `updateVoiceState(state)` | `Promise<void>` |

Register modules before calling `start`. `destroy` is an alias for `stop`.
`handleCommand` uses the client's prefix permission lookup and emits
`commandResult` when the manager recognizes the source.

## Resource domains

The client exposes resource operations without requiring a structure instance.

| Domain | Methods |
| --- | --- |
| `users` | `get(id)`, `peek(id)`, `pull(id)` |
| `guilds` | `get(id)`, `peek(id)`, `pull(id)` |
| `channels` | `get(id)`, `peek(id)`, `pull(id)`, `edit(id, input, audit?)`, `delete(id, audit?)`, `typing(id)` |
| `messages` | `get(channelId, messageId)`, `peek(...)`, `pull(...)`, `list(channelId, options?)`, `send(channelId, input)`, `edit(...)`, `delete(...)` |
| `members` | `get(guildId, userId)`, `peek(...)`, `pull(...)`, `edit(...)`, `kick(...)`, `ban(...)`, `unban(...)`, `addRole(...)`, `removeRole(...)` |
| `roles` | `get(guildId, roleId)`, `peek(...)`, `pull(...)`, `list(guildId)`, `create(...)`, `edit(...)`, `delete(...)` |
| `reactions` | `add(channelId, messageId, emoji)`, `remove(...)`, `clear(...)` |
| `pins` | `list(channelId, options?)`, `add(channelId, messageId, audit?)`, `remove(channelId, messageId, audit?)` |

## Events

```ts
client.on("messageCreate", (message) => {
  console.log(message.content);
});
```

| Event | Listener arguments |
| --- | --- |
| `ready` | `User` |
| `stopped` | none |
| `stateChange` | `state`, `previous` |
| `userUpdate` | `user`, `previous?` |
| `guildCreate` | `guild` |
| `guildUpdate` | `guild`, `previous?` |
| `guildDelete` | `GuildDeleteInfo` |
| `channelCreate` | `channel` |
| `channelUpdate` | `channel`, `previous?` |
| `channelDelete` | `channel` |
| `channelPinsUpdate` | `event` |
| `threadCreate` | `thread` |
| `threadUpdate` | `thread`, `previous?` |
| `threadDelete` | `ThreadDeleteInfo` |
| `threadListSync` | `event` |
| `threadMemberUpdate` | `event` |
| `threadMembersUpdate` | `event` |
| `messageCreate` | `message` |
| `messageUpdate` | `message`, `previous`, `raw` |
| `messageDelete` | `MessageDeleteInfo` |
| `messageDeleteBulk` | `MessageDeleteBulkInfo` |
| `messageReactionAdd` | `event` |
| `messageReactionRemove` | `event` |
| `messageReactionRemoveAll` | `event` |
| `messageReactionRemoveEmoji` | `event` |
| `messagePollVoteAdd` | `event` |
| `messagePollVoteRemove` | `event` |
| `guildMemberAdd` | `member` |
| `guildMemberUpdate` | `member`, `previous?` |
| `guildMemberRemove` | `GuildMemberRemoveInfo` |
| `guildBanAdd` | `GuildBanInfo` |
| `guildBanRemove` | `GuildBanInfo` |
| `roleCreate` | `role` |
| `roleUpdate` | `role`, `previous?` |
| `roleDelete` | `RoleDeleteInfo` |
| `interactionCreate` | `interaction` |
| `autoModerationRuleCreate` | `rule` |
| `autoModerationRuleUpdate` | `rule` |
| `autoModerationRuleDelete` | `rule` |
| `autoModerationActionExecution` | `event` |
| `guildEmojisUpdate` | `event` |
| `guildStickersUpdate` | `event` |
| `guildIntegrationsUpdate` | `event` |
| `integrationCreate` | `event` |
| `integrationUpdate` | `event` |
| `integrationDelete` | `event` |
| `guildScheduledEventCreate` | `event` |
| `guildScheduledEventUpdate` | `event` |
| `guildScheduledEventDelete` | `event` |
| `guildScheduledEventUserAdd` | `event` |
| `guildScheduledEventUserRemove` | `event` |
| `inviteCreate` | `event` |
| `inviteDelete` | `event` |
| `presenceUpdate` | `event` |
| `typingStart` | `event` |
| `webhooksUpdate` | `event` |
| `entitlementCreate` | `entitlement` |
| `entitlementUpdate` | `entitlement` |
| `entitlementDelete` | `entitlement` |
| `subscriptionCreate` | `subscription` |
| `subscriptionUpdate` | `subscription` |
| `subscriptionDelete` | `subscription` |
| `dispatch` | `eventName`, `data`, `shardId` |
| `shardReconnecting` | `shardId`, `ReconnectInfo` |
| `shardResumed` | `shardId` |
| `shardClosed` | `shardId`, `CloseInfo` |
| `commandResult` | `result`, `source` |
| `commandError` | `error`, `context?` |
| `clientError` | `error`, `source` |

## Modules

```ts
interface EuniaModule {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  setup?(client: Client): void | Promise<void>;
  start?(client: Client): void | Promise<void>;
  stop?(client: Client): void | Promise<void>;
}
```

`orderModules(modules)` validates names and dependencies, then returns dependency order.

## ServiceRegistry

| Method | Purpose |
| --- | --- |
| `provide(key, service)` | Register one value. Duplicate keys throw. |
| `get<T>(key)` | Return a service or throw. |
| `resolve<T>(key)` | Return a service or `undefined`. |
| `has(key)` | Check a key. |
| `delete(key)` | Remove a key. |
| `clear()` | Remove all services. |

Service keys are strings or symbols.

## Other exports

`resolveIntents`, `IntentInput`, `ClientState`, `ClientOptions`, `ClientGatewayOptions`, `ClientCommandOptions`, `EuniaModule`, `ServiceKey`, `GuildDeleteInfo`, `GuildMemberRemoveInfo`, `RoleDeleteInfo`, `MessageDeleteInfo`, and `MessageDeleteBulkInfo`.
