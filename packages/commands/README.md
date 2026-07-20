# @eunia/commands

`@eunia/commands` uses the same command tree for Discord slash commands and
optional message prefixes. The class body is the command: every fact is a
named field, every behavior a method, no constructor. Each invocation gets a
new context.

```sh
bun add @eunia/commands
```

`@eunia/client` creates the manager for most bots. When using this lower
package directly, provide a `CommandHost` with application IDs, REST `put`
access, owner IDs, and an error reporter.

```ts
import {
  Command,
  CommandManager,
  option,
  type CommandContext,
  type CommandHost,
} from "@eunia/commands";

declare const host: CommandHost;

class GreetCommand extends Command {
  name = "greet";
  description = "Greet a user";
  kind = "slash" as const;
  rateLimit = { limit: 2, windowMs: 5_000, scope: "user" as const };
  user = option.user({ description: "The user to greet", required: true });

  async run(context: CommandContext): Promise<void> {
    const user = context.get(this.user);
    await context.reply(`Hello <@${user.id}>`);
  }
}

const commands = new CommandManager(host).register(new GreetCommand());
```

`kind` is mandatory: `"slash"`, `"prefix"`, or `"hybrid"`. A field with no
effect for the declared kind — aliases on a slash-only command, `autoDefer` on
a prefix-only command — is a registration error, never silently ignored.
`rateLimit` applies to every kind because the cooldown store enforces it.

Options are fields. The field's key in the class body becomes the option's
wire name, `required` controls whether `context.get()` returns the plain type
or `| undefined`, and a misspelled field reference is a compile error. `meta`
is free-form user space the library never interprets.

## Command-scoped listeners

Declare component and modal handlers as fields; components reference the
handler and the wire `custom_id` is derived from command, field, and args:

```ts
import { onButton } from "@eunia/commands";

class ConfirmCommand extends Command {
  name = "confirm";
  description = "Ask for confirmation";
  kind = "slash" as const;

  confirm = onButton(async (ctx, args) => {
    await ctx.update(`Confirmed ${args[0]}`);
  });

  async run(context: CommandContext): Promise<void> {
    await context.reply({
      content: "Proceed?",
      components: [
        { type: 1, components: [this.confirm.button({ label: "Yes" }, "42")] },
      ],
    });
  }
}
```

Deterministic ids make handlers restart-proof. The 100-character `custom_id`
cap is validated; args travel as strings and arrive as strings.

## Groups and publishing

A `CommandGroup` uses the same field anatomy plus `children`, a list of child
classes. Shared policy (permissions, `guildOnly`, `meta`) lives on the group.
A group may contain commands or one more level of groups; the manager rejects
trees Discord cannot register, and every child must share one kind.

`publish()` uses Discord's bulk overwrite endpoint. It replaces every
application command in the selected global or guild scope; prefix-only
commands are never published. Pass an explicit guild target while developing:

```ts
declare const guildId: string;
await commands.publish({ scope: "guild", guildId });
```

## Running commands

Pass Eunia `Interaction` and `Message` structures to `handle()`. The result is
`completed`, `autocomplete`, `rejected`, `failed`, or `ignored`. Rejections
cover expected cases such as missing permissions, bad arguments, and
cooldowns. Failures are also sent to `CommandHost.reportCommandError()`.
Component and modal interactions route to the matching listener field.

Middleware runs from the manager to each group and then the command. Await or
return `next()` to continue. Leaving out `next()` stops the command. Each
middleware function may call it once.

Built-in checks cover guild use, bot owners, user permissions, and bot
permissions. Custom guards run for command execution and autocomplete.
Autocomplete guards receive a context without reply or defer methods.

Autocomplete sends an empty choice list if checks or completion reach the
configured timeout. The default is 2,500 milliseconds, before Discord's
response deadline.

Set `autoDefer` on a command when work may take more than a moment. The timer
starts before guards and cooldown access. `context.reply()` takes a
`Sendable`, sends the initial response, edits an automatic defer, and uses
followups after a completed response. Set `MessageFlags.Ephemeral` in `flags`
to keep a reply private.

Discord fixes reply visibility when a defer is sent. If a later reply asks for
different visibility, Eunia removes the deferred placeholder and sends a
followup with the requested visibility.

Use `context.reply()` for this routing. Calling response verbs on
`context.interaction` remains available when the command needs full control.

Prefix handling is off by default. Enable it with a string, a list, or an
async resolver:

```ts
const commands = new CommandManager(host, {
  prefix: async (message) => message.guildId ? ["!", "eunia "] : "!",
});
```

Prefix arguments support quotes and backslash escapes. User, channel, role,
and mentionable options accept Discord mentions or IDs. Prefix events do not
carry the bot's channel permissions, so pass them to `handle()` when a command
checks bot permissions.

## Cooldowns

Use `CooldownStore` to share rate limits between processes. Its `consume()`
operation must count and test a use atomically. Keys include the application,
command path, and selected user, channel, guild, or global scope.

`MemoryCooldownStore` is bounded and needs no cleanup timer. If it is full of
active entries, it denies new keys until an entry expires. Increase
`maxEntries` or provide a shared store for larger workloads.

## Responses and errors

Change rejection text with `CommandManagerOptions.messages`. Invalid prefix
input receives the matching rejection message. Invalid autocomplete input
receives an empty choice list. A failed command receives the configured error
message when a response is still possible.
