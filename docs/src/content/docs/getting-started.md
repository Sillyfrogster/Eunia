---
title: Getting started
description: Install Eunia, connect a bot, and publish a development command.
---

Eunia requires Bun 1.3.14 or newer. You also need a Discord application, a bot token, and a server where you can test commands.

## Install Eunia

Create a Bun project and add the current alpha release:

```sh
bun init
bun add @sillyfrogster/eunia@alpha
```

## Add environment variables

Create a `.env` file:

```dotenv
DISCORD_TOKEN=paste-your-token-here
DISCORD_GUILD_ID=paste-your-development-server-id-here
```

Bun loads `.env` automatically. Do not commit bot tokens.

## Create the bot

Create `src/bot.ts`:

```ts
import {
  Client,
  Command,
  Intents,
  type CommandContext,
} from "@sillyfrogster/eunia";

const token = process.env.DISCORD_TOKEN?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();

if (!token) throw new Error("Set DISCORD_TOKEN.");
if (!guildId) throw new Error("Set DISCORD_GUILD_ID.");

class PingCommand extends Command {
  name = "ping";
  description = "Check whether the bot is ready";
  kind = "slash" as const;

  async run(context: CommandContext): Promise<void> {
    await context.reply("Pong!");
  }
}

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: {
    commands: [new PingCommand()],
    publishOnStart: { scope: "guild", guildId },
  },
});

client.on("ready", (user) => {
  console.log(`Ready as ${user.tag}`);
});

await client.start();
```

`publishOnStart` replaces the commands in your development server. Guild commands update quickly, so use this setting while developing.

## Run the bot

```sh
bun run src/bot.ts
```

Run `/ping` in the development server. If Discord does not show the command, check that the application was invited with the `applications.commands` scope.

## Publish for production

Publish globally when the command list is ready:

```ts
await client.commands.publish({ scope: "global" });
```

Global publishing replaces the full global command list. Run it as a release step, not on every bot restart.

## Next

- [Add options and command groups](../guides/commands/)
- [Configure caching](../guides/cache/)
- [Add services with modules](../guides/modules/)
