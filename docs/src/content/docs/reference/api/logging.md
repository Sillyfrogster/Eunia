---
title: Logging
description: Logger interface, console logger, silent logger, and formatting.
---

## Logger

```ts
interface Logger {
  debug(...values: unknown[]): void;
  info(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
  child(scope: string): Logger;
}
```

Pass any implementation through `ClientOptions.logger`, `RestOptions.logger`, or gateway options.

## ConsoleLogger

```ts
new ConsoleLogger({ level?, scope?, write? })
```

The default level is `info` and the default scope is `eunia`. Child loggers append their scope. The default writer sends timestamped lines to stderr.

`LogLevel` is `debug`, `info`, `warn`, `error`, or `silent`.

## SilentLogger

`SilentLogger` drops every message. `child()` returns the same logger.

## Environment configuration

`createLogger(scope)` reads `EUNIA_LOG`. A valid log level creates a `ConsoleLogger`; an unset or invalid value creates a `SilentLogger`.

`formatLogPrefix(level, scope, { colors, at? })` returns the timestamp, level, and scope prefix used by the console logger.

## Exports

`Logger`, `LoggerOptions`, `LogLevel`, `ConsoleLogger`, `SilentLogger`, `createLogger`, and `formatLogPrefix`.
