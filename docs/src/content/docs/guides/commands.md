---
title: Commands
description: Define, compose, register, and publish commands.
---

Eunia commands are immutable values created by functions. Options, listeners, access rules, and handlers are visible in one definition. Services enter through normal function arguments and stay available to the handler through closures.

## Choose how a command is exposed

Use the function that matches the routes you want:

| Function | Application command | Prefix command |
| --- | --- | --- |
| `command()` | Chat input | Only when `prefix` is set |
| `prefixCommand()` | No | Yes |
| `userCommand()` | User context menu | No |
| `messageCommand()` | Message context menu | No |

`command()` is slash-first:

```ts
const status = command({
  name: "status",
  description: "Show service status",
  async run(context) {
    await context.reply("All systems are ready.");
  },
});
```

Add `prefix: true` to expose the same command through both routes:

```ts
const status = command({
  name: "status",
  description: "Show service status",
  prefix: true,
  async run(context) {
    await context.reply("All systems are ready.");
  },
});
```

Use an object when the prefix route needs aliases:

```ts
prefix: { aliases: ["health", "ready"] }
```

Use `prefixCommand()` when a command should never be published to Discord:

```ts
const reloadText = prefixCommand({
  name: "reloadtext",
  description: "Reload local text files",
  aliases: ["reload-copy"],
  async run(context) {
    await reloadCopy();
    await context.reply("Text reloaded.");
  },
});
```

The command manager treats application and prefix names as separate routes. A slash-only command and a prefix-only command may use the same name.

Use one dual-route `command()` only when both routes share the same name,
options, access rules, rate limit, listeners, and behavior. Use separate
definitions when either route needs a different contract. The two definitions
can still call the same application service.

## Add options

Declare options in an `options` object. Its keys become the option names, and the handler receives a typed `context.options` object.

```ts
const greet = command({
  name: "greet",
  description: "Greet another user",
  options: {
    user: option.user({
      description: "The user to greet",
      required: true,
    }),
    message: option.string({
      description: "A short note to include",
      maxLength: 120,
    }),
  },
  async run(context) {
    const note = context.options.message
      ? ` ${context.options.message}`
      : "";

    await context.reply(
      `Hello <@${context.options.user.id}>!${note}`,
    );
  },
});
```

A required option has its value type. An optional option also allows `undefined`. TypeScript infers both from the option map.

The available factories are:

| Factory | Handler value |
| --- | --- |
| `option.string()` | `string` |
| `option.integer()` | `number` |
| `option.number()` | `number` |
| `option.boolean()` | `boolean` |
| `option.user()` | `ResolvedUser` |
| `option.channel()` | `ResolvedChannel` |
| `option.role()` | `ResolvedRole` |
| `option.mentionable()` | `ResolvedMentionable` |
| `option.attachment()` | `ResolvedAttachment` |

For application commands, every option needs a description. Required options must appear before optional options in the object. Eunia checks Discord's limits when the command is registered.

Prefix-only definitions do not use Discord's caps for name length,
description length, option count, choice count, or string length. Their option
descriptions may be omitted. They still enforce value types, numeric ranges,
and required-before-optional ordering.

Autocomplete, localizations, and channel type filters are rejected on
prefix-only options because a message route cannot use them. A dual-route
definition follows the application limits, and its localizations and channel
filter affect only the Discord route.

## Inject services through a closure

Definitions do not need a client reference or a base class. Pass dependencies to a factory and use them in the handler:

```ts
interface ProfileService {
  displayName(userId: string): Promise<string>;
}

function createProfileCommand(profiles: ProfileService) {
  return command({
    name: "profile",
    description: "Show your profile",
    async run(context) {
      const name = await profiles.displayName(context.userId);
      await context.reply(`Profile: ${name}`);
    },
  });
}

const profile = createProfileCommand(profileService);
```

This keeps the command easy to test. A test can pass a small fake service without building a client.

## Group related commands

`commandGroup()` takes existing command and group values:

```ts
const enableAlerts = command({
  name: "enable",
  description: "Enable alerts",
  async run(context) {
    await context.reply("Alerts enabled.");
  },
});

const disableAlerts = command({
  name: "disable",
  description: "Disable alerts",
  async run(context) {
    await context.reply("Alerts disabled.");
  },
});

const alerts = commandGroup({
  name: "alerts",
  description: "Change alert settings",
  children: [enableAlerts, disableAlerts],
});

const settings = commandGroup({
  name: "settings",
  description: "Change bot settings",
  children: [alerts],
});
```

The application paths are `/settings alerts enable` and `/settings alerts disable`.

