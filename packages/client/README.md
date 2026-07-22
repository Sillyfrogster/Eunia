# Client

The Eunia client connects the gateway, REST client, cache, structures,
command framework, domain accessors, and extension modules.

```sh
bun add @sillyfrogster/eunia@alpha
```

```ts
import { Client, Command, Intents, type CommandContext } from "@sillyfrogster/eunia";

const token = process.env["DISCORD_TOKEN"]?.trim();
if (!token) {
  throw new Error("Set DISCORD_TOKEN.");
}

class Ping extends Command {
  name = "ping";
  description = "Check whether the bot is ready";
  kind = "slash" as const;

  async run(context: CommandContext) {
    await context.reply("Pong!");
  }
}

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: { commands: [new Ping()] },
});

await client.start();
```

See the command guide for development and production publishing. A production
bot publishes commands globally once instead of publishing to every guild.

Each domain on the client exposes three cache accessors and its REST verbs.
`get` reads the cache first and fetches on a miss, `peek` reads the cache
synchronously (`undefined` means not cached, never "doesn't exist"), and
`pull` always fetches and refreshes the cache:

```ts
const user = client.users.peek(userId) ?? await client.users.get(userId);
const fresh = await client.messages.pull(channelId, messageId);
const history = await client.messages.list(channelId, { before: messageId, limit: 100 });

await client.messages.send(channelId, "Hello");
await client.reactions.add(channelId, messageId, "✅");
await client.members.addRole(guildId, userId, roleId);
```

Ids follow URL order: `/channels/{c}/messages/{m}` means
`(channelId, messageId, …)`.

Memory caching is built in. Set `cache.adapter.driver` to `redis` or `valkey`,
or pass a custom `CacheAdapter`. Set `commands.prefix` to add a manual prefix
to the same command classes.

Eunia is in alpha. Voice is not included in this release.
