---
title: Command options and contexts
description: Define typed options, handle autocomplete, inspect command contexts, and finish interaction responses.
---

An option map gives a command handler a typed `context.options` object. The
context type then adds only the members that exist for the active route.

## Option factory lookup

```ts
type WithRequired<C, R extends boolean> =
  C extends unknown
    ? Omit<C, "required"> & {
        readonly required?: R;
      }
    : never;

option.string<const R extends boolean = false>(
  config?: WithRequired<StringOptionConfig, R>,
): OptionField<string, R>;

option.integer<const R extends boolean = false>(
  config?: WithRequired<NumericOptionConfig, R>,
): OptionField<number, R>;

option.number<const R extends boolean = false>(
  config?: WithRequired<NumericOptionConfig, R>,
): OptionField<number, R>;

option.boolean<const R extends boolean = false>(
  config?: WithRequired<BooleanOptionConfig, R>,
): OptionField<boolean, R>;

option.user<const R extends boolean = false>(
  config?: WithRequired<UserOptionConfig, R>,
): OptionField<ResolvedUser, R>;

option.channel<const R extends boolean = false>(
  config?: WithRequired<ChannelOptionConfig, R>,
): OptionField<ResolvedChannel, R>;

option.role<const R extends boolean = false>(
  config?: WithRequired<RoleOptionConfig, R>,
): OptionField<ResolvedRole, R>;

option.mentionable<const R extends boolean = false>(
  config?: WithRequired<MentionableOptionConfig, R>,
): OptionField<ResolvedMentionable, R>;

option.attachment<const R extends boolean = false>(
  config?: WithRequired<AttachmentOptionConfig, R>,
): OptionField<ResolvedAttachment, R>;
```

Each factory infers `R` from `config.required`. A required field gives the
handler `V`. An optional field gives it `V | undefined`.

```ts
const greet = command({
  name: "greet",
  description: "Greet another user",
  options: {
    user: option.user({
      description: "The user to greet",
      required: true,
    }),
    note: option.string({
      description: "A short note",
    }),
  },
  async run(context) {
    context.options.user; // ResolvedUser
    context.options.note; // string | undefined
    await context.reply("Hello!");
  },
});
```

The factories return immutable `OptionField<Value, Required>` values.

## Common option fields

```ts
interface OptionConfigBase {
  readonly description?: string;
  readonly nameLocalizations?: Localizations;
  readonly descriptionLocalizations?: Localizations;
  readonly required?: boolean;
}
```

The key in the command's `options` map becomes the option name. A
slash-capable option needs a description. A prefix-only option may omit it.

Required options must appear before optional options in the map.

## String options

```ts
type CompletionConfig<T extends string | number> =
  | {
      readonly choices?: readonly CommandChoice<T>[];
      readonly autocomplete?: never;
    }
  | {
      readonly choices?: never;
      readonly autocomplete?: AutocompleteHandler<T>;
    };

type StringOptionConfig =
  OptionConfigBase &
  CompletionConfig<string> & {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly prefix?: {
      readonly rest?: boolean;
    };
  };
```

`prefix.rest` captures the remaining prefix input as one string. It must be
the final option.

## Integer and number options

```ts
type NumericOptionConfig =
  OptionConfigBase &
  CompletionConfig<number> & {
    readonly minValue?: number;
    readonly maxValue?: number;
  };
```

`option.integer()` accepts safe integers. `option.number()` accepts finite
Discord number values.

## Channel options

```ts
interface ChannelOptionConfig extends OptionConfigBase {
  readonly channelTypes?: readonly ChannelType[];
}
```

`channelTypes` filters Discord application command choices. It is accepted on
a dual-route command because Discord enforces it on the slash route. Prefix
parsing does not enforce the filter. It is rejected on a prefix-only command
because it would have no effect.

## Application and prefix rules

| Rule | Slash or dual route | Prefix-only route |
| --- | --- | --- |
| Discord option name and description | Enforced | Not applied |
| Maximum 25 options | Enforced | Not applied |
| Maximum 25 choices | Enforced | Not applied |
| Discord string length cap | Enforced | Not applied |
| Autocomplete | Supported | Rejected |
| Localizations | Supported | Rejected |
| Channel type filter | Supported | Rejected |
| Required options before optional options | Enforced | Enforced |
| Choice value type and numeric bounds | Enforced | Enforced |
| Final rest string | Rejected on slash-only; must be last on dual | Must be last |

`CommandManager.register()` checks these rules and throws
`CommandValidationError` before any route is added.

On a dual route, localizations and channel type filters affect only the
Discord route. Both routes still use the same handler value types.

## Resolved option values

