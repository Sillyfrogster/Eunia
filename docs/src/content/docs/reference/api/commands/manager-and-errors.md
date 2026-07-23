---
title: Command manager and errors
description: Register, handle, publish, and clear commands and inspect command outcomes.
---

`CommandManager` owns command registration and dispatch. `Client` creates one
at `client.commands`, or an application can construct one with a
`CommandHost`.

## `CommandManager`

```ts
new CommandManager(
  host: CommandHost,
  options?: CommandManagerOptions,
);
```

### `CommandHost`

```ts
interface CommandHost {
  readonly applicationId: string;
  readonly botId: string;
  readonly ownerIds:
    | readonly string[]
    | ReadonlySet<string>;
  readonly rest: CommandRest;
  reportCommandError(
    error: CommandError,
    context?: CommandErrorContext,
  ): Awaitable<void>;
}
```

The host supplies identity, command REST publishing, owner IDs, and unexpected
error reporting.

### `CommandManagerOptions`

| Field | Type | Purpose |
| --- | --- | --- |
| `prefix` | `PrefixResolver \| PrefixOptions` | Enable and configure prefix routing. |
| `middleware` | `readonly CommandMiddleware[]` | Manager-level command middleware. |
| `guards` | `readonly CommandGuard[]` | Manager-level access guards. |
| `cooldownStore` | `CooldownStore` | Replace the in-memory cooldown store. |
| `autocompleteTimeoutMs` | `number` | Autocomplete deadline from 0 through 2,500 ms. |
| `messages` | `CommandMessages` | Replace rejection and failure response text. |

The constructor throws `TypeError` for an invalid host, middleware list,
guard list, prefix configuration, or command message configuration. It throws
`RangeError` for an invalid static prefix or an autocomplete deadline outside
the accepted range.

## `CommandManager.register()`

```ts
register(
  ...commands: readonly CommandNode[]
): this;
```

### Parameters

`commands` contains root command or group definitions created with the
definition functions. Application and prefix route collisions are checked
separately.

### Returns

The same manager, so calls may be chained.

```ts
manager.register(status, tools).register(inspectUser);
```

### Behavior

The whole call is atomic. If any definition fails validation, none of that
call's definitions are registered.

Registration closes when the manager starts a non-empty publish or handles a
recognized command, autocomplete request, or listener. Ignored input does not
close registration.

### Errors

- `RegistrationFrozenError` after registration closes;
- `CommandValidationError` for an invalid definition or route tree;
- `DuplicateCommandError` for a repeated root name or prefix alias.

## `CommandManager.handle()`

```ts
handle(
  source: Interaction | Message,
  options?: CommandHandleOptions,
): Promise<CommandHandleResult>;
```

### Parameters

`source` may be a command interaction, autocomplete interaction, component or
modal interaction, or prefix message.

Permission values may be supplied directly or loaded on demand:

```ts
interface CommandHandleOptions {
  readonly userPermissions?: PermissionInput;
  readonly botPermissions?: PermissionInput;
  readonly resolvePermissions?: (
    needs: CommandPermissionNeeds,
    signal?: AbortSignal,
  ) => Awaitable<CommandPermissionData>;
}

interface CommandPermissionNeeds {
  readonly user: boolean;
  readonly bot: boolean;
}

interface CommandPermissionData {
  readonly userPermissions?: PermissionInput;
  readonly botPermissions?: PermissionInput;
}
```

Direct values take precedence. The resolver is called only when an access
check needs a subject not supplied directly. Any manager or access guard asks
for both subjects because a guard may inspect either permission value.

Autocomplete passes its deadline `AbortSignal` to the resolver. Other command
paths may omit the signal.

### Returns

```ts
type CommandHandleResult =
  | {
      readonly status: "ignored";
    }
  | {
      readonly status: "completed";
      readonly path: readonly string[];
    }
  | {
      readonly status: "autocomplete";
      readonly path: readonly string[];
    }
  | {
      readonly status: "rejected";
      readonly path: readonly string[];
      readonly rejection: CommandRejection;
    }
  | {
      readonly status: "failed";
      readonly path: readonly string[];
      readonly error: CommandError;
    };
```

