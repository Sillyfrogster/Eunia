# Commands

Eunia provides chat-input commands, prefix commands, user commands, message
commands, groups, autocomplete, and component listeners.

```sh
bun add @sillyfrogster/eunia@alpha
```

## Define a chat-input command

`command()` creates a Discord chat-input command. Put options in the `options`
map. The map keys become Discord option names and the values are available on
`context.options`.

```ts
import { command, option } from "@sillyfrogster/eunia";

const greet = command({
  name: "greet",
  description: "Greet another user",
  options: {
    user: option.user({
      description: "The user to greet",
      required: true,
    }),
    note: option.string({
      description: "A short note to include",
      maxLength: 120,
    }),
  },
  async run(context) {
    const { user, note } = context.options;
    const suffix = note ? ` ${note}` : "";
    await context.reply(`Hello <@${user.id}>!${suffix}`);
  },
});
```

Required options have a required value type. Optional options include
`undefined`, so TypeScript asks you to handle the missing value. User, channel,
role, mentionable, and attachment options include the resolved Discord data
when it was present in the interaction.

Definitions are immutable values. You can create them once, compose them into
groups, and register the same values wherever your application needs them.

## Inject dependencies with closures

A command does not receive the client or a service container. Pass the
dependencies it needs to a small factory and capture them in `run`.

```ts
interface ReminderStore {
  create(userId: string, text: string): Promise<void>;
}

function createReminderCommand(reminders: ReminderStore) {
  return command({
    name: "remind",
    description: "Save a reminder",
    options: {
      text: option.string({
        description: "What to remember",
        required: true,
      }),
    },
    async run(context) {
      await reminders.create(context.userId, context.options.text);
      await context.reply("Reminder saved.");
    },
  });
}
```

This keeps dependencies explicit and makes the command easy to test with a
small fake service.

## Choose the route

Use one definition function for each kind of command:

- `command()` creates a Discord chat-input command.
- `prefixCommand()` creates a prefix-only message command.
- `userCommand()` creates a user context-menu command.
- `messageCommand()` creates a message context-menu command.

A chat-input command can also handle a prefix route. Add `prefix: true`, or
provide aliases:

```ts
const ping = command({
  name: "ping",
  description: "Check whether the bot is ready",
  prefix: { aliases: ["p"] },
  async run(context) {
    await context.reply("Pong!");
  },
});
```

When both routes are enabled, `context.kind` is `"slash"` or `"prefix"`.
Common methods such as `reply()` work on both. Narrow by `context.kind` before
using `context.interaction`, `context.message`, or another route-specific
field.

Share one definition only when both routes use the same options, access rules,
rate limit, listeners, and behavior. Use separate `command()` and
`prefixCommand()` definitions when either route needs a different contract.
Application and prefix roots are separate, so the definitions may use the
same name.

Use `prefixCommand()` when a command should never be published to Discord:

```ts
import { prefixCommand } from "@sillyfrogster/eunia";

const reload = prefixCommand({
  name: "reload",
  description: "Reload local configuration",
  aliases: ["refresh"],
  access: { ownerOnly: true },
  async run(context) {
    await context.reply("Configuration reloaded.");
  },
});
```

User and message commands receive their selected target and do not expose
chat-input options:

```ts
import { messageCommand, userCommand } from "@sillyfrogster/eunia";

const inspectUser = userCommand({
  name: "Inspect User",
  async run(context) {
    await context.reply(`Selected ${context.target.user.displayName}.`);
  },
});

const saveMessage = messageCommand({
  name: "Save Message",
  async run(context) {
    await archive.save(context.target.id, context.target.raw);
    await context.reply("Message saved.");
  },
});
```

Context-menu commands are roots and cannot be placed in a group.

## Group related commands

`commandGroup()` accepts existing definitions. A group can contain chat-input,
prefix-only, and dual-route children. Eunia builds the application-command and
prefix trees independently, so each route only sees the children it can run.

```ts
import {
  command,
  commandGroup,
  prefixCommand,
} from "@sillyfrogster/eunia";

const ban = command({
  name: "ban",
  description: "Ban a member",
  run: banMember,
});

const clearLocalCache = prefixCommand({
  name: "clear-cache",
  description: "Clear the local cache",
  run: clearCache,
});

const moderation = commandGroup({
  name: "moderation",
  description: "Moderation tools",
  prefix: { aliases: ["mod"] },
  children: [ban, clearLocalCache],
});
```

