---
title: Commands
description: Find command definitions, options, contexts, listeners, access rules, middleware, manager methods, and errors.
---

The command API uses immutable definitions. Pick the definition function that matches how people invoke the command, then register the returned value with `CommandManager`.

## Choose a definition

| Need | Function |
| --- | --- |
| Chat input command | [`command()`](./definitions/#command) |
| Prefix-only command | [`prefixCommand()`](./definitions/#prefixcommand) |
| User context menu command | [`userCommand()`](./definitions/#usercommand) |
| Message context menu command | [`messageCommand()`](./definitions/#messagecommand) |
| Grouped chat input or prefix routes | [`commandGroup()`](./definitions/#commandgroup) |

`command()` is slash-only unless its `prefix` field enables prefix routing. A group derives its application and prefix routes from its children.

Use one dual-route `command()` when both routes share the same options,
policies, and behavior. Use separate `command()` and `prefixCommand()`
definitions when either route needs a different contract. Separate
application and prefix roots may have the same name.

## Reference pages

| Page | Use it to |
| --- | --- |
| [Definitions and routes](./definitions/) | Create commands, groups, prefix exposure, and Discord registration settings. |
| [Options and contexts](./options-and-contexts/) | Define typed options, handle autocomplete, read context values, and respond. |
| [Listeners](./listeners/) | Build buttons, selects, and modals tied to a command. |
| [Access and middleware](./access-and-middleware/) | Apply permissions, guards, middleware, and rate limits. |
| [Manager and errors](./manager-and-errors/) | Register, handle, publish, clear, and inspect command outcomes. |

## API lookup

| Symbol | Reference |
| --- | --- |
| `command()` | [Definition, fields, return type, and errors](./definitions/#command) |
| `prefixCommand()` | [Prefix-only rules and example](./definitions/#prefixcommand) |
| `userCommand()` | [User target and context](./definitions/#usercommand) |
| `messageCommand()` | [Message target and context](./definitions/#messagecommand) |
| `commandGroup()` | [Route derivation and nesting rules](./definitions/#commandgroup) |
| `option.*()` | [Factory signatures and config fields](./options-and-contexts/#option-factory-lookup) |
| `onButton()`, `onSelect()`, `onModal()` | [Listener signatures and lifecycle](./listeners/#listener-factory-lookup) |
| `CommandManager.register()` | [Registration behavior and errors](./manager-and-errors/#commandmanagerregister) |
| `CommandManager.handle()` | [Permission resolver and result types](./manager-and-errors/#commandmanagerhandle) |
| `CommandManager.publish()` | [Required targets and overwrite behavior](./manager-and-errors/#commandmanagerpublish) |
| `CommandManager.clearPublishedCommands()` | [Explicit scope clearing](./manager-and-errors/#commandmanagerclearpublishedcommands) |
| `tokenizePrefix()` | [Token rules and errors](./manager-and-errors/#tokenizeprefix) |
| `MemoryCooldownStore` | [Constructor, methods, and limits](./access-and-middleware/#memorycooldownstore) |

## Common path

1. Create a definition with one of the definition functions.
2. Put options and listeners in named maps on that definition.
3. Capture application services in the handler closure.
4. Register the definition with `CommandManager.register()`.
5. Publish application commands to an explicit global or guild target with `CommandManager.publish()`.

Command contexts do not expose the command host or client. This keeps a command's dependencies explicit in the closure that creates it.

`publish()` refuses an empty application command list. Use
`clearPublishedCommands(target)` when clearing a Discord command scope is
intentional.
