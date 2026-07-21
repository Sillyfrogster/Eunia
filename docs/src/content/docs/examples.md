---
title: Example bots
description: Small bots that show one Eunia feature at a time.
---

Each example is a small Bun project with its own environment template and run command.

## Slash commands

Shows a typed user option, an optional string option, a per-user cooldown, command errors, and development-guild publishing.

[Open the slash command example](https://github.com/Sillyfrogster/Eunia/tree/main/apps/slash-commands)

## Component listeners

Shows command-scoped button listeners and stable custom IDs that continue routing after a restart.

[Open the component listener example](https://github.com/Sillyfrogster/Eunia/tree/main/apps/component-listeners)

## Run an example

From either example directory:

```sh
cp .env.example .env
bun install
bun run start
```

Use a development bot and server. Both examples replace the slash commands in the configured server when they start.