`ignored` means the manager did not own the route. `rejected` is an expected
access, cooldown, availability, or input result. `failed` is an unexpected
execution, autocomplete, response, or cooldown store failure.

Failures are sent to `host.reportCommandError()`. Rejections are not reported
as framework errors. A failure while sending rejection text is reported
without replacing the `rejected` result.

Eunia starts the user-facing failure response before it waits for
`reportCommandError()`. Slow telemetry therefore does not delay the first
error response.

## `CommandManager.publish()`

```ts
publish<T = unknown>(
  target: CommandPublishTarget,
): Promise<CommandPublishResult<T>>;
```

### Parameters

The target is required and explicit:

```ts
type CommandPublishTarget =
  | {
      readonly scope: "global";
    }
  | {
      readonly scope: "guild";
      readonly guildId: string;
    };
```

```ts
await manager.publish({ scope: "global" });

await manager.publish({
  scope: "guild",
  guildId: developmentGuildId,
});
```

There is no default global target.

### Returns

```ts
type CommandPublishResult<T = unknown> =
  | {
      readonly target: "global";
      readonly commands: T;
    }
  | {
      readonly target: "guild";
      readonly guildId: string;
      readonly commands: T;
    };
```

`commands` is the REST response from Discord.

### Behavior

Publishing uses Discord's bulk overwrite endpoint. It replaces every
application command in the selected scope. Prefix-only roots and children are
not included.

A non-empty publish closes registration before the REST request starts.
Registration stays closed if that request fails. Guild serialization omits
`contexts` and `integrationTypes`.

### Errors

- `TypeError` for a missing or invalid target, empty application ID, or empty
  guild ID;
- `EmptyCommandPublishError` when no application command is registered;
- the REST error when Discord rejects or cannot complete the request.

The empty publish check prevents an accidental bulk clear. Use
`clearPublishedCommands()` when clearing is intentional.

## `CommandManager.clearPublishedCommands()`

```ts
clearPublishedCommands<T = unknown>(
  target: CommandPublishTarget,
): Promise<CommandPublishResult<T>>;
```

### Parameters

`target` is the same required global or guild target used by `publish()`.

### Returns

The same result union as `publish()`.

### Behavior

This method bulk-overwrites the chosen Discord scope with an empty array:

```ts
await manager.clearPublishedCommands({
  scope: "guild",
  guildId: retiredGuildId,
});
```

This is destructive for that scope. It does not require registered
application commands and does not freeze local registration.

### Errors

It throws `TypeError` for an invalid target or application ID. REST failures
propagate.

## Manager properties

### `commands`

```ts
get commands(): readonly CommandNode[];
```

Returns the registered root definitions as a frozen array.

### `isFrozen`

```ts
get isFrozen(): boolean;
```

Returns `true` when further registration is closed.

## Prefix routing

```ts
interface PrefixOptions {
  readonly prefixes: PrefixResolver;
  readonly allowMention?: boolean;
  readonly caseSensitive?: boolean;
  readonly ignoreBots?: boolean;
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `allowMention` | `false` | Accept `<@botId>` and `<@!botId>` prefixes. |
| `caseSensitive` | `false` | Require exact route name and alias case when true. |
| `ignoreBots` | `true` | Ignore messages from bot users. |

```ts
type PrefixResolver =
  | string
  | readonly string[]
  | (
      message: Message,
    ) => Awaitable<
      | string
      | readonly string[]
      | null
      | undefined
    >;
