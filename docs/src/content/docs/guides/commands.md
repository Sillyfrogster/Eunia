---
title: Commands
description: Define, register, and publish commands.
---

Eunia command classes keep command data and behavior together. A class can handle a slash command, a prefix command, or both.

## Define a command

```ts
import {
  Command,
  option,
  type CommandContext,
} from "@sillyfrogster/eunia";

export class GreetCommand extends Command {
  name = "greet";
  description = "Greet another user";
  kind = "slash" as const;
  user = option.user({
    description: "The user to greet",
    required: true,
  });

  async run(context: CommandContext): Promise<void> {
    const user = context.get(this.user);
    await context.reply(`Hello <@${user.id}>!`);
  }
}
```

`kind` must be `"slash"`, `"prefix"`, or `"hybrid"`. The option field name becomes its Discord name. A required option returns its value directly; an optional option can return `undefined`.

Eunia validates names, descriptions, option order, limits, ranges, command size, group depth, and settings that do not apply to the selected command kind.

## Register commands

Pass commands to the client or register them before startup:

```ts
const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: { commands: [new GreetCommand()] },
});

client.commands.register(new HelpCommand());
await client.start();
```

Registration closes when command handling or publishing begins.

## Publish slash commands

Use one development server while commands are changing:

```ts
await client.commands.publish({ scope: "guild", guildId });
```

Publish globally for production:

```ts
await client.commands.publish({ scope: "global" });
```

Publishing uses Discord's bulk overwrite. The published list replaces every command in that scope. Do not publish the same global list once per server.

## Groups and subcommands

Discord supports a root command, an optional subcommand group, and a subcommand. `CommandGroup` uses that shape:

```ts
class AlertsGroup extends CommandGroup {
  name = "alerts";
  description = "Change alert settings";
  children = [EnableAlertsCommand, DisableAlertsCommand];
}

class SettingsGroup extends CommandGroup {
  name = "settings";
  description = "Change bot settings";
  children = [AlertsGroup];
}

client.commands.register(new SettingsGroup());
```

The example paths are `settings alerts enable` and `settings alerts disable`. Shared permissions, guild rules, and metadata belong on the group.

## Guards and middleware

A guard allows or rejects an invocation:

```ts
const paidPlan = (plans: PlanService): CommandGuard => async (context) =>
  plans.has(context.userId) || {
    allowed: false as const,
    reason: "This command needs a paid plan.",
  };
```

Middleware runs around command execution:

```ts
const timing: CommandMiddleware = async (context, next) => {
  const startedAt = performance.now();
  try {
    await next();
  } finally {
    console.log(context.path.join(" "), performance.now() - startedAt);
  }
};
```

Middleware runs from the command manager through each group to the command. Call `next` once to continue.

## Permissions and cooldowns

Commands can require a guild, a bot owner, user permissions, or bot permissions:

```ts
class LockdownCommand extends Command {
  name = "lockdown";
  description = "Lock the current channel";
  kind = "slash" as const;
  guildOnly = true;
  userPermissions = [PermissionFlags.ManageGuild];
  botPermissions = [PermissionFlags.ManageChannels];

  async run(context: CommandContext): Promise<void> {
    await context.reply("Channel locked.");
  }
}
```

Add a bounded rate limit with a scope:

```ts
rateLimit = { limit: 3, windowMs: 10_000, scope: "user" as const };
```

Scopes are `user`, `channel`, `guild`, and `global`. Implement `CooldownStore` when several processes need one shared atomic limit.

## Automatic deferral

Defer work that may take longer than Discord's response window:

```ts
autoDefer = { afterMs: 2_000, ephemeral: true };
```

If the command replies first, Eunia cancels the timer. If deferral wins, the first `context.reply` edits the deferred response and later replies become followups.

## Component listeners

Declare button, select, and modal listeners as command fields:

```ts
class ConfirmCommand extends Command {
  name = "confirm";
  description = "Ask for confirmation";
  kind = "slash" as const;

  confirm = onButton(async (context, args) => {
    await context.update(`Confirmed ${args[0]}`);
  });

  async run(context: CommandContext): Promise<void> {
    await context.reply({
      content: "Continue?",
      components: [
        {
          type: 1,
          components: [this.confirm.button({ label: "Yes" }, "42")],
        },
      ],
    });
  }
}
```

Eunia derives stable custom IDs from the command path, field, and string arguments. A restart does not invalidate an existing component.

## Autocomplete

Set `autocomplete: true` on a string, integer, or number option, then return at most 25 choices:

```ts
override autocomplete(context: AutocompleteContext) {
  const query = String(context.focused.value).toLowerCase();
  return cities
    .filter((city) => city.toLowerCase().startsWith(query))
    .slice(0, 25)
    .map((city) => ({ name: city, value: city }));
}
```

Eunia checks choice count, name length, and value type before responding.

## Prefix commands

Prefix handling is off by default. Enable a string, a list, or an asynchronous resolver:

```ts
const client = new Client({
  token,
  intents: [
    Intents.Guilds,
    Intents.GuildMessages,
    Intents.MessageContent,
  ],
  commands: {
    commands,
    prefix: {
      prefixes: async (message) =>
        message.guildId ? ["!", "eunia "] : "!",
      allowMention: true,
    },
  },
});
```

Prefix arguments support quotes, escapes, booleans, numbers, Discord IDs, mentions, attachments, and a final rest-of-line string. Enable the Message Content intent in Discord's developer portal.

## Results and errors

Expected rejections include cooldowns, invalid arguments, and missing permissions. Unexpected failures emit `commandError`:

```ts
client.on("commandError", (error, context) => {
  console.error(context?.path.join(" "), error.cause);
});

client.on("commandResult", (result) => {
  if (result.status === "rejected") {
    console.log(result.rejection.code);
  }
});
```

Change common rejection text through `commands.messages`.
