# @eunia/client

The main Eunia package. It connects the gateway, REST client, cache,
structures, command framework, domain accessors, and extension modules.

```sh
bun add @eunia/client
```

```ts
import { Client, Command, Intents, type CommandContext } from "@eunia/client";

const token = process.env["DISCORD_TOKEN"]?.trim();
const guildId = process.env["DISCORD_GUILD_ID"]?.trim();
if (!token || !guildId || !/^\d{17,20}$/.test(guildId)) {
  throw new Error("Set DISCORD_TOKEN and a valid DISCORD_GUILD_ID.");
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
await client.commands.publish({ scope: "guild", guildId });
```

Each domain on the client exposes three cache accessors and its REST verbs.
`get` reads the cache first and fetches on a miss, `peek` reads the cache
synchronously (`undefined` means not cached, never "doesn't exist"), and
`pull` always fetches and refreshes the cache:

```ts
const user = client.users.peek(userId) ?? await client.users.get(userId);
const fresh = await client.messages.pull(channelId, messageId);

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
