# Coverage

This page is here so you can decide quickly whether Eunia does what your bot
needs. It is honest about the gaps: this is an alpha, and not every Discord
endpoint has a friendly method yet.

The short version. If you are building a text bot with slash commands, Eunia
covers you. If you need voice, look elsewhere for now. If you need a rarely used
endpoint, you can still call it directly through `client.rest`, you just write
the request yourself.

## What you can build today

Slash commands with typed options, subcommands, and one level of subcommand
groups. Options come back already typed, so an integer option reads as a
number without any parsing on your side. You can also enable manual prefix
commands (`!ping`) against the same command tree.

Buttons, select menus, and modals, including listeners scoped to the command
that created them. Eunia derives the component ids for you, so restarting the
bot does not break a button someone clicked yesterday.

Messages, embeds, polls, file uploads, and reactions. Embeds and components are
plain data rather than builder objects, so you can store them in a constant or
generate them in a loop without ceremony.

Guild administration in the common cases: fetching and editing guilds,
channels, members, and roles, plus bans, timeouts, and pins. Permissions are
plain bigint values with helpers (`can`, `canAny`, `missing`, `toFlagNames`)
and a `member.can()` shortcut.

## What runs underneath

You do not have to think about these, but they are the parts that decide
whether a bot survives contact with production.

The gateway handles identify and resume, compression, heartbeats, and
dead-connection recovery. If the connection drops, Eunia resumes the session
and replays what you missed rather than starting over. Sharding can be
automatic, a fixed count, or split across processes, and Eunia respects
Discord's identify concurrency and session start limits.

The REST client tracks Discord's rate limits from the response headers and
queues requests instead of letting them fail. Retries are bounded and apply to
rate limits, network failures, and server errors. `POST` is not retried unless
you ask for it, since resending a create is rarely what you want. Timeouts,
abort signals, audit log reasons, and typed errors are all supported.

Caching is a bounded least-recently-used store with optional expiry. There are
read-through adapters for Redis and Valkey, and an interface if you want to
supply your own. The cache is filled from gateway events, so reads are cheap
and stay current.

Structure methods never mutate. A successful edit hands you a new structure
rather than changing the one you were holding.

## Events

Eunia routes the common events into typed, cached structures: ready and user
updates, guild and member and role events, channel and thread lifecycle,
message create, update, and delete, and interactions.

Every other event still reaches you through `client.on("dispatch")` with its
raw payload. Nothing is dropped because it lacks a typed wrapper.

## Not in this release

Voice. Connections, codecs, players, and receive pipelines are all out of scope
and will be handled separately.

Friendly methods for the administrative corners of the API, such as audit logs,
scheduled events, auto moderation rules, stickers, and monetization. The
protocol types exist and `client.rest` reaches the endpoints, so these are
reachable, just not sugared.

A helper for every Components V2 layout. Components are plain typed payloads
you send through message methods.

Distributed coordination beyond the cache and cooldown interfaces. Running and
supervising your processes is your application's job, or a module's.
