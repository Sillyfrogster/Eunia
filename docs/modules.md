# Modules

Modules add services without changing the client core. A module can register
commands, create cache domains, add event listeners, start a database or
monitor, and clean up when the client stops.

## Lifecycle

```ts
import type { EuniaModule } from "@eunia/client";

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

The phases are:

1. `setup` runs before the gateway connects. Register commands and services
   here.
2. `start` runs after every assigned shard is ready. Discord identity and
   gateway methods are available here.
3. `stop` runs in reverse module order during shutdown or startup rollback.

If setup fails partway through, Eunia still calls that module's `stop` hook.
Cleanup should therefore accept a service that may not have been created yet.

## Dependencies

Declare module names that must start first:

```ts
export const monitoringModule: EuniaModule = {
  name: "monitoring",
  dependsOn: ["database"],
};
```

Eunia sorts modules before setup. A missing dependency, repeated name, or
cycle fails before any module runs.

```ts
const client = new Client({
  token,
  intents,
  modules: [monitoringModule, databaseModule],
});
```

Registration order does not need to match dependency order.

## Services

The service registry makes shared ownership explicit:

```ts
const DatabaseService = Symbol("database");

client.services.provide(DatabaseService, database);
const sameDatabase = client.services.get<Database>(DatabaseService);
```

String keys are convenient for configuration. Symbols avoid name collisions
between unrelated packages. Registering the same key twice is an error.

## Commands from a module

Register commands during setup:

```ts
export const moderationModule: EuniaModule = {
  name: "moderation",
  setup(client) {
    client.commands.register(
      new BanCommand(),
      new TimeoutCommand(),
    );
  },
};
```

Command registration freezes when command handling or publishing starts.
This keeps the command tree stable while requests are active.

## Module cache

Use a custom namespace instead of adding fields to Eunia's cache:

```ts
const cases = client.cache.domain<ModerationCase>("moderation:cases", {
  maxSize: 5_000,
  ttl: 24 * 60 * 60_000,
});
```

The namespace uses the client's configured adapter, error handler, and
shutdown flow.

## Add a module after construction

`client.use(module)` is available until the client starts:

```ts
const client = new Client({ token, intents });
client.use(databaseModule).use(monitoringModule);
await client.start();
```

Adding modules after startup is rejected. Keeping the module list fixed makes
startup order and cleanup predictable.
