---
title: Command listeners
description: Define command-bound button, select, and modal routes and handle their response lifecycle.
---

Listeners keep component and modal routing beside the command that created the
UI. Put named listener fields in a command's `listeners` map. Eunia then gives
the command typed component builders in `context.listeners`.

## Listener factory lookup

```ts
function onButton(
  handler: ListenerHandler<"button">,
  options?: ListenerOptions<"button">,
): ButtonListenerField;

function onSelect(
  handler: ListenerHandler<"select">,
  options?: ListenerOptions<"select">,
): SelectListenerField;

function onModal(
  handler: ListenerHandler<"modal">,
  options?: ListenerOptions<"modal">,
): ModalListenerField;
```

Each function returns an immutable listener field. Creating a field does not
register a route. The route is prepared when its command is registered.

The factory throws `TypeError` when untyped input supplies an automatic defer
value that is neither a boolean nor an object.
`CommandManager.register()` throws `CommandValidationError` for an invalid
handler, access setting, rate limit, or automatic defer value.

## `onButton()`

The bound command handle has this method:

```ts
button(
  input?: ListenerButtonInput,
  ...args: readonly string[]
): types.ButtonComponent;
```

```ts
interface ListenerButtonInput {
  readonly id?: number;
  readonly style?:
    | ButtonStyle.Primary
    | ButtonStyle.Secondary
    | ButtonStyle.Success
    | ButtonStyle.Danger;
  readonly label?: string;
  readonly emoji?: types.ComponentEmoji;
  readonly disabled?: boolean;
}
```

The style defaults to `ButtonStyle.Primary`. Eunia supplies the component
type and `custom_id`. The optional numeric `id` is available for Components
V2.

## `onSelect()`

The bound command handle has this method:

```ts
select(
  input: ListenerSelectInput,
  ...args: readonly string[]
): types.StringSelectComponent | types.AutoSelectComponent;
```

`ListenerSelectInput` accepts a string select or Discord auto-populated
select. Eunia supplies its `custom_id`. A string select may omit `type`;
Eunia then uses `ComponentType.StringSelect`.

## `onModal()`

The bound command handle has this method:

```ts
modal(
  input: ListenerModalInput,
  ...args: readonly string[]
): types.ModalInteractionResponseData;
```

`ListenerModalInput` is Discord modal response data without `custom_id`.
Eunia supplies that ID.

### Open and handle a modal

Build the modal through its command handle, then open it through the command
context:

```ts
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
      context.listeners.edit.modal({
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
      }),
    );
  },
});
```

Opening a modal must be the initial interaction response. The call uses
the same response queue as `reply()` and `defer()`, so concurrent response
calls cannot race to claim the interaction. The promise rejects with a clear
error if an earlier response has already claimed it.

Slash, user, and message command contexts expose `modal()`. Prefix contexts
do not. A dual-route command must narrow `context.kind` before opening one.

Button and select listener contexts also expose `modal()`. Build the modal
through the listener-name builder:

```ts
const modal = context.listeners.modal(
  "edit",
  modalInput,
  "record-42",
);
await context.modal(modal);
```

Modal submit contexts cannot open another modal.

Call `modal()` before automatic deferral fires. If the modal opens first, the
timer safely does nothing. If the defer claims the interaction first,
`modal()` rejects because Discord no longer allows a modal response.

## Build a listener route

```ts
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
              { label: "Yes" },
              "yes",
            ),
            context.listeners.choose.button(
              { label: "No" },
              "no",
            ),
          ],
        },
      ],
    });
  },
});
```

The strings after the component input become `context.args` in the same
order.

## Command handles and listener builders

Command contexts receive typed handles keyed by the listener map:

```ts
context.listeners.choose.button(
  { label: "Choose" },
  "record-42",
);
```

Listener contexts receive `ListenerBuilders`. These builders can create the
next component or modal in a flow:

```ts
interface ListenerBuilders {
  button(
    listener: string,
    input?: ListenerButtonInput,
    ...args: readonly string[]
  ): types.ButtonComponent;

  select(
    listener: string,
    input: ListenerSelectInput,
    ...args: readonly string[]
  ): types.StringSelectComponent | types.AutoSelectComponent;

  modal(
    listener: string,
    input: ListenerModalInput,
    ...args: readonly string[]
  ): types.ModalInteractionResponseData;
}
```

```ts
const advance = onButton(async (context) => {
  const next = context.listeners.button(
    "advance",
    { label: "Continue" },
    "step-2",
  );

  await context.update({
    content: "Step one is complete.",
    components: [{
      type: types.ComponentType.ActionRow,
      components: [next],
    }],
  });
});
```

A listener builder throws `RangeError` when the name is missing or belongs to
a different listener kind.

## `ListenerOptions<K>`