A group can contain slash-only, prefix-only, and dual-route children. Eunia builds each route from the children that support it:

```ts
const tools = commandGroup({
  name: "tools",
  description: "Useful tools",
  prefix: { aliases: ["t"] },
  children: [slashTool, prefixTool, sharedTool],
});
```

Discord permits one subcommand group below an application command root. Prefix-only branches can be deeper because they do not use Discord's application command shape.

Put shared access rules and middleware on a group. Context menu commands cannot be placed in a group.

## Add context menu commands

Use `userCommand()` or `messageCommand()`. Discord supplies the selected target, so these commands have no options or description.

```ts
const inspectUser = userCommand({
  name: "Inspect User",
  async run(context) {
    await context.reply(`Selected <@${context.target.id}>.`);
  },
});

const saveMessage = messageCommand({
  name: "Save Message",
  async run(context) {
    await archive.save(context.target.id, context.target.raw);
    await context.reply("Saved.");
  },
});
```

`UserCommandContext.target` contains the resolved `User`, the raw user payload, and guild member data when Discord provides it.

`MessageCommandContext.target.raw` is Discord's partial message payload. `target.message` is present when that payload contains enough data to build a `Message` structure.

## Control access

Place access rules under `access`:

```ts
const lockdown = command({
  name: "lockdown",
  description: "Lock the current channel",
  access: {
    guildOnly: true,
    userPermissions: [PermissionFlags.ManageGuild],
    botPermissions: [PermissionFlags.ManageChannels],
  },
  async run(context) {
    await lockChannel(context.channelId!);
    await context.reply("Channel locked.");
  },
});
```

Available rules are:

- `guildOnly`
- `ownerOnly`
- `userPermissions`
- `botPermissions`
- `guards`

A guard may allow the request, return `false`, or return a reason:

```ts
const paidPlan = (plans: PlanService): CommandGuard =>
  async (context) =>
    (await plans.has(context.userId)) || {
      allowed: false,
      reason: "This command needs a paid plan.",
    };
```

The manager checks group and command access in path order. It then runs global guards, followed by the guards on those definitions. Access guards also run for autocomplete and component listeners.

When a handler finds an expected input problem, throw `CommandRejection`
instead of a plain error:

```ts
if (ticket.closedAt !== undefined) {
  throw new CommandRejection(
    "invalid_input",
    "That ticket is already closed.",
    { ticketId: ticket.id },
  );
}
```

The manager returns a `rejected` result and sends the configured rejection
text. It does not report the condition as a framework failure.

## Wrap execution with middleware

Middleware runs around command handlers:

```ts
const timing: CommandMiddleware = async (context, next) => {
  const startedAt = performance.now();

  try {
    await next();
  } finally {
    console.log(
      context.path.join(" "),
      performance.now() - startedAt,
    );
  }
};
```

Middleware runs from the command manager through each group to the command.
Call `next()` once to continue. Return without calling it to stop the chain.
The manager waits for downstream work, but use `await next()` when code after
it must run after the handler. Middleware that stops an interaction command
must send the final response itself.

Calling `next()` twice or after the middleware has returned throws
`MiddlewareError`. Middleware applies to command execution, not autocomplete
or component listeners.

Because `next()` is a promise, middleware may catch a downstream error and
recover. If it does, the middleware must still complete the interaction
response.

## Add a rate limit

Add a bounded rate limit to a command:

```ts
rateLimit: {
  limit: 3,
  windowMs: 10_000,
  scope: "user",
}
```

Scopes are `user`, `channel`, `guild`, and `global`. The default is `user`. Supply a shared `CooldownStore` in the command manager options when several processes must enforce one atomic limit.

## Add autocomplete to one option

Autocomplete belongs to the option it completes:

```ts
const search = command({
  name: "search",
  description: "Search cities",
  options: {
    country: option.string({
      description: "Country code",
      required: true,
    }),
    city: option.string({
      description: "City name",
      required: true,
      autocomplete(context) {
        const query = context.focused.value.toLowerCase();
        const country = context.options.country;
        if (typeof country !== "string") return [];

        return cities
          .filter((city) => city.country === country)
          .filter((city) => city.name.toLowerCase().startsWith(query))
          .slice(0, 25)
          .map((city) => ({
            name: city.name,
            value: city.id,
          }));
      },
    }),
  },
  async run(context) {
    await context.reply(`Selected ${context.options.city}.`);
  },
});
```

String, integer, and number options support autocomplete. Do not combine `choices` and `autocomplete` on one option. Prefix-only commands cannot use autocomplete.

