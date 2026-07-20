# Eunia

Eunia is a TypeScript Discord library built for Bun. It keeps the core small,
lets you replace storage and other services, and includes a slash-first command
framework.

Eunia is in alpha. The public API may change before the first stable release.
Voice support is outside this release and will be handled separately.

## Quick start

Eunia requires Bun 1.3.14 or newer.

Install Eunia:

```sh
bun add @sillyfrogster/eunia@alpha
```

Create a command class and start the client:

```ts
import {
  Client,
  Command,
  Intents,
  type CommandContext,
} from "@sillyfrogster/eunia";

const token = process.env["DISCORD_TOKEN"]?.trim();
const guildId = process.env["DISCORD_GUILD_ID"]?.trim();
if (!token || token === "paste-your-token-here") {
  throw new Error("Set DISCORD_TOKEN before starting Eunia.");
}
if (!guildId || !/^\d{17,20}$/.test(guildId)) {
  throw new Error("Set DISCORD_GUILD_ID to a development guild ID.");
}

class PingCommand extends Command {
  name = "ping";
  description = "Check whether the bot is ready";
  kind = "slash" as const;
  rateLimit = { limit: 2, windowMs: 5_000, scope: "user" as const };

  async run(context: CommandContext): Promise<void> {
    await context.reply("Pong!");
  }
}

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: {
    commands: [new PingCommand()],
    publishOnStart: {
      scope: "guild",
      guildId,
    },
  },
});

client.on("ready", (user) => {
  console.log(`Ready as ${user.tag}`);
});

await client.start();
```

`publishOnStart` uses Discord's bulk overwrite route and replaces every command
in the target guild. Use it for a development guild. For production, call
`client.commands.publish()` as part of a release step so restarts do not
publish the same commands again. A separate publishing process can set
`applicationId` in `ClientOptions` and publish without connecting the gateway.

## What is included

- A resumable, compressed, multi-shard gateway client.
- REST rate-limit buckets, global limits, bounded bucket retention, bounded
  retries, multipart uploads, and typed errors.
- Bounded memory caching with optional Redis, Valkey, or custom adapters.
- Snapshot-based users, guilds, channels, messages, members, roles, and
  interactions with common methods.
- Declarative command classes, groups, subcommands, typed option fields,
  command-scoped component listeners, autocomplete, guards, middleware,
  permissions, cooldowns, and automatic deferral.
- Optional message prefixes that use the same command classes as slash
  commands.
- Ordered modules, shared services, and custom cache namespaces for third-party
  extensions.
- Raw gateway events for features that do not have a typed event yet.

See the [coverage guide](docs/coverage.md) for the current release boundary.

## Configuration

Memory caching is the default:

```ts
const client = new Client({
  token,
  intents: Intents.Guilds,
  cache: { adapter: { driver: "memory" } },
});
```

Redis and Valkey use Bun's built-in Redis client:

```ts
const client = new Client({
  token,
  intents: Intents.Guilds,
  cache: {
    adapter: {
      driver: "valkey",
      url: "redis://localhost:6379",
      prefix: "my-bot",
    },
    policies: {
      messages: { maxSize: 2_000, ttl: 10 * 60_000 },
    },
  },
});
```

Pass a `CacheAdapter` to use another store. Eunia always keeps a bounded hot
memory layer, so structure relations stay synchronous.

## Modules

| Module | Purpose |
| --- | --- |
| Client | Event routing, domain accessors, modules, and public re-exports |
| Commands | Slash-first command framework with optional prefixes |
| Structures | Discord structures, Sendable normalization, and helpers |
| Cache | Bounded memory, Redis, Valkey, and custom cache adapters |
| Gateway | WebSocket sessions, heartbeats, resume, and sharding |
| REST | HTTP transport, rate limits, retries, uploads, and route binding |
| Helpers | Opt-in embed, component, and modal content templates |
| Shared | Logger interfaces and shared runtime utilities |
| Types | Discord API payloads, enums, and shared protocol types |

Eunia ships as one npm package. Its internal workspaces keep the codebase
modular without requiring users to install several packages.

## Guides

- [Commands](docs/commands.md)
- [Caching](docs/cache.md)
- [Modules](docs/modules.md)
- [Coverage](docs/coverage.md)

## Work on Eunia

```sh
bun install
bun run check
bun run coverage
```

Tests use local fakes and a local gateway. They do not need a Discord token.
Copy `.env.example` to `.env` only when you want to run a bot against Discord.

## License

Eunia is available under the [MIT License](LICENSE).