Application-command groups follow Discord's nesting and child limits.
Prefix-only branches can be deeper because they are not sent to Discord.
Access rules, middleware, and metadata on a group apply to its descendants.

Prefix-only definitions also avoid Discord's caps for names, descriptions,
option counts, choice counts, and string lengths. Their options may omit
descriptions. Autocomplete, localizations, and channel type filters are
rejected because a prefix message cannot use them. Dual-route definitions
still follow the application command limits.

## Add component listeners

Listeners belong to a command through its `listeners` map. Build a component
with the matching handle from `context.listeners`. Read route arguments from
`context.args` inside the listener.

```ts
import {
  CommandRejection,
  command,
  onButton,
  types,
} from "@sillyfrogster/eunia";

const choose = onButton(async (context) => {
  const choice = context.args[0];
  if (choice !== "yes" && choice !== "no") {
    throw new CommandRejection(
      "invalid_input",
      "This choice is no longer available.",
    );
  }

  await context.update({
    content: choice === "yes" ? "Confirmed." : "Cancelled.",
    components: [],
  });
});

const confirm = command({
  name: "confirm",
  description: "Ask for confirmation",
  listeners: { choose },
  async run(context) {
    await context.reply({
      content: "Continue?",
      components: [
        {
          type: types.ComponentType.ActionRow,
          components: [
            context.listeners.choose.button(
              { label: "Yes", style: types.ButtonStyle.Success },
              "yes",
            ),
            context.listeners.choose.button(
              { label: "No", style: types.ButtonStyle.Danger },
              "no",
            ),
          ],
        },
      ],
    });
  },
});
```

Eunia derives a compact listener ID from the full command path, listener name,
and listener kind. String arguments are encoded into the ID and are limited by
Discord's 100-character `custom_id` limit.

Listeners inherit manager guards and the group's and command's access rules.
Add stricter rules with the listener's `access` option. Set
`inheritAccess: false` only when the listener is intentionally public;
manager guards still run.

Inside a listener, build the next step by listener name:

```ts
const next = context.listeners.button(
  "choose",
  { label: "Choose again" },
  "ticket:43",
);
```

Application command contexts can open a modal through the matching command
handle:

```ts
await context.modal(
  context.listeners.edit.modal(editModal, "record-42"),
);
```

Button and select listener contexts can open the next modal by listener name:

```ts
const openEdit = onButton(async (context) => {
  const modal = context.listeners.modal(
    "edit",
    editModal,
    "record-42",
  );
  await context.modal(modal);
});
```

In these examples, `editModal` is a `ListenerModalInput`. Slash, user, and
message command contexts expose `modal()`. Prefix and modal submit contexts do
not.

`context.modal()` is queued with the other context response methods, so
concurrent calls cannot race to claim the initial response. It rejects if an
earlier response or automatic defer has already claimed the interaction.
Call it before automatic deferral fires.

Listener options also accept `rateLimit` and `autoDefer`. Button and select
defers are message updates and cannot be ephemeral. A modal may defer
ephemerally only when its submit has no source message. Listeners do not run
command middleware or reuse the command's rate limit.

A listener must reply, update, defer, or open a modal from a button or select.
After a deferred component update, `update()` edits the source message and
`reply()` sends a followup. A modal that defers a new message must still
finish with `reply()` or `update()`.

## Access, middleware, and cooldowns

Place built-in access rules under `access`:

```ts
const purge = command({
  name: "purge",
  description: "Delete recent messages",
  access: {
    guildOnly: true,
    userPermissions: [types.PermissionFlags.ManageMessages],
    botPermissions: [types.PermissionFlags.ManageMessages],
    guards: [hasActiveSubscription],
  },
  rateLimit: { limit: 2, windowMs: 10_000, scope: "user" },
  run: purgeMessages,
});
```

Middleware runs from the manager, through each group, to the command. Call
`next()` once to continue. Use `await next()` when code after it must wait for
the handler. Returning without `next()` stops the chain, so interaction
middleware that stops must send the final response itself.

Middleware may catch an error from `await next()` and recover, but it must
still finish the interaction response.

Throw `CommandRejection` for expected handler or middleware conditions:

```ts
throw new CommandRejection(
  "invalid_input",
  "That record no longer exists.",
  { recordId },
);
```