`context.focused.value` has the focused option's string or number type.
`context.options` contains the values Discord has sent so far, including the
focused option. It uses a broad resolved-value record, so narrow values as the
example does.

`context.signal` aborts when the configured autocomplete deadline expires.
Pass it to cancellable database or network work. Eunia sends an empty choice
list when the deadline wins. It also checks the choice count, name length, and
value type before responding.

## Add component and modal listeners

Create listener definitions, place them in the command's `listeners` map, and build components through `context.listeners`:

```ts
const choose = onButton(async (context) => {
  const choice = context.args[0];
  if (choice === undefined) {
    throw new CommandRejection(
      "invalid_input",
      "This choice is no longer available.",
    );
  }
  await context.update(`Selected ${choice}.`);
});

const confirm = command({
  name: "confirm",
  description: "Ask for confirmation",
  listeners: { choose },
  async run(context) {
    const button = context.listeners.choose.button(
      { label: "Confirm" },
      "ticket:42",
    );

    await context.reply({
      content: "Continue?",
      components: [
        {
          type: types.ComponentType.ActionRow,
          components: [button],
        },
      ],
    });
  },
});
```

The same pattern applies to `onSelect()` and `onModal()`.

### Open a modal

Build a modal through its listener handle, then open it with `context.modal()`:

```ts
const editModal = {
  title: "Edit record",
  components: [{
    type: types.ComponentType.ActionRow,
    components: [{
      type: types.ComponentType.TextInput,
      custom_id: "title",
      label: "Title",
      style: types.TextInputStyle.Short,
    }],
  }],
} satisfies ListenerModalInput;

const edit = onModal(async (context) => {
  const title = context.interaction.textField("title");
  await context.reply(
    title === undefined ? "No title was submitted." : `Saved ${title}.`,
  );
});

const editRecord = command({
  name: "edit",
  description: "Edit a record",
  listeners: { edit },
  async run(context) {
    await context.modal(
      context.listeners.edit.modal(editModal, "record-42"),
    );
  },
});
```

Slash, user, and message command contexts expose `modal()`. A prefix context
does not. Narrow `context.kind` before opening a modal from a dual-route
command.

Button and select listeners expose the same response method. Their listener
builders take the next listener's name:

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

Modal submit listeners cannot open another modal.

`context.modal()` shares the response queue with `reply()`, `update()`, and
`defer()`. Concurrent response calls run in call order instead of racing to
claim the interaction. The modal call rejects with a clear error if an
earlier response has already claimed it.

Inside a listener, `context.listeners` provides named builders for the next
step:

```ts
const nextButton = context.listeners.button(
  "choose",
  { label: "Choose again" },
  "ticket:43",
);
```

Eunia derives a compact custom ID from the full command path, listener name, and listener kind. Arguments may contain colons and other valid Unicode. The complete ID must fit Discord's 100-character limit. Moving or renaming the command or listener changes the route, so old components will no longer match.

Listeners inherit their command and group access rules by default. Add stricter listener access through the second argument:

```ts
const limitedRemove = onButton(handleRemove, {
  access: {
    userPermissions: [PermissionFlags.ManageMessages],
  },
});
```

Use `inheritAccess: false` only when the listener is intentionally more public than the command that created it:

```ts
const publicDetails = onButton(showDetails, {
  inheritAccess: false,
});
```

Global guards still run when inherited command access is disabled.

Listeners do not run command middleware or reuse the command's rate limit.
Put a separate limit on the listener when needed:

```ts
const remove = onButton(handleRemove, {
  rateLimit: {
    limit: 1,
    windowMs: 5_000,
  },
});
```

Listeners can also defer slow access checks or handlers:

```ts
const save = onButton(handleSave, {
  autoDefer: { afterMs: 1_500 },
});
```

Buttons and selects defer a source message update and cannot set ephemeral
visibility. A modal may set it only when the modal submit has no source
message. If the modal came from a component message, its defer is also an
update and `ephemeral: true` is invalid.

A listener must call `reply()`, `update()`, or `defer()`, or open a modal from
a button or select. After a deferred button or select, `update()` edits the
source message and `reply()` sends a followup. A modal that defers a new
message must still finish with `reply()` or `update()`. Returning without an
acknowledgement is reported as a failure.

## Reply and defer safely

The first `context.reply()` answers an interaction. Later calls send followups:

```ts
await context.reply("Starting.");
await context.reply("Finished.");
```

Call `context.defer()` when work may take longer than Discord's response window:

