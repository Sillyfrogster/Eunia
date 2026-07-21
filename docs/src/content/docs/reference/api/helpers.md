---
title: Helpers
description: Embed, component, and modal template registries.
---

Template registries keep repeated payload shapes typed. A template receives fill values and returns one payload.

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

`TemplateMap`, `TemplateRegistry`, `EmbedTemplates`, `ComponentTemplates`, `ModalTemplates`, `ModalTemplatePayload`, `EmbedRegistry`, `ComponentRegistry`, and `ModalRegistry`.
