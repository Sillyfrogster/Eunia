# Shared utilities

Small runtime utilities used across Eunia.

```sh
bun add @sillyfrogster/eunia@alpha
```

The current public surface is a configurable logger:

```ts
import { ConsoleLogger, SilentLogger } from "@sillyfrogster/eunia";

const logger = new ConsoleLogger({ level: "warn", scope: "my-bot" });
const quiet = new SilentLogger();
```

Set `EUNIA_LOG` to `debug`, `info`, `warn`, `error`, or `silent` when using
the default logger.
