---
title: Gateway
description: Shards, intents, presence, member requests, and gateway constants.
---

Most bots use the gateway through `Client`. `Shard` and `ShardManager` are available for lower-level control.

## Shard

```ts
new Shard(options: ShardOptions)
```

`ShardOptions` requires `url`, `token`, and an intent bitfield. It also accepts `[shardId, shardCount]`, presence, `largeThreshold`, and a logger.

| Member | Purpose |
| --- | --- |
| `state` | Current `ShardState`. |
| `latencyMs` | Heartbeat latency or `null`. |
| `connect()` | Connect and resolve after READY. |
| `disconnect(code?, reason?)` | Close permanently. |
| `updatePresence(presence)` | Send a presence update. |
| `requestGuildMembers(request)` | Request member chunks. |

Events are `ready`, `resumed`, `dispatch`, `reconnecting`, and `closed`.

`ShardState` values are `Idle`, `Connecting`, `WaitingForHello`, `Identifying`, `Resuming`, `Ready`, `Reconnecting`, and `Disconnected`.

## ShardManager

```ts
new ShardManager(options: ShardManagerOptions)
```

`ShardManagerOptions` requires the result of `GET /gateway/bot`, a token, and intents. It also accepts a shard plan, presence, large threshold, and logger.

| Member | Purpose |
| --- | --- |
| `totalShards` | Total shard count. |
| `shardIds` | Shards assigned to this process. |
| `latencies` | Heartbeat latency by shard. |
| `averageLatencyMs` | Average known latency. |
| `connect()` | Connect every assigned shard. |
| `destroy(reason?)` | Close every shard. |
| `requestGuildMembers(request)` | Route a request to its guild's shard. |
| `updatePresence(presence)` | Update every ready shard. |

Events are `ready`, `dispatch`, `resumed`, `reconnecting`, and `closed`. Manager events include the shard ID.

`ShardPlan` is `"auto"`, a total count, or `{ total, ids? }`. `shardIdForGuild(guildId, shardCount)` returns the owning shard.

## Intents

`Intents` contains the Discord gateway intent bits:

`Guilds`, `GuildMembers`, `GuildModeration`, `GuildExpressions`, `GuildIntegrations`, `GuildWebhooks`, `GuildInvites`, `GuildVoiceStates`, `GuildPresences`, `GuildMessages`, `GuildMessageReactions`, `GuildMessageTyping`, `DirectMessages`, `DirectMessageReactions`, `DirectMessageTyping`, `MessageContent`, `GuildScheduledEvents`, `AutoModerationConfiguration`, `AutoModerationExecution`, `GuildMessagePolls`, and `DirectMessagePolls`.

`GuildMembers`, `GuildPresences`, and `MessageContent` are privileged intents.

## Presence and member requests

```ts
interface GatewayPresence {
  since: number | null;
  activities: GatewayActivity[];
  status: "online" | "dnd" | "idle" | "invisible" | "offline";
  afk: boolean;
}
```

`GatewayActivity` has `name`, `type`, optional `url`, and optional `state`. `ActivityType` includes `Playing`, `Streaming`, `Listening`, `Watching`, `Custom`, and `Competing`.

`RequestGuildMembersData` requires `guild_id` and either `query` or `user_ids`. It may include `limit`, `presences`, and `nonce`.

## Constants and protocol types

`GATEWAY_VERSION`, `GatewayOpcode`, `GatewayCloseCode`, and `FATAL_CLOSE_CODES` describe Discord gateway v10.

`GatewayPayload`, `HelloData`, `IdentifyData`, `ResumeData`, `ReadyData`, and `GatewayBotInfo` model gateway frames and startup data. `ReconnectInfo` and `CloseInfo` describe connection changes.
