---
title: Feature coverage
description: What Eunia supports and what remains outside this release.
---

Eunia is in alpha. Common bot features have typed structures and methods. Less common Discord features remain available through raw dispatch events or `client.rest`.

## Status meanings

| Status | Meaning |
| --- | --- |
| Ready | Eunia has a typed, high-level API for the area. |
| Reachable | The Discord feature is available through raw events, payloads, or REST requests. |
| Not included | This release does not provide the required transport or runtime. |

## Current coverage

| Area | Status | Notes |
| --- | --- | --- |
| Slash commands | Ready | Options, groups, autocomplete, permissions, guards, middleware, cooldowns, and deferral |
| Prefix commands | Ready | Uses the same command tree with typed parsing for common option kinds |
| Buttons, selects, and modals | Ready | Includes command-scoped listeners with stable custom IDs |
| Messages | Ready | Send, edit, delete, reply, embeds, polls, files, reactions, and pins |
| Guild administration | Ready | Common guild, channel, member, role, ban, timeout, and permission work |
| Gateway | Ready | Compression, resume, reconnects, heartbeats, presence, member requests, and sharding |
| REST | Ready | Rate limits, retries, files, abort signals, audit reasons, and typed errors |
| Cache | Ready | Bounded memory, expiry, Redis, Valkey, and custom adapters |
| Common events | Ready | Guilds, channels, threads, members, roles, messages, users, and interactions |
| Less common events | Reachable | Every dispatch is available through `client.on("dispatch")` |
| Administrative endpoints | Reachable | Use `client.rest` for audit logs, scheduled events, auto moderation, stickers, and monetization |
| Components V2 layouts | Reachable | Send typed payloads directly; layout helpers are not included |
| Voice | Not included | No connection, codec, player, or receive pipeline |
| Process supervision | Not included | Applications own process startup, monitoring, and coordination |

## Transport behavior

The gateway handles identify, resume, compression, heartbeats, reconnects, and shard planning. It respects Discord's identify concurrency and session start limits.

The REST client learns rate-limit buckets from response headers and queues requests. Retries are bounded. `POST` requests retry only when marked idempotent.

## Cache behavior

Each built-in cache domain has a size limit. Messages also expire by default. Remote adapters keep a bounded memory layer so structure relationships stay synchronous.

Structure methods do not mutate an existing structure. A successful edit returns a new snapshot.

## Unsupported in this release

Voice is outside this release. Eunia also does not supervise processes or provide distributed coordination beyond cache and cooldown interfaces.

Open a [GitHub issue](https://github.com/Sillyfrogster/Eunia/issues) if a coverage entry is wrong or unclear.
