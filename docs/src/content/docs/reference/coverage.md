---
title: Feature coverage
description: What Eunia supports and what remains outside this release.
---

Eunia is in alpha. This page separates features with Eunia methods from
features you must handle through Discord events or direct requests. Being able
to call a route with `client.rest` does not mean Eunia implements that feature.

## Status meanings

| Status | Meaning |
| --- | --- |
| Built in | Eunia provides methods and types for the listed work. |
| Partly built in | Common tasks work, but some Discord features still need direct requests or events. |
| Data only | Eunia types the Discord data, but does not act on it for you. |
| Direct request | You must call the Discord route with `client.rest`. |
| Not built | Eunia does not support the feature yet. |
| Outside core | The core bot library does not provide the feature. |

## Current coverage

| Area | Status | Notes |
| --- | --- | --- |
| Chat input commands | Built in | Options, groups, autocomplete, publishing, permission checks, middleware, cooldowns, and delayed replies |
| User, message, and Entry Point commands | Data only | The Discord data is typed, but Eunia cannot register or run these commands yet |
| Prefix commands | Built in | Uses the same command tree and parses common option types |
| Buttons, selects, and modals | Built in | Includes listeners tied to a command and stable custom IDs |
| Interaction delivery | Partly built in | Interactions received through the Gateway can be answered; Eunia cannot receive interactions sent over HTTP |
| Messages and polls | Partly built in | Sending, editing, deleting, replying, files, reactions, and polls work; history, search, crossposting, bulk deletion, and voter lists do not |
| Pins | Built in | Lists pins, pages through results, pins and unpins messages, records reasons, and updates the cache |
| Channels and guild administration | Partly built in | Common channel, member, role, ban, timeout, and permission tasks work; many Discord routes do not have Eunia methods |
| Threads, forums, and media channels | Data only | Channel and event data is typed; creating and managing threads and posts is not built in |
| Auto Moderation and scheduled events | Data only | Rules, events, and actions are typed; creating and managing them is not built in |
| Invites, emojis, stickers, and integrations | Data only | Their data and events are typed; their Discord routes do not have Eunia methods |
| Audit logs and Stage instances | Data only | Audit entries, Stage data, and their events are typed; their Discord routes do not have Eunia methods |
| Soundboard and voice state | Data only | Requests and events are typed; sound management and voice audio are not built in |
| Applications and monetization | Data only | Application, entitlement, and subscription data is typed; their Discord routes do not have Eunia methods |
| Other Discord routes | Direct request | Call the route with `client.rest` and check the request and response data yourself |
| Gateway connection | Built in | Handles compression, reconnecting, heartbeats, presence, member requests, and sharding |
| Gateway events | Data only | Every event reaches `client.on("dispatch")`; common events also have named client events |
| HTTP requests | Built in | Handles rate limits, retries, files, cancellation, audit reasons, and Discord errors |
| Cache | Built in | Supports size limits, expiry, Redis, Valkey, and custom storage |
| Event Webhooks | Not built | Eunia cannot verify or receive these HTTP events yet |
| Voice connection and audio | Outside core | The core library does not connect to Discord voice or send and receive audio |
| Process management | Outside core | Your application starts, monitors, and coordinates its own processes |

## Connection and request behavior

The Gateway connection handles login, resume, compression, heartbeats,
reconnecting, and sharding. It stays within Discord's limits for starting
sessions.

The HTTP client groups and queues requests by Discord's rate limits. It limits
retries. A `POST` request retries only when the caller says it is safe to
repeat.

## Cache behavior

Each built-in cache has a size limit. Messages also expire by default. Redis,
Valkey, and custom storage keep a local memory cache so related data can be
read without waiting.

Editing a structure returns a new object. The original object does not change.

## What direct access means

`client.rest` can call any Discord HTTP route, and `client.on("dispatch")` receives
every Gateway event. These general APIs let you use Discord features before
Eunia adds dedicated methods. You still need to build and check the data
yourself.

Voice audio and process management are outside the core library. Event Webhooks
and HTTP interaction delivery are not built yet.

Open a [GitHub issue](https://github.com/Sillyfrogster/Eunia/issues) if a coverage entry is wrong or unclear.
