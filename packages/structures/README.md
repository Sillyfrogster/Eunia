# Structures

Eunia's structures turn Discord payloads into snapshot objects with useful
methods. Edit methods return new structures instead of changing the instance
that made the request. Import raw payload types through a namespace so the
hydrated `Message` class and the raw `types.Message` payload never collide.

```sh
bun add @sillyfrogster/eunia@alpha
```

Structures keep their original payload in `raw`. Cache entries remain plain
payloads. This lets memory, Redis, Valkey, and custom stores use the same
serializable values.

Guild relation arrays are stored in the channel, member, and role cache
domains instead of being copied into each cached guild. The configured limit
for each domain therefore covers the data held by that relation.

## Sendable

Every content-bearing method accepts the same `Sendable` input: a plain
string, one embed object, an embed list, or the full payload object.

```ts
const message = await channel.send("Hello");

await message.reply({
  content: "Here is the result",
  embeds: [{ title: "Done", color: 0x5b8cff }],
});

await message.react("✅");
await message.pin();
```

Embeds and components are plain data — there are no builder classes. One
normalization step validates every payload: message creation rejects payloads
with no sendable content, embed text is limited to 6,000 characters across the
whole message, legacy messages allow up to five action rows, and V2-only
layouts need `MessageFlags.IsComponentsV2`.

## Interactions

An interaction is a union discriminated by `kind`: `"command"`,
`"autocomplete"`, `"button"`, `"select"`, or `"modal"`. Verbs a kind cannot
perform do not exist on its type.

```ts
if (interaction.kind === "button") {
  await interaction.update("Confirmed");
}

await interaction.respond("Working on it");
await interaction.defer({ ephemeral: true });
await interaction.original.edit("Ready");
await interaction.followup("Anything else?");
```

The four initial-callback verbs are `respond`, `update`, `defer`, and `modal`;
`defer` selects deferred-message or deferred-update from the kind. After
acknowledgement, `interaction.original` exposes `get`, `edit`, and `delete`
for the @original message, and `followup` sends additional messages. Modal
submissions expose `field()` and `textField()`.

An interaction accepts one initial response. The response state is claimed
before the HTTP request begins, so two concurrent handlers cannot both
respond. A failed initial request returns the interaction to `pending`, so it
can be retried. Inspect `state` or `acknowledged` when middleware needs the
response state.

## Permissions

Permissions are plain `bigint` values. Combine flags with `|` and `& ~`; the
library ships only what operators cannot say:

```ts
import { PermissionFlags, can, missing } from "@sillyfrogster/eunia";

member.can(PermissionFlags.BanMembers);
missing(channel.permissionsFor(member), PermissionFlags.SendMessages);
```

## Cached relations

Properties such as `message.channel`, `channel.guild`, and `member.user` read
the structure payload or hot cache synchronously. They return `undefined`
when the related payload is not available. Their `fetchChannel`, `fetchGuild`,
and `fetchUser` counterparts perform an asynchronous cache or API lookup.

```ts
const channel = message.channel ?? await message.fetchChannel();
```

Bulk accessors such as `guild.roles` return a plain `ReadonlyMap`; use the
native iterator helpers for searches
(`guild.roles.values().find((role) => role.name === "Helpers")`).

Guild members use `${guildId}:${userId}` as their cache key. Every structure
method stores raw API payloads, never class instances.

Moderation and edit methods accept an optional audit log reason where Discord
supports one.

```ts
await member.kick({ reason: "Repeated spam" });
await role.edit({ mentionable: false }, { reason: "Lock the role" });
```

## Helpers

The package includes:

- `normalizeSendable` for turning any `Sendable` into a wire payload.
- CDN URL helpers with supported formats and image sizes.
- Snowflake creation timestamps on structures and through `snowflakeTimestamp`.
