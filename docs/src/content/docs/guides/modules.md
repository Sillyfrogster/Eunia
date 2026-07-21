---
title: Modules
description: Add services and lifecycle hooks without changing the client.
---

Modules own setup and cleanup work outside the client core. A module can register commands, provide services, create cache domains, and add event listeners.

## Lifecycle

```ts
import type { EuniaModule } from "@sillyfrogster/eunia";

export const databaseModule: EuniaModule = {
  name: "database",

  async setup(client) {
    const database = await connectDatabase();
    client.services.provide("database", database);
  },

  async start(client) {
    const database = client.services.get<Database>("database");
    await database.recordBotStarted(client.botId!);
  },

  async stop(client) {
    const database = client.services.resolve<Database>("database");
    await database?.close();
  },
};
```

The hooks run in this order:

1. `setup` runs before the gateway connects.
2. `start` runs after every assigned shard is ready.
3. `stop` runs in reverse module order.

Eunia calls `stop` during startup rollback. Cleanup must accept partially created state.

## Dependencies

List module names that must start first:

```ts
export const monitoringModule: EuniaModule = {
  name: "monitoring",
  dependsOn: ["database"],
};

const client = new Client({
  token,
  intents,
  modules: [monitoringModule, databaseModule],
});
```

Eunia sorts the modules. A missing dependency, repeated name, or cycle fails before setup.

## Services

Use strings for application services or symbols when unrelated packages may choose the same name:

```ts
const DatabaseService = Symbol("database");

client.services.provide(DatabaseService, database);
const sameDatabase = client.services.get<Database>(DatabaseService);
```

Registering the same key twice is an error.

## Commands and cache domains

Register commands during setup:

```ts
export const moderationModule: EuniaModule = {
  name: "moderation",
  setup(client) {
    client.commands.register(new BanCommand(), new TimeoutCommand());
  },
};
```

Create a module-owned cache domain instead of adding fields to the built-in cache:

```ts
const cases = client.cache.domain<ModerationCase>("moderation:cases", {
  maxSize: 5_000,
  ttl: 24 * 60 * 60_000,
});
```

The domain uses the client's adapter, error handler, and shutdown flow.

## Add modules before startup

Pass modules to the constructor or call `use` before the client starts:

```ts
const client = new Client({ token, intents });
client.use(databaseModule).use(monitoringModule);
await client.start();
```

The module list is fixed after startup begins.
