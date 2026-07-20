# @eunia/gateway

Eunia's Bun-native Discord gateway transport.

```sh
bun add @eunia/gateway
```

It provides:

- Zlib-stream gateway compression.
- Heartbeats and dead-connection detection.
- Resume, re-identify, reconnect backoff, and fatal close handling.
- Fixed, automatic, and split-process shard plans.
- Identify concurrency and session start budget checks.
- Outbound payload rate limits and size checks.
- Presence updates and guild member requests.

Most bots should use `@eunia/client`. Use this package directly when you want
raw gateway sessions without structures or commands.
