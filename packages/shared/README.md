# @eunia/shared

Small runtime utilities shared by Eunia packages.

```sh
bun add @eunia/shared
```

The current public surface is a configurable logger:

```ts
import { ConsoleLogger, SilentLogger } from "@eunia/shared";

const logger = new ConsoleLogger({ level: "warn", scope: "my-bot" });
const quiet = new SilentLogger();
```

Set `EUNIA_LOG` to `debug`, `info`, `warn`, `error`, or `silent` when using
the default logger.
