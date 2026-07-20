# Commands

Eunia uses command classes. The class body is the command: every fact is a
named field, every behavior a method, no constructor. The same class can
handle a slash command and an optional message prefix.

## Define a command

```ts
import {
  Client,
  Command,
  CommandGroup,
  Intents,
  PermissionFlags,
  option,
  type AutocompleteContext,
  type CommandContext,
  type CommandGuard,
  type CommandMiddleware,
} from "eunia";

export class GreetCommand extends Command {
  name = "greet";
  description = "Greet another user";
  kind = "slash" as const;
  user = option.user({ description: "The user to greet", required: true });

  async run(context: CommandContext): Promise<void> {
    const user = context.get(this.user);
    await context.reply(`Hello <@${user.id}>!`);
  }
}
```

`kind` is mandatory: `"slash"`, `"prefix"`, or `"hybrid"`. Options are fields:
the field's key becomes the option's wire name, and `required` decides whether
`context.get()` returns the plain type or `| undefined`. A misspelled field
reference is a compile error.

Eunia validates names, descriptions, option order, choice limits, numeric
ranges, command size, group depth, and kind applicability when you register a
command. A field that has no effect for the declared kind — aliases on a
slash-only command, `autoDefer` on a prefix-only command — is a registration
error. Invalid definitions fail before the client connects.

## Register and publish

Register commands in the client options or before `client.start()`:

```ts
const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: { commands: [new GreetCommand()] },
});

client.commands.register(new HelpCommand());
await client.start();
```

Publish to one guild while developing:

```ts
await client.commands.publish({ scope: "guild", guildId });
```

Publish globally for production:

```ts
await client.commands.publish({ scope: "global" });
```

Publishing uses a bulk overwrite. The published list becomes the complete
command list for that scope.

## Groups and subcommands

Discord supports a root command, an optional subcommand group, and a
subcommand. `CommandGroup` uses that same shape.

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

`children` lists child classes; the manager instantiates them at registration.
Shared policy such as permissions, `guildOnly`, and `meta` lives on the
group, and every child must declare the same kind.

The context path for the example is `settings alerts enable` or
`settings alerts disable`. Prefix commands use the same path.

## Guards and middleware

Use a guard for a yes-or-no check:

```ts
const paidPlan = (plans: PlanService): CommandGuard => async (context) =>
  plans.has(context.userId) || {
    allowed: false as const,
    reason: "This command needs a paid plan.",
  };
```

The command host is intentionally small. Application services normally come
from a closure or a module, so a guard can use the service without putting it
inside the command manager.

Use middleware for work that runs around command execution:

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

Middleware runs from global to group to command. Calling `next()` twice is an
error.

## Permissions and ownership

Command settings can require a guild, a bot owner, user permissions, or bot
permissions:

```ts
class LockdownCommand extends Command {
  // …name, description, kind…
  guildOnly = true;
  userPermissions = [PermissionFlags.ManageGuild];
  botPermissions = [PermissionFlags.ManageRoles];
}
```

Set `ownerIds` in `ClientOptions` for owner-only commands. Slash interactions
include permission data. Prefix commands use the member and role payloads in
the client cache.

## Cooldowns

Each command can set a limit and scope:

```ts
class BusyCommand extends Command {
  // …name, description, kind…
  rateLimit = { limit: 3, windowMs: 10_000, scope: "user" as const };
}
```

Scopes are `user`, `channel`, `guild`, and `global`. The built-in memory store
is bounded. Implement `CooldownStore` when several processes need one atomic
shared limit.

## Automatic deferral

An interaction needs its first response within three seconds. Enable
automatic deferral for work that may take longer:

```ts
class SlowCommand extends Command {
  // …name, description, kind…
  autoDefer = { afterMs: 2_000, ephemeral: true };
}
```

If the command replies before the timer, Eunia cancels the defer. If the defer
wins, the first `context.reply()` edits the deferred response. Later replies
become followups. The interaction structure prevents two initial responses
from winning at the same time.

## Autocomplete

Mark a string, integer, or number option with `autocomplete: true`, then
override the command method:

```ts
override autocomplete(context: AutocompleteContext) {
  const query = String(context.focused.value).toLowerCase();
  return cities
    .filter((city) => city.toLowerCase().startsWith(query))
    .slice(0, 25)
    .map((city) => ({ name: city, value: city }));
}
```

Eunia checks the choice count, name length, and value type before responding.

## Prefix fallback

Prefix handling is off by default. Enable one prefix, several prefixes, or an
async resolver:

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

Prefix arguments support quotes, escapes, booleans, numbers, IDs, mentions,
attachments, and a final rest-of-line string. Prefix commands require the
Message Content gateway intent. Enable that privileged intent for the
application in Discord's developer portal and include it in `ClientOptions`.

## Errors and results

Expected rejections, such as a cooldown or missing permission, get a short
response. Unexpected failures are wrapped in a `CommandError` and sent to the
client:

```ts
client.on("commandError", (error, context) => {
  console.error(context?.path.join(" "), error.cause);
});

client.on("commandResult", (result) => {
  if (result.status === "rejected") console.log(result.rejection.code);
});
```

Message text for common rejections is configurable in `commands.messages`.