```ts
type CommandOptionValues<O extends CommandOptionMap> = Readonly<{
  [K in keyof O]:
    O[K] extends OptionField<infer V, infer R>
      ? R extends true
        ? V
        : V | undefined
      : never;
}>;
```

Resolved users, channels, roles, mentionables, and attachments always have an
`id`. They may also contain raw Discord data or an Eunia structure when the
source payload supplied enough data.

```ts
interface ResolvedUser {
  readonly id: string;
  readonly raw?: types.User;
  readonly user?: User;
}

interface ResolvedChannel {
  readonly id: string;
  readonly raw?: Pick<
    types.Channel,
    "id" | "type" | "name" | "permissions"
  >;
  readonly channel?: Channel;
}

interface ResolvedRole {
  readonly id: string;
  readonly raw?: types.Role;
  readonly role?: Role;
}

type ResolvedMentionable =
  | {
      readonly kind: "user";
      readonly id: string;
      readonly raw?: types.User;
      readonly user?: User;
    }
  | {
      readonly kind: "role";
      readonly id: string;
      readonly raw?: types.Role;
      readonly role?: Role;
    };

interface ResolvedAttachment {
  readonly id: string;
  readonly raw?: types.Attachment;
}
```

## `AutocompleteHandler`

```ts
type AutocompleteHandler<
  T extends string | number = string | number,
> = (
  context: AutocompleteContext<T>,
) => Awaitable<readonly CommandChoice<T>[]>;
```

The focused option decides `T`, so a string option receives a string
`context.focused.value`, while integer and number options receive a number.

```ts
query: option.string({
  description: "Search text",
  async autocomplete(context) {
    const results = await catalog.search(
      context.focused.value,
      { signal: context.signal },
    );

    return results.slice(0, 25).map((result) => ({
      name: result.label,
      value: result.id,
    }));
  },
})
```

### `AutocompleteContext<T>`

```ts
interface AutocompleteContext<T extends string | number> {
  readonly kind: "autocomplete";
  readonly command: ChatCommand;
  readonly groups: readonly CommandGroup[];
  readonly path: readonly string[];
  readonly interaction: Interaction<"autocomplete">;
  readonly signal: AbortSignal;
  readonly options: Readonly<
    Record<string, ResolvedCommandOption | undefined>
  >;
  readonly focused: FocusedOption<T>;
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  readonly userPermissions?: bigint;
  readonly botPermissions?: bigint;
}
```

`options` contains the option values Discord has sent so far, including the
focused option. Its keys are not inferred as the command's full option map, so
narrow a value before using a structure-specific field.

`signal` aborts when the configured autocomplete deadline expires. Pass it to
database or network work that supports cancellation. The same signal is
passed to `CommandHandleOptions.resolvePermissions(needs, signal)`.

Abort is cooperative. The handler's work may continue after Eunia answers
with an empty list unless that work observes the signal.

The handler may return at most 25 choices. Eunia validates their names and
value types. A timeout, access rejection, or invalid request sends an empty
choice list. Unexpected failures are wrapped in `AutocompleteError` and sent
to the command host.

Autocomplete runs access rules and guards. It does not run command middleware,
the command handler, or the command rate limit.

## Command context lookup

All command contexts have these members:

```ts
interface InvocationContextBase {
  readonly command: AnyCommand;
  readonly groups: readonly CommandGroup[];
  readonly path: readonly string[];
  readonly userId: string;
  readonly channelId?: string;
  readonly guildId?: string;
  readonly userPermissions?: bigint;
  readonly botPermissions?: bigint;
  reply(input: Sendable): Promise<unknown>;
}
```

Contexts do not expose the client or command host. Capture application
services in the function that creates the command.

The exported unions are:

```ts
type CommandContext =
  | SlashCommandContext
  | PrefixCommandContext
  | UserCommandContext
  | MessageCommandContext;

type CommandAccessContext =
  | CommandContext
  | AutocompleteContext
  | ListenerContext;

type CommandErrorContext = CommandAccessContext;
```

Guards receive `CommandAccessContext`. Unexpected error reporting receives
`CommandErrorContext`.

### `SlashCommandContext<O, L>`

```ts
interface SlashCommandContext<O, L> {
  readonly kind: "slash";
  readonly command: ChatCommand<O, L>;
  readonly options: CommandOptionValues<O>;
  readonly listeners: ListenerHandles<L>;
  readonly interaction: Interaction<"command">;
  defer(options?: {
    readonly ephemeral?: boolean;
  }): Promise<boolean>;
  modal(input: types.ModalInteractionResponseData): Promise<void>;
}
```

`defer()` returns `true` when it claims the interaction and `false` when
another response has already claimed it.

