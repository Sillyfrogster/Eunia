# Client

The Eunia client connects the gateway, REST client, cache, structures, command
framework, domain accessors, and extension modules.

```sh
bun add @sillyfrogster/eunia@alpha
```

## Start a client

```ts
import {
  Client,
  Intents,
  command,
} from "@sillyfrogster/eunia";

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) throw new Error("Set DISCORD_TOKEN.");

const ping = command({
  name: "ping",
  description: "Check whether the bot is ready",
  async run(context) {
    await context.reply("Pong!");
  },
});

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: { commands: [ping] },
});

client.on("ready", (user) => {
  console.log(`Ready as ${user.tag}`);
});

await client.start();
```

The client discovers its application and bot IDs when they are not supplied.
Give it only the intents your bot needs. The example handles an already
published command. Add an explicit `publishOnStart` target while developing
if the client should publish during startup.

## Add commands

Commands are immutable definitions created with `command()`,
`prefixCommand()`, `userCommand()`, and `messageCommand()`. Compose chat-input
and prefix commands with `commandGroup()`, then pass the root definitions to
the client.

```ts
const client = new Client({
  token,
  intents: [
    Intents.Guilds,
    Intents.GuildMessages,
    Intents.MessageContent,
  ],
  commands: {
    commands: [moderation, inspectUser, saveMessage],
    prefix: ["!", "eunia "],
    publishOnStart: {
      scope: "guild",
      guildId: developmentGuildId,
    },
  },
});
```

`command()` is chat-input only unless its definition includes `prefix: true`
or prefix settings. `prefixCommand()` is prefix only and is never sent to
Discord. User and message context-menu commands stay at the root.

Prefix commands need the Message Content intent in the Discord developer
portal and in the client.

Use guild publishing for development because updates arrive quickly. Publish
globally once when commands are ready for every server. Publishing uses
Discord's bulk overwrite endpoint and replaces every application command in
the chosen scope. Every publish needs an explicit target:

```ts
await client.commands.publish({ scope: "global" });
```

`publish()` refuses an empty application command list. To intentionally clear
a scope, use the explicit destructive method:

```ts
await client.commands.clearPublishedCommands({
  scope: "guild",
  guildId: retiredGuildId,
});
```

Pass services into command factory functions and capture them in the handler:

```ts
function createStatusCommand(health: HealthService) {
  return command({
    name: "status",
    description: "Show service health",
    async run(context) {
      await context.reply(await health.summary());
    },
  });
}

const status = createStatusCommand(health);
```

See the command package README for typed options, groups, listeners, access
rules, autocomplete, cooldowns, and direct `CommandManager` use.

### Choose who handles commands

The client handles command interactions and prefix messages automatically by
default. It starts that work before it emits `interactionCreate` or
`messageCreate`. Treat those events as observers for framework-owned commands:
do not route or answer the same source again.

Set `autoHandle: false` when an event listener or another router must decide
which command sources the framework receives:

```ts
const client = new Client({
  token,
  intents: [
    Intents.Guilds,
    Intents.GuildMessages,
    Intents.MessageContent,
  ],
  commands: {
    commands: [status],
    prefix: ["!"],
    autoHandle: false,
  },
});
```

Gateway events are still cached, hydrated, and emitted. Call
`client.handleCommand(source)` for a source you want Eunia to handle. This
method emits `commandResult` for every non-ignored result. For prefix
messages, it loads only the user or bot permission subjects required by the
active access rules. Interactions use Discord's member and application
permission fields.

With manual ownership, call `handleCommand(source)` once. The setting does not
change registration or `publishOnStart`.

## Use domain accessors

Each domain exposes cache reads and REST operations. `get` reads the cache
first and fetches on a miss. `peek` reads the cache synchronously.
`undefined` means the value is not cached, not that it does not exist. `pull`
always fetches and refreshes the cache.

```ts
const user = client.users.peek(userId) ?? await client.users.get(userId);
const fresh = await client.messages.pull(channelId, messageId);
const history = await client.messages.list(channelId, {
  before: messageId,
  limit: 100,
});

await client.messages.send(channelId, "Hello");
await client.reactions.add(channelId, messageId, "✅");
await client.members.addRole(guildId, userId, roleId);
```

IDs follow the order used in Discord's URL. For example,
`/channels/{channelId}/messages/{messageId}` maps to
`(channelId, messageId, ...)`.

Memory caching is included. Set `cache.adapter.driver` to `"redis"` or
`"valkey"`, or pass a custom `CacheAdapter`.

Eunia is in alpha. Voice is not included in this release.
