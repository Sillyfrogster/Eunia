---
title: Commands
description: Command classes, options, listeners, middleware, guards, cooldowns, and errors.
---

## Command

Extend `Command` for a leaf command.

```ts
abstract class Command {
  abstract readonly name: string;
  abstract readonly kind: "slash" | "prefix" | "hybrid" | "user" | "message";
  readonly description: string;
  abstract run(context: CommandContext): void | Promise<void>;
}
```

Optional fields are `aliases`, `middleware`, `guards`, `guildOnly`, `ownerOnly`, `userPermissions`, `botPermissions`, `rateLimit`, `autoDefer`, `meta`, `nameLocalizations`, `descriptionLocalizations`, `defaultMemberPermissions`, `contexts`, `integrationTypes`, and `nsfw`.

Override `autocomplete(context)` to return command choices.

Use `UserCommand` and `MessageCommand` for context menu commands. They set their own kind and use an empty description because Discord context commands do not accept descriptions or options.

## CommandGroup

`CommandGroup` requires `name`, `description`, and `children`. It accepts the shared policy and localization fields from `Command`, but has no `run`, `rateLimit`, or `autoDefer` field.

```ts
class Admin extends CommandGroup {
  readonly name = "admin";
  readonly description = "Administrative commands";
  readonly children = [Ban, Kick];
}
```

`CommandNode` is `Command | CommandGroup`. `CommandNodeClass` is a zero-argument constructor for either one.

## Options

Declare options as class fields. Read them through `context.get(field)` or test them with `context.has(field)`.

| Factory | Value |
| --- | --- |
| `option.string(config?)` | `string` |
| `option.integer(config?)` | `number` |
| `option.number(config?)` | `number` |
| `option.boolean(config?)` | `boolean` |
| `option.user(config?)` | `ResolvedUser` |
| `option.channel(config?)` | `ResolvedChannel` |
| `option.role(config?)` | `ResolvedRole` |
| `option.mentionable(config?)` | `ResolvedMentionable` |
| `option.attachment(config?)` | `ResolvedAttachment` |

All configs accept `description`, name and description localizations, and `required`. String options also accept choices, autocomplete, length limits, and prefix rest capture. Numeric options accept choices, autocomplete, and value limits. Channel options accept `channelTypes`.

## Contexts

`CommandContext` is narrowed by `kind`:

- `SlashCommandContext` has `interaction` and `defer(options?)`.
- `UserCommandContext` adds a resolved user `target` and optional guild member data.
- `MessageCommandContext` adds a partial message `target` and an optional hydrated `Message`.
- `PrefixCommandContext` has `message` and `prefix`.

All command contexts expose `command`, `groups`, `path`, `host`, user/channel/guild IDs, resolved permissions, `get`, `has`, and `reply`. Interaction command contexts also expose `interaction` and `defer`.

`AutocompleteContext` adds `focused` and its autocomplete interaction. `ListenerContext` adds the component or modal interaction, route arguments, `reply`, `update`, and `defer`.

## Component listeners

| Factory | Field method | Result |
| --- | --- | --- |
| `onButton(handler)` | `button(input?, ...args)` | Button data with a derived `custom_id` |
| `onSelect(handler)` | `select(input, ...args)` | Select data with a derived `custom_id` |
| `onModal(handler)` | `modal(input, ...args)` | Modal data with a derived `custom_id` |

Arguments are strings and cannot contain `:`. The complete custom ID cannot exceed 100 characters.

## CommandManager

```ts
new CommandManager(host: CommandHost, options?: CommandManagerOptions)
```

| Member | Purpose |
| --- | --- |
| `commands` | Registered root commands and groups. |
| `isFrozen` | Whether registration has closed. |
| `register(...commands)` | Validate and register command instances. |
| `handle(source, options?)` | Handle an interaction or message. |
| `publish(target?)` | Replace global or guild application commands. |

`CommandManagerOptions` accepts `prefix`, global `middleware`, global `guards`, a `cooldownStore`, `autocompleteTimeoutMs`, and response `messages`.

`CommandHandleResult.status` is `ignored`, `completed`, `autocomplete`, `rejected`, or `failed`. `CommandPublishTarget` selects global commands or one guild.

## Middleware and guards

```ts
type CommandMiddleware = (
  context: CommandContext,
  next: () => Promise<void>,
) => void | Promise<void>;

type CommandGuard = (
  context: CommandContext | AutocompleteContext,
) => boolean | void | CommandGuardFailure | Promise<boolean | void | CommandGuardFailure>;
```

Middleware may call `next` once. Guards may return `false` or `{ allowed: false, reason?, details? }`.

## Cooldowns

`MemoryCooldownStore` implements `CooldownStore.consume(request)`. Its options are `maxEntries` and `sweepIntervalMs`. It also exposes `size` and `clear()`.

`CommandRateLimit` has `limit`, `windowMs`, and an optional `scope`: `user`, `channel`, `guild`, or `global`.

## Errors

All command configuration and execution errors extend `CommandError` and include a `code`.

`CommandValidationError`, `DuplicateCommandError`, `RegistrationFrozenError`, `CommandOptionError`, `MiddlewareError`, `CommandExecutionError`, `AutocompleteError`, and `CooldownStoreError`.

`CommandRejection` represents an expected policy or input rejection. It includes `code` and `details`.

## Other exports

`tokenizePrefix`, `PrefixMatch`, `PrefixResolver`, `PrefixOptions`, `PrefixValue`, `AutoDeferOptions`, `CommandChoice`, `CommandGuardFailure`, `CommandHandleOptions`, `CommandHost`, `CommandMessages`, `CommandMessageFactory`, `CommandPermissionData`, `CommandPublishResult`, `CommandRest`, `CooldownRequest`, `CooldownResult`, `MemoryCooldownStoreOptions`, `FocusedOption`, `OptionAccess`, `UserCommandTarget`, `MessageCommandTarget`, all option config types, all listener field and input types, and all resolved option types.