`modal()` opens a modal as the initial interaction response. Build its input
through a modal listener handle so Eunia can route the submission:

```ts
await context.modal(
  context.listeners.edit.modal({
    title: "Edit record",
    components: [/* modal components */],
  }),
);
```

### `PrefixCommandContext<O, L, C>`

```ts
interface PrefixCommandContext<O, L, C> {
  readonly kind: "prefix";
  readonly command: C;
  readonly options: CommandOptionValues<O>;
  readonly listeners: ListenerHandles<L>;
  readonly message: Message;
  readonly prefix: string;
  reply(input: Sendable): Promise<Message>;
}
```

A prefix context has no `interaction` or `defer()` member. Its `reply()` sends
a reply to the source message. Eunia removes an ephemeral flag because normal
Discord messages cannot be ephemeral.

### `UserCommandContext<L>`

Adds:

```ts
readonly kind: "user";
readonly command: UserCommand<L>;
readonly groups: readonly [];
readonly listeners: ListenerHandles<L>;
readonly interaction: Interaction<"command">;
readonly target: UserCommandTarget;
defer(options?: {
  readonly ephemeral?: boolean;
}): Promise<boolean>;
modal(input: types.ModalInteractionResponseData): Promise<void>;
```

It has no `options` member.

### `MessageCommandContext<L>`

Adds:

```ts
readonly kind: "message";
readonly command: MessageCommand<L>;
readonly groups: readonly [];
readonly listeners: ListenerHandles<L>;
readonly interaction: Interaction<"command">;
readonly target: MessageCommandTarget;
defer(options?: {
  readonly ephemeral?: boolean;
}): Promise<boolean>;
modal(input: types.ModalInteractionResponseData): Promise<void>;
```

It has no `options` member.

### `ChatCommandContext<O, L, P>`

`command()` chooses this type from its `prefix` field:

```ts
type ChatCommandContext<O, L, P> =
  | SlashCommandContext<O, L>
  | (
      P extends PrefixExposure
        ? PrefixCommandContext<O, L, ChatCommand<O, L, P>>
        : never
    );
```

A slash-only definition therefore receives only `SlashCommandContext`.
A dual-route definition must narrow `context.kind` before using
route-specific members.

## Reply state and visibility

Eunia serializes calls to the context `reply()`, `defer()`, `modal()`, and
listener `update()` methods in call order. Concurrent calls do not race to
claim the initial response. Prefer these methods when several parts of a
handler may respond. Calls made directly on `context.interaction` are outside
this queue.

For an interaction command:

1. The first `reply()` sends the initial response.
2. Later `reply()` calls send followups.
3. After `defer()`, the next `reply()` edits the original response.
4. Replies after that edit are followups.

The handler must finish the interaction response. Use `context.reply()` for
normal framework-owned responses. Returning without a completed response
fails, and deferring then returning without a final reply also fails. Eunia
reports the failure and tries to complete the interaction with the configured
private error message.

Discord fixes response visibility at defer time. If a later reply explicitly
requests the other visibility, `reply()` rejects with
`ReplyVisibilityMismatchError`.

```ts
await context.defer({ ephemeral: true });
await context.reply({
  content: "Done.",
  flags: MessageFlags.Ephemeral,
});
```

The example keeps the same visibility. You may also omit the flag from the
reply to keep the deferred visibility.

### Opening a modal

Application command contexts provide:

```ts
modal(input: types.ModalInteractionResponseData): Promise<void>;
```

`modal()` must claim the initial interaction response. It is part of the same
queue as `reply()` and `defer()`, so concurrent calls are handled in call
order. The promise rejects with a clear error when an earlier response has
already claimed the interaction.

Opening the modal completes the command response. The handler may return once
the call resolves.

### Automatic deferral

```ts
interface AutoDeferOptions {
  readonly afterMs?: number;
  readonly ephemeral?: boolean;
}
```

`autoDefer: true` defers publicly after 2,000 milliseconds. The object form
sets a delay from 0 through 2,500 milliseconds and may choose private
visibility. The timer starts before permission lookup. If another response
claims the interaction before the delay, the later defer safely does nothing.
The timer is cleared when command handling finishes.

Automatic deferral does not finish the response. The handler must still
complete it, normally by calling `reply()`.

A command that opens a modal must call `modal()` before its automatic defer
fires. If the modal opens first, the timer safely does nothing. If the defer
claims the interaction first, `modal()` rejects because Discord no longer
allows a modal response.

## Related pages

- [Definitions and routes](../definitions/)
- [Listeners](../listeners/)
- [Access and middleware](../access-and-middleware/)
- [Manager and errors](../manager-and-errors/)