```ts
interface ListenerOptions<K extends ListenerKind> {
  readonly inheritAccess?: boolean;
  readonly access?: CommandAccess;
  readonly autoDefer?:
    | boolean
    | (
        K extends "modal"
          ? AutoDeferOptions
          : Pick<AutoDeferOptions, "afterMs">
      );
  readonly rateLimit?: CommandRateLimit;
}
```

### `inheritAccess`

Defaults to `true`. The listener checks the access settings on every parent
group and on its command.

Set it to `false` only when the listener should be more public than the
command that created it. Manager-level guards still run.

### `access`

Adds listener-specific access rules. These run whether or not inherited
access is enabled.

### `rateLimit`

Applies a separate listener rate limit. The command's rate limit is not reused
for listener interactions.

```ts
const save = onButton(handleSave, {
  rateLimit: {
    limit: 1,
    windowMs: 5_000,
    scope: "user",
  },
});
```

### `autoDefer`

`true` defers after 2,000 milliseconds. The object form may set `afterMs` from
0 through 2,500.

Button and select listeners defer a message update, so they cannot set
ephemeral visibility. Modal listeners may set `ephemeral` when the modal
submit has no source message.

If a modal submit includes a source message, Discord also treats its defer as
a message update. Passing `ephemeral: true` then throws `RangeError`. This
also applies to modal automatic deferral, so do not configure private
automatic deferral for a modal that can be opened from a component.

A button or select listener that opens a modal must call `modal()` before its
automatic defer fires. If the modal call wins, the later defer safely does
nothing. If the defer wins, the modal call rejects.

## `ListenerContext<K>`

```ts
interface ListenerContextBase<
  K extends "button" | "select" | "modal",
> {
  readonly kind: K;
  readonly command: AnyCommand;
  readonly groups: readonly CommandGroup[];
  readonly path: readonly string[];
  readonly interaction: Interaction<K>;
  readonly listeners: ListenerBuilders;
  readonly args: readonly string[];
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  readonly userPermissions?: bigint;
  readonly botPermissions?: bigint;
  reply(input: Sendable): Promise<unknown>;
  update(input: Sendable): Promise<void>;
  readonly defer: K extends "modal"
    ? (
        options?: {
          readonly ephemeral?: boolean;
        },
      ) => Promise<boolean>
    : () => Promise<boolean>;
}

type ListenerContext<
  K extends "button" | "select" | "modal",
> = ListenerContextBase<K> & (
  K extends "button" | "select"
    ? {
        modal(
          input: types.ModalInteractionResponseData,
        ): Promise<void>;
      }
    : {}
);
```

`path` contains the command path followed by the listener name.

Only button and select contexts have `modal()`. It opens the supplied modal
as the initial interaction response. Modal submit contexts omit the method
because Discord does not allow one modal submission to open another modal.

## Response lifecycle

Use the response method that matches the result you want:

| Method | Pending button or select | Pending modal | After a deferred update |
| --- | --- | --- | --- |
| `reply(input)` | Send a new interaction message | Send a new interaction message | Send a followup |
| `update(input)` | Update the source message | Update the source message when present | Edit the source message |
| `defer()` | Defer a source message update | Defer an update when a source message exists, otherwise defer a new message | Returns `false` |
| `modal(input)` | Open a modal | Not available | Reject |

Eunia serializes `reply()`, `update()`, `defer()`, and `modal()` calls in call
order. Concurrent calls cannot race to claim the initial response. This is
safe:

```ts
await context.defer();
await context.update("Saved.");
```

For a button, select, or source-message modal, the first call defers an update
and the second edits the source message.

A listener must acknowledge its interaction. Calling `reply()`, `update()`,
opening a modal, or deferring a source message update is enough. A modal that
defers a new message must still call `reply()` or `update()` before it
returns.

Returning without an acknowledgement fails with `CommandExecutionError`.
Eunia reports the error and tries to send the configured private failure
message.

## Access and middleware inheritance

Listeners always run manager-level guards. With `inheritAccess: true`, they
also run group and command access rules and access guards.

Listeners do not run command middleware. They also do not inherit the
command's rate limit. Put listener-specific access and `rateLimit` settings on
the listener itself.

## Routes and builder errors

Eunia hashes the command type, full command path, listener name, and listener
kind into a stable route. Arguments are URI-encoded, so they may contain
colons and other valid Unicode.

Building a component or modal throws:

- `TypeError` when an argument contains invalid Unicode;
- `RangeError` when the complete `custom_id` exceeds Discord's 100-character
  limit.

Moving or renaming a command or listener changes the route. Old components
then return `ignored`.

Handling any recognized listener freezes manager registration, including the
first recognized interaction after a process restart.

## Related pages

- [Definitions and routes](../definitions/)
- [Options and contexts](../options-and-contexts/)
- [Access and middleware](../access-and-middleware/)
- [Manager and errors](../manager-and-errors/)