```ts
await context.defer({ ephemeral: true });
const report = await buildReport();
await context.reply({
  content: report,
  flags: types.MessageFlags.Ephemeral,
});
```

For a command interaction, the first reply after a defer edits the original
response. Later replies are followups. Listener update defers follow the
lifecycle described in the listener section above.

Eunia serializes `reply()`, `defer()`, `modal()`, and listener `update()` calls
in call order, so only one claims the initial response. Prefer the context
methods when several parts of a handler may respond.

Discord fixes response visibility when an interaction is deferred. A reply that explicitly requests different visibility throws `ReplyVisibilityMismatchError`. Keep the same ephemeral flag, or omit the flag and let the deferred response keep its visibility.

Automatic deferral uses the same rules:

```ts
autoDefer: {
  afterMs: 2_000,
  ephemeral: true,
}
```

You can also set `autoDefer: true` for a public defer after two seconds. If the
interaction is already claimed when the timer fires, the defer safely does
nothing. Eunia clears the timer when command handling finishes.

Call `modal()` before automatic deferral fires. If the modal opens first, the
timer safely does nothing. If the defer claims the interaction first, the
modal call rejects because Discord no longer allows a modal response.

Deferral only buys more time. Every interaction command must finish its
response, normally through `context.reply()`. Returning without responding,
or returning after only a defer, is reported as a command execution error.
Prefix commands do not have an interaction acknowledgement requirement.

Prefix replies use the source message and ignore the ephemeral flag.

## Enable prefix handling

Prefix handling is off by default. Configure a string, a list, or an asynchronous resolver:

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

The defaults ignore bot messages and compare command names without case
sensitivity. Set `caseSensitive: true` to require exact case and allow
case-distinct names or aliases to coexist.

Static prefixes must be non-empty strings. A static array must contain at
least one prefix unless `allowMention` is enabled. An asynchronous resolver
may return an empty array, `null`, or `undefined` to skip one message. Other
resolver values fail handling instead of being silently ignored.

Prefix arguments support quotes, escapes, booleans, numbers, Discord IDs,
mentions, attachments, and a final rest-of-line string:

```ts
text: option.string({
  description: "Text to send",
  prefix: { rest: true },
})
```

A rest option must be last. Enable the Message Content intent in Discord's developer portal and in the client.

## Register commands

Pass definitions to the client:

```ts
const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: {
    commands: [status, tools, inspectUser],
  },
});
```

You can also register definitions before startup:

```ts
client.commands.register(help, diagnostics);
await client.start();
```

Registration closes after the manager handles a recognized command or starts
a non-empty publish. An ignored interaction does not close registration.

## Publish application commands

Publish to one development server while commands are changing:

```ts
await client.commands.publish({
  scope: "guild",
  guildId,
});
```

Publish globally for production:

```ts
await client.commands.publish({ scope: "global" });
```

The target is always required. Publishing uses Discord's bulk overwrite
endpoint and replaces every application command in that scope. Prefix-only
definitions are not included.

`publish()` refuses to send an empty application command list. Clear a scope
only through the explicit method:

```ts
await client.commands.clearPublishedCommands({
  scope: "guild",
  guildId,
});
```

That call removes every published application command in the selected scope.

## Choose who owns command routing

The client handles command interactions and prefix messages automatically.
It starts that work before emitting `interactionCreate` or `messageCreate`, so
listeners for those events should observe a framework-owned command, not
answer or route it again.

Set `commands.autoHandle: false` when your code or another router should own
dispatch:

```ts
const client = new Client({
  token,
  intents,
  commands: {
    commands,
    prefix: "!",
    autoHandle: false,
  },
});

client.on("interactionCreate", async (interaction) => {
  await client.handleCommand(interaction);
});

client.on("messageCreate", async (message) => {
  await client.handleCommand(message);
});
```

Call `handleCommand(source)` once for each source you give the framework. It
emits `commandResult` for every non-ignored result. Manual ownership does not
change registration or `publishOnStart`.

## Handle results and errors

Expected rejections include cooldowns, invalid input, guards, and missing permissions. Unexpected failures emit `commandError`:

```ts
client.on("commandError", (error, context) => {
  console.error(
    context?.path.join(" ") ?? "command",
    error.cause,
  );
});

client.on("commandResult", (result) => {
  if (result.status === "rejected") {
    console.log(result.rejection.code);
  }
});
```

Change common rejection text through `commands.messages`.

For unexpected failures, Eunia starts the user-facing error response before
it waits for `commandError` telemetry. A slow error listener does not delay
the first response.

See the [command API reference](../../reference/api/commands/) for signatures and complete field lists.