The manager returns `rejected` and does not report it as an unexpected
framework failure.

`MemoryCooldownStore` is the default cooldown store. Provide a custom
`CooldownStore` when several processes need to share limits. Its `consume()`
operation must count and test a use atomically.

## Autocomplete

Add the handler to the option it completes:

```ts
const search = command({
  name: "search",
  description: "Search the catalog",
  options: {
    query: option.string({
      description: "What to find",
      required: true,
      async autocomplete(context) {
        return catalog
          .suggest(context.focused.value, {
            signal: context.signal,
          })
          .then((names) => names.map((name) => ({ name, value: name })));
      },
    }),
  },
  async run(context) {
    await context.reply(`Searching for ${context.options.query}.`);
  },
});
```

Autocomplete receives an access context without reply or defer methods.
Eunia sends an empty choice list if checks or completion reach the configured
timeout. The timeout defaults to 2,500 milliseconds and aborts
`context.signal`. Pass that signal to cancellable work.

The focused value has the option's string or number type.
`context.options` includes every value Discord has sent so far, including the
focused value. The object uses a broad resolved-value record, so narrow values
before using type-specific members.

## Deferring and replying

Set `autoDefer` when a command may take more than a moment:

```ts
const report = command({
  name: "report",
  description: "Build a report",
  autoDefer: { afterMs: 1_500, ephemeral: true },
  async run(context) {
    const file = await reports.build();
    await context.reply({ files: [file], flags: types.MessageFlags.Ephemeral });
  },
});
```

`context.reply()` sends the first interaction response, edits a matching
deferred response, and sends followups after the first reply. Discord fixes a
reply's visibility when it is deferred. A later reply must use the same
visibility or Eunia reports a `ReplyVisibilityMismatchError`.

Context `reply()`, `defer()`, `modal()`, and listener `update()` calls are
serialized in call order. A modal must open before automatic deferral claims
the interaction. If it opens first, the defer safely does nothing.

Deferral only buys time. An interaction command must finish its response,
normally through `context.reply()`; returning without responding or after
only a defer is a command execution failure.

Prefix replies ignore the ephemeral flag because Discord messages cannot be
ephemeral.

## Register and publish

The Eunia client creates and runs the manager for most bots:

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
    publishOnStart: { scope: "guild", guildId: developmentGuildId },
    prefix: "!",
  },
});
```

Prefix commands need the Message Content intent in the Discord developer
portal and in the client.

Guild publishing is useful during development. Publish to the global scope
once when commands are ready for every server. Publishing uses Discord's bulk
overwrite endpoint, so it replaces every application command in that scope.
Prefix-only commands are never published.

Every publish requires an explicit `{ scope: "global" }` or
`{ scope: "guild", guildId }` target. `publish()` refuses an empty application
command list. Use `clearPublishedCommands(target)` when replacing a scope with
an empty list is intentional.

When using the command package directly, provide a `CommandHost` and register
definitions on a `CommandManager`:

```ts
import {
  CommandManager,
  type CommandHost,
} from "@sillyfrogster/eunia";

declare const host: CommandHost;

const commands = new CommandManager(host, { prefix: "!" })
  .register(moderation, inspectUser, saveMessage);

await commands.publish({
  scope: "guild",
  guildId: developmentGuildId,
});
```

Pass Eunia `Interaction` and `Message` structures to `handle()`. Its result is
`completed`, `autocomplete`, `rejected`, `failed`, or `ignored`. Rejections
cover expected cases such as missing permissions, invalid input, and active
cooldowns. Failures are also sent to `CommandHost.reportCommandError()`.

The on-demand permission resolver receives the subjects that are needed and
an autocomplete abort signal when one exists:

```ts
await commands.handle(source, {
  resolvePermissions(needs, signal) {
    return permissions.resolve(source, needs, signal);
  },
});
```

Prefix arguments support quotes and backslash escapes. User, channel, role,
and mentionable options accept Discord mentions or IDs. Prefix messages do not
contain the bot's channel permissions, so pass them to `handle()` when a
command checks bot permissions.

Static prefixes and their option booleans are validated when the manager is
created. A dynamic prefix resolver may return an empty array, `null`, or
`undefined` to skip one message. Other values produce a failed handle result.

Use `CommandManagerOptions.messages` to replace built-in rejection and error
text.
