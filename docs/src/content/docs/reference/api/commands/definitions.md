---
title: Command definitions and routes
description: Create chat input, prefix, context menu, and grouped command definitions.
---

Command definitions are immutable values. Creating one does not register or
publish it. Pass root definitions to `CommandManager.register()` or to
`ClientOptions.commands.commands`.

## Choose a definition

| Route | Function | Handler context |
| --- | --- | --- |
| Discord chat input | [`command()`](#command) | `SlashCommandContext` |
| Discord chat input and prefix | [`command()`](#command) with `prefix` | `SlashCommandContext \| PrefixCommandContext` |
| Prefix only | [`prefixCommand()`](#prefixcommand) | `PrefixCommandContext` |
| User context menu | [`userCommand()`](#usercommand) | `UserCommandContext` |
| Message context menu | [`messageCommand()`](#messagecommand) | `MessageCommandContext` |

Use one `command()` definition for two routes when both routes have the same
name, options, access rules, rate limit, listeners, and behavior. Narrow
`context.kind` only where the route-specific response differs.

Use separate `command()` and `prefixCommand()` definitions when either route
needs a different contract or different behavior. They may have the same
name because application and prefix roots are registered separately.

## `command()`

Creates a Discord chat input command. The `prefix` field can expose the same
definition through prefix routing.

```ts
function command<
  const O extends CommandOptionMap = {},
  const L extends CommandListenerMap = {},
  const P extends PrefixExposure | undefined = undefined,
>(
  input: ChatCommandInput<O, L, P>,
): ChatCommand<O, L, P>;
```

### Parameters

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Chat input name and optional prefix name. |
| `description` | `string` | Yes | Discord command description. |
| `run` | `(context: ChatCommandContext<O, L, P>) => Awaitable<void>` | Yes | Command handler. |
| `options` | `O` | No | Named option definitions. |
| `listeners` | `L` | No | Named button, select, and modal listeners. |
| `prefix` | `true \| PrefixCommandSettings` | No | Also add a prefix route. |
| `access` | `CommandAccess` | No | Built-in access rules and guards. |
| `middleware` | `readonly CommandMiddleware[]` | No | Command middleware. |
| `rateLimit` | `CommandRateLimit` | No | Command rate limit. |
| `autoDefer` | `boolean \| AutoDeferOptions` | No | Defer a slow interaction. |
| `registration` | `ChatInputCommandSettings` | No | Discord registration fields. |
| `meta` | `Readonly<Record<string, unknown>>` | No | Application data stored with the definition. |

`prefix: true` uses the command name. The object form also accepts aliases:

```ts
interface PrefixCommandSettings {
  readonly aliases?: readonly string[];
}
```

### Returns

An immutable `ChatCommand<O, L, P>`. The option, listener, and prefix types
remain available to the handler.

### Errors

`command()` does not publish the definition. It throws `TypeError` when
untyped input supplies malformed prefix settings, prefix aliases, or
automatic defer settings.

`CommandManager.register()` throws `CommandValidationError` for invalid names,
descriptions, options, listeners, access rules, middleware, rate limits,
automatic defer values, or registration settings.

A dual-route definition must satisfy Discord's application command rules.
This includes Discord name, description, option count, choice count, and
string length limits. Use `prefixCommand()` when those rules should not apply
to the prefix route.

### Example

```ts
const greet = command({
  name: "greet",
  description: "Greet another user",
  prefix: { aliases: ["hello"] },
  options: {
    user: option.user({
      description: "The user to greet",
      required: true,
    }),
  },
  async run(context) {
    if (context.kind === "slash") {
      await context.reply(`Hello <@${context.options.user.id}>!`);
      return;
    }

    await context.reply(`Hello <@${context.options.user.id}> from chat!`);
  },
});
```

## `prefixCommand()`

Creates a command that is only available through prefix routing.

```ts
function prefixCommand<
  const O extends CommandOptionMap = {},
  const L extends CommandListenerMap = {},
>(
  input: PrefixCommandInput<O, L>,
): PrefixCommand<O, L>;
```

### Parameters

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Prefix route name. |
| `description` | `string` | Yes | Local description kept on the definition. |
| `run` | `(context: PrefixCommandContext<O, L, PrefixCommand<O, L>>) => Awaitable<void>` | Yes | Command handler. |
| `options` | `O` | No | Named prefix option definitions. |
| `listeners` | `L` | No | Named button, select, and modal listeners. |
| `aliases` | `readonly string[]` | No | Other names for the same prefix route. |
| `access` | `CommandAccess` | No | Built-in access rules and guards. |
| `middleware` | `readonly CommandMiddleware[]` | No | Command middleware. |
| `rateLimit` | `CommandRateLimit` | No | Command rate limit. |
| `meta` | `Readonly<Record<string, unknown>>` | No | Application data stored with the definition. |

Prefix-only definitions do not accept Discord registration settings or
command automatic deferral.

### Returns

An immutable `PrefixCommand<O, L>`. It is never included in a Discord
application command publish.

### Prefix-only rules

Prefix-only routes are not capped by Discord's limits for command name length,
description length, option count, choice count, or string length. Names and
aliases must still be non-empty tokens, and the description cannot be empty.
Required options must come before optional options.

These Discord-only option fields are rejected because they cannot affect a
prefix message:

- autocomplete;
- option name and description localizations;
- choice name localizations;
- channel type filters.

An option description may be omitted. Eunia then uses the option name as its
local description.

### Errors

`prefixCommand()` throws `TypeError` when untyped input supplies an alias list
that is not an array of strings.

`CommandManager.register()` throws `CommandValidationError` for an invalid
name, alias, option, listener, access rule, middleware, or rate limit.

### Example

```ts
const echo = prefixCommand({
  name: "EchoText",
  description: "Repeat a message",
  aliases: ["say"],
  options: {
    text: option.string({
      required: true,
      prefix: { rest: true },
    }),
  },
  async run(context) {
    await context.reply(context.options.text);
  },
});
```

## `userCommand()`

Creates a user context menu command.

```ts
function userCommand<
  const L extends CommandListenerMap = {},
>(
  input: UserCommandInput<L>,
): UserCommand<L>;
```

### Parameters

`UserCommandInput` accepts `name`, `run`, `listeners`, `access`,
`middleware`, `rateLimit`, `autoDefer`, `registration`, and `meta`.

It does not accept options or a description.

### Returns

An immutable `UserCommand<L>`. The handler receives
`UserCommandContext<L>`, whose target is:

```ts
interface UserCommandTarget {
  readonly id: string;
  readonly raw: Readonly<types.User>;
  readonly user: User;
  readonly member?: Readonly<
    Omit<types.GuildMember, "user" | "deaf" | "mute">
  >;
}
```

### Errors

`userCommand()` throws `TypeError` for malformed automatic defer settings.
`CommandManager.register()` throws `CommandValidationError` for an invalid
name, listener, access rule, middleware, rate limit, automatic deferral, or
registration setting.

### Example

```ts
const inspectUser = userCommand({
  name: "Inspect User",
  async run(context) {
    await context.reply(`Selected <@${context.target.id}>.`);
  },
});
```

## `messageCommand()`

Creates a message context menu command.

```ts
function messageCommand<
  const L extends CommandListenerMap = {},
>(
  input: MessageCommandInput<L>,
): MessageCommand<L>;
```

### Parameters

`MessageCommandInput` accepts the same fields as `UserCommandInput`.

### Returns

An immutable `MessageCommand<L>`. The handler receives
`MessageCommandContext<L>`, whose target is:

```ts
interface MessageCommandTarget {
  readonly id: string;
  readonly raw: Readonly<Partial<types.Message>>;
  readonly message?: Message;
}
```

`target.message` is present when Discord supplied enough data to build a
`Message` structure.

### Errors

`messageCommand()` throws `TypeError` for malformed automatic defer settings.
`CommandManager.register()` throws `CommandValidationError` for the same
definition errors as `userCommand()`.

### Example

```ts
const saveMessage = messageCommand({
  name: "Save Message",
  async run(context) {
    await archive.save(context.target.id, context.target.raw);
    await context.reply("Saved.");
  },
});
```

Context menu commands are root commands. They cannot be placed in a group.

## `commandGroup()`

Groups chat input and prefix routes.

```ts
function commandGroup(
  input: CommandGroupInput,
): CommandGroup;
```

### Parameters

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Group route name. |
| `description` | `string` | Yes | Application or local prefix description. |
| `children` | `readonly GroupableCommandNode[]` | Yes | Chat commands, prefix commands, or groups. |
| `prefix` | `PrefixCommandSettings` | No | Aliases for the prefix route. |
| `access` | `CommandAccess` | No | Access inherited by command descendants. |
| `middleware` | `readonly CommandMiddleware[]` | No | Middleware wrapped around command descendants. |
| `registration` | `ChatInputCommandSettings` | No | Discord registration fields. |
| `meta` | `Readonly<Record<string, unknown>>` | No | Application data stored with the definition. |

The children determine each route. A group publishes only children with a
chat input route and matches only children with a prefix route. The group's
`prefix` field adds aliases to an existing prefix route. It does not turn
slash-only children into prefix commands.

### Returns

An immutable `CommandGroup`.

### Errors

`commandGroup()` throws `TypeError` when untyped input supplies malformed
prefix settings or aliases.

`CommandManager.register()` throws `CommandValidationError` for:

- an empty group;
- a context menu child;
- repeated sibling names or aliases;
- application command nesting beyond one subcommand group;
- more than 25 published children;
- registration settings without an application route;
- prefix settings without a prefix route.

Discord application commands support a root, one subcommand group, and a
command. Prefix-only branches may be deeper and do not use Discord's child or
text limits.

### Example

```ts
const tools = commandGroup({
  name: "tools",
  description: "Useful tools",
  prefix: { aliases: ["t"] },
  children: [slashTool, prefixTool, sharedTool],
});
```

## Route identity and case

Application command names follow Discord's case rules. Prefix matching uses
`CommandManagerOptions.prefix.caseSensitive`.

With the default `false`, names and aliases that differ only by case collide,
and input matches without case sensitivity. With `true`, matching uses exact
case and case-distinct names or aliases may coexist.

Application and prefix root identities are separate. For example, a
slash-only `command({ name: "status" })` and a
`prefixCommand({ name: "status" })` may both be registered.

## Discord registration settings

```ts
interface ApplicationCommandSettings {
  readonly nameLocalizations?: Localizations;
  readonly defaultMemberPermissions?: PermissionInput | null;
  readonly contexts?: readonly InteractionContextType[] | null;
  readonly integrationTypes?: readonly ApplicationIntegrationType[];
  readonly nsfw?: boolean;
}

interface ChatInputCommandSettings
  extends ApplicationCommandSettings {
  readonly descriptionLocalizations?: Localizations;
}
```

Pass these fields under `registration`. User and message commands use
`ApplicationCommandSettings`. Chat input commands and groups use
`ChatInputCommandSettings`.

`defaultMemberPermissions`, `contexts`, `integrationTypes`, and `nsfw` belong
only on a published root. Nested chat input definitions may still localize
their names and descriptions. Guild publishing omits `contexts` and
`integrationTypes`.

## Related pages

- [Options and contexts](../options-and-contexts/)
- [Listeners](../listeners/)
- [Access and middleware](../access-and-middleware/)
- [Manager and errors](../manager-and-errors/)
