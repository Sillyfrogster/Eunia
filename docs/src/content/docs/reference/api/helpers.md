---
title: Helpers
description: Content template registries and Components V2 layout helpers.
---

Template registries keep repeated payload shapes typed. A template receives fill values and returns one payload.

## Build a Components V2 message

`componentsV2` provides stateless factories for Discord's layout components. `message()` adds the required Components V2 flag, preserves other message flags, and runs Eunia's shared message checks.

```ts
const payload = componentsV2.message([
  componentsV2.container(
    [
      componentsV2.text("Release 2.0"),
      componentsV2.section(
        ["Ready to publish", "All checks passed"],
        componentsV2.thumbnail("https://example.com/release.png"),
      ),
      componentsV2.separator({ divider: true, spacing: 2 }),
      componentsV2.file("release-notes.txt"),
    ],
    { accentColor: 0x5865f2 },
  ),
], {
  files: [{ data: releaseNotes, name: "release-notes.txt" }],
});

await channel.send(payload);
```

| Factory | Result |
| --- | --- |
| `message(components, options?)` | A checked `MessageCreate` with `IsComponentsV2` set |
| `text(content, options?)` | A text display |
| `thumbnail(url, options?)` | A thumbnail accessory |
| `section(content, accessory, options?)` | A section with one to three text displays |
| `gallery(items, options?)` | A media gallery with one to ten items |
| `file(filename, options?)` | A file component that uses `attachment://filename` |
| `separator(options?)` | A separator |
| `container(components, options?)` | A container with an optional RGB accent color |
| `row(components, options?)` | One to five buttons or one select menu |

Factories accept existing typed buttons and select menus, so listener components can be placed directly in a row. They return plain payload objects and do not retain builder state.

## Define a registry

```ts
const embeds = defineEmbeds({
  notice: (fills: { text: string }) => ({
    description: fills.text,
  }),
});

const embed = embeds("notice", { text: "Saved" });
```

| Function | Payload |
| --- | --- |
| `defineEmbeds(templates)` | `types.Embed` |
| `defineComponents(templates)` | `types.MessageComponent` |
| `defineModals(templates)` | Modal response data without a required `custom_id` |

A registry is callable as `(name, fills, override?)`. Override keys replace the matching top-level result keys. `registry.names` lists the available names.

## Add registries to a client

```ts
const client = new Client({
  token,
  intents: [Intents.Guilds],
  modules: [embedTemplates({ notice: ({ text }) => ({ description: text }) })],
});

client.embeds("notice", { text: "Saved" });
```

| Module factory | Client property |
| --- | --- |
| `embedTemplates(templatesOrRegistry)` | `client.embeds` |
| `componentTemplates(templatesOrRegistry)` | `client.components` |
| `modalTemplates(templatesOrRegistry)` | `client.modals` |

Each factory returns an `EuniaModule`. Register only one template module for each property.

## Types

Components V2 options and inputs use names beginning with `ComponentsV2`. Template types include `TemplateMap`, `TemplateRegistry`, `EmbedTemplates`, `ComponentTemplates`, `ModalTemplates`, `ModalTemplatePayload`, `EmbedRegistry`, `ComponentRegistry`, and `ModalRegistry`.
