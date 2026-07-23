---
title: Command access and middleware
description: Apply access rules, guards, middleware, rate limits, and cooldown storage.
---

Access rules reject an invocation before its handler. Middleware wraps command
execution. Rate limits reject repeated uses through a cooldown store.

## `CommandAccess`

```ts
interface CommandAccess {
  readonly guildOnly?: boolean;
  readonly ownerOnly?: boolean;
  readonly userPermissions?: PermissionInput;
  readonly botPermissions?: PermissionInput;
  readonly guards?: readonly CommandGuard[];
}
```

`PermissionInput` accepts a permission bitfield or an array of permission
flags. Administrator permission satisfies every permission check.

The manager checks built-in access from the root group through the command.
It then runs manager guards, followed by access guards in the same root to
command order.

| Rule | Rejection code |
| --- | --- |
| `guildOnly` outside a guild | `guild_only` |
| `ownerOnly` for a user outside `CommandHost.ownerIds` | `owner_only` |
| Missing user permission bits | `missing_user_permissions` |
| Missing bot permission bits | `missing_bot_permissions` |
| Required permission data was not available | `permission_data_unavailable` |
| A guard rejects | `guard` |

Access rules apply to command handlers and autocomplete. Listeners inherit
group and command access by default and may add their own rules.

```ts
const purge = command({
  name: "purge",
  description: "Delete recent messages",
  access: {
    guildOnly: true,
    userPermissions: [PermissionFlags.ManageMessages],
    botPermissions: [PermissionFlags.ManageMessages],
  },
  async run(context) {
    await context.reply("Messages deleted.");
  },
});
```

## `CommandGuard`

```ts
type CommandGuard = (
  context: CommandAccessContext,
) => Awaitable<
  | boolean
  | void
  | {
      readonly allowed: false;
      readonly reason?: string;
      readonly details?: Readonly<Record<string, unknown>>;
    }
>;
```

### Parameters

`context` is the active command, autocomplete, or listener context. Use
`context.kind` to narrow it before reading route-specific fields.

### Returns

- Return `true` or `undefined` to allow the invocation.
- Return `false` to reject it with the default guard message.
- Return `{ allowed: false, reason, details }` to include a user-facing reason
  and structured details.

```ts
const hasPlan = (plans: PlanService): CommandGuard =>
  async (context) =>
    (await plans.hasActivePlan(context.userId)) || {
      allowed: false,
      reason: "This command needs an active plan.",
      details: { plan: "pro" },
    };
```

### Errors

A guard rejection becomes `CommandRejection` with code `guard`. A thrown
error becomes a command, autocomplete, or listener failure and is sent to
`CommandHost.reportCommandError()`.

## `CommandMiddleware`

```ts
type CommandMiddleware = (
  context: CommandContext,
  next: () => Promise<void>,
) => Awaitable<void>;
```

Manager middleware runs first, then group middleware from root to leaf, then
command middleware. The command handler is last.

Access checks and the command rate limit run before middleware. Middleware
cannot observe their rejections, and a middleware short-circuit still counts
as one command use.

Call `next()` once to continue. Return without calling it to stop the chain.
The manager waits for downstream work even if the middleware does not return
the promise. Use `await next()` when code after it must run after downstream
middleware and the handler:

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

Middleware runs only for command execution. It does not run for autocomplete
or listeners.

### Errors

Calling `next()` more than once, or calling a captured `next` after the
middleware has returned, throws `MiddlewareError`.

`await next()` also lets middleware catch a downstream handler or middleware
error. If it handles the error instead of rethrowing it, the command can
recover. An interaction must still finish its response.

## Reject expected input

Throw `CommandRejection` when a handler or middleware discovers an expected
condition that is not represented by `CommandAccess`:

```ts
if (ticket.closedAt !== undefined) {
  throw new CommandRejection(
    "invalid_input",
    "That ticket is already closed.",
    { ticketId: ticket.id },
  );
}
```

The manager returns a `rejected` handle result and sends the matching
configured rejection text. This keeps expected user errors out of
`reportCommandError()`.

Use one of the exported `CommandRejectionCode` values. The
`CommandManagerOptions.messages` fields choose the final user-facing text.
For `guard` and `invalid_input`, the default text is the rejection message.

## `CommandRateLimit`

```ts
interface CommandRateLimit {
  readonly limit: number;
  readonly windowMs: number;
  readonly scope?: "user" | "channel" | "guild" | "global";
}
```

`scope` defaults to `user`. Reaching the limit produces a `cooldown`
rejection. Its `details` include `retryAfterMs`, `resetAt`, and the scope.

```ts
rateLimit: {
  limit: 3,
  windowMs: 10_000,
  scope: "user",
}
```

A dual-route `command()` shares one command rate limit between slash and
prefix use. Separate `command()` and `prefixCommand()` definitions have
separate route identities. Listener rate limits use a separate namespace from
their command.

## `CooldownStore`

```ts
interface CooldownStore {
  consume(
    request: CooldownRequest,
  ): Awaitable<CooldownResult>;
}
```

### Parameters

```ts
interface CooldownRequest {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly now: number;
}
```

`consume()` must count and test one use as one atomic operation. Use a shared
store when several processes handle the same commands.

### Returns

```ts
interface CooldownResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
  readonly saturated?: boolean;
}
```

`remaining` must be from zero through the requested limit. A rejected result
must have zero remaining uses. Set `saturated: true` only on a rejected result
when the store cannot safely track another key.

### Errors

A thrown error or invalid result becomes `CooldownStoreError`.

## `MemoryCooldownStore`

```ts
new MemoryCooldownStore(options?: {
  readonly maxEntries?: number;
  readonly sweepIntervalMs?: number;
});
```

| Option | Default | Purpose |
| --- | --- | --- |
| `maxEntries` | `50_000` | Maximum tracked cooldown keys. |
| `sweepIntervalMs` | `30_000` | Minimum time between expired-entry sweeps. |

### Members

```ts
get size(): number;
consume(request: CooldownRequest): CooldownResult;
clear(): void;
```

`clear()` removes every in-memory entry.

### Errors

The constructor throws `RangeError` for invalid options. `consume()` throws
`RangeError` for an empty key, invalid limit or window, or non-finite time.

## Related pages

- [Definitions and routes](../definitions/)
- [Options and contexts](../options-and-contexts/)
- [Listeners](../listeners/)
- [Manager and errors](../manager-and-errors/)
