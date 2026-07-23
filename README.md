# Eunia

[![npm version](https://img.shields.io/npm/v/%40sillyfrogster%2Feunia?label=npm)](https://www.npmjs.com/package/@sillyfrogster/eunia)
[![Documentation](https://img.shields.io/badge/docs-read-285C70)](https://sillyfrogster.github.io/Eunia/)
[![Discord support server](https://img.shields.io/badge/Discord-Support_server-5865F2?logo=discord&logoColor=white)](https://discord.gg/WuPqrRtYHX)

Eunia is a TypeScript Discord library built for Bun. It keeps the core small,
lets you replace storage and other services, and includes an application and
prefix command framework.

Eunia is in alpha. The public API may change before the first stable release.
Voice support is outside this release and will be handled separately.

## Quick start

Eunia requires Bun 1.3.14 or newer.

Install Eunia:

```sh
bun add @sillyfrogster/eunia@alpha
```

Create a command and start the client:

```ts
import {
  Client,
  Intents,
  command,
} from "@sillyfrogster/eunia";

const token = process.env["DISCORD_TOKEN"]?.trim();
const developmentGuildId = process.env["DISCORD_GUILD_ID"]?.trim();
if (!token || token === "paste-your-token-here") {
  throw new Error("Set DISCORD_TOKEN before starting Eunia.");
}
if (!developmentGuildId || !/^\d{17,20}$/.test(developmentGuildId)) {
  throw new Error("Set DISCORD_GUILD_ID to a development guild ID.");
}

const ping = command({
  name: "ping",
  description: "Check whether the bot is ready",
  rateLimit: { limit: 2, windowMs: 5_000, scope: "user" },
  async run(context) {
    await context.reply("Pong!");
  },
});

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: {
    commands: [ping],
    publishOnStart: {
      scope: "guild",
      guildId: developmentGuildId,
    },
  },
});

client.on("ready", (user) => {
  console.log(`Ready as ${user.tag}`);
});

await client.start();
```

`publishOnStart` replaces every application command in the development guild.
Guild commands update immediately, which makes them useful while you work.

Publish once to the global scope when the commands are ready for every server:

```ts
await client.commands.publish({ scope: "global" });
```

Run global publishing as a release step instead of publishing on every restart.
Do not loop over the bot's guild IDs. A separate publishing process can set
`applicationId` in `ClientOptions` and publish without connecting the gateway.

Every publish requires an explicit global or guild target. Publishing refuses
an empty application command list. Use
`clearPublishedCommands(target)` only when clearing a whole Discord command
scope is intentional.

## What is included

- A resumable, compressed, multi-shard gateway client.
- REST rate-limit buckets, global limits, bounded bucket retention, bounded
  retries, multipart uploads, and typed errors.
- Bounded memory caching with optional Redis, Valkey, or custom adapters.
- Snapshot-based users, guilds, channels, messages, members, roles, and
  interactions with common methods.
- Immutable command definitions, groups, subcommands, typed option fields,
  command-scoped component listeners, autocomplete, guards, middleware,
  permissions, cooldowns, and automatic deferral.
- Optional message prefixes that can share definitions with slash
  commands.
- Ordered modules, shared services, and custom cache namespaces for third-party
  extensions.
- Raw gateway events for features that do not have a typed event yet.

See [feature coverage](https://sillyfrogster.github.io/Eunia/reference/coverage/) for the current release boundary.

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
| Helpers | Content templates and Components V2 layout helpers |
| Shared | Logger interfaces and shared runtime utilities |
| Types | Discord API payloads, enums, and shared protocol types |

Eunia ships as one npm package. Its internal workspaces keep the codebase
modular without requiring users to install several packages.

## Guides

- [Getting started](https://sillyfrogster.github.io/Eunia/getting-started/)
- [Commands](https://sillyfrogster.github.io/Eunia/guides/commands/)
- [Caching](https://sillyfrogster.github.io/Eunia/guides/cache/)
- [Modules](https://sillyfrogster.github.io/Eunia/guides/modules/)
- [Feature coverage](https://sillyfrogster.github.io/Eunia/reference/coverage/)
- [Example bots](https://sillyfrogster.github.io/Eunia/examples/)

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