```

A dynamic resolver may return an empty array, `null`, or `undefined` to disable
prefix handling for one message. Every string in a static prefix setting must
be non-empty. A static array must contain at least one prefix unless
`allowMention` is `true`. Static arrays are copied when the manager is
created.

Invalid prefix option booleans or static prefix values throw `TypeError` or
`RangeError` in the manager constructor. A dynamic resolver that returns
another value causes a failed handle result. Mention prefixes need a non-empty
`CommandHost.botId`.

With `caseSensitive: false`, names and aliases that differ only by case
collide. With `true`, they may coexist and input must match exact case.

### `tokenizePrefix()`

```ts
function tokenizePrefix(
  content: string,
): readonly string[];
```

The tokenizer supports single and double quotes, backslash escapes, and empty
quoted values:

```ts
tokenizePrefix(
  `echo "two words" four\\ five ""`,
);
// ["echo", "two words", "four five", ""]
```

It throws `CommandRejection` with code `invalid_input` for an unclosed quote
or unfinished escape.

## `CommandMessages`

```ts
interface CommandMessages {
  readonly guildOnly?: CommandMessageFactory;
  readonly ownerOnly?: CommandMessageFactory;
  readonly userPermissions?: CommandMessageFactory;
  readonly botPermissions?: CommandMessageFactory;
  readonly permissionDataUnavailable?: CommandMessageFactory;
  readonly cooldown?: CommandMessageFactory;
  readonly guard?: CommandMessageFactory;
  readonly invalidInput?: CommandMessageFactory;
  readonly unavailable?: CommandMessageFactory;
  readonly error?: string;
}

type CommandMessageFactory =
  | string
  | (
      rejection: CommandRejection,
    ) => string;
```

Pass these under `CommandManagerOptions.messages`. Rejection responses are
private for command and listener interactions and normal replies for prefix
messages. Autocomplete rejections send an empty choice list. `error` is the
private text Eunia tries to send after an unexpected interaction failure.

`messages` must be an object. `error` must be a string. Every rejection field
must be a string or a function. A function must return a string. Invalid
configuration throws `TypeError` in the manager constructor. If a function
throws or returns another value at runtime, Eunia sends the general error text
and reports a response failure.

## Errors

### `CommandError`

```ts
class CommandError extends Error {
  readonly code: CommandErrorCode;
}
```

| Error | Code | Meaning |
| --- | --- | --- |
| `CommandValidationError` | `invalid_definition` | A definition cannot be registered or serialized. |
| `DuplicateCommandError` | `duplicate_command` | A route name or alias is already registered. |
| `RegistrationFrozenError` | `registration_frozen` | Registration has closed. |
| `EmptyCommandPublishError` | `empty_publish` | `publish()` has no application commands. |
| `MiddlewareError` | `middleware_next_called_twice` | Middleware used `next()` more than once or too late. |
| `CommandExecutionError` | `execution_failed` | Command or listener execution failed. |
| `AutocompleteError` | `autocomplete_failed` | Autocomplete failed. |
| `CooldownStoreError` | `cooldown_store_failed` | Cooldown storage failed or returned invalid data. |

`CommandExecutionError`, `AutocompleteError`, and `CooldownStoreError`
preserve the original error as `cause`.

### `CommandRejection`

```ts
class CommandRejection extends Error {
  constructor(
    code: CommandRejectionCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  );

  readonly code: CommandRejectionCode;
  readonly details: Readonly<Record<string, unknown>>;
}
```

Codes are:

- `guild_only`
- `owner_only`
- `missing_user_permissions`
- `missing_bot_permissions`
- `permission_data_unavailable`
- `cooldown`
- `guard`
- `invalid_input`
- `command_unavailable`

Throw this error from a handler, middleware, or listener for an expected
rejection:

```ts
throw new CommandRejection(
  "invalid_input",
  "That record no longer exists.",
  { recordId },
);
```

The manager returns `rejected` and does not report it as an unexpected
failure. Autocomplete sends an empty list for a rejection.

### `ReplyVisibilityMismatchError`

`context.reply()` throws this error when a deferred message explicitly
requests different visibility. It is not a `CommandError`. If it escapes a
handler, command execution wraps it in `CommandExecutionError`.

See [reply state and visibility](../options-and-contexts/#reply-state-and-visibility).

## Related pages

- [Definitions and routes](../definitions/)
- [Options and contexts](../options-and-contexts/)
- [Listeners](../listeners/)
- [Access and middleware](../access-and-middleware/)
