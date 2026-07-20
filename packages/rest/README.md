# @eunia/rest

Eunia's Bun-native Discord HTTP transport.

```sh
bun add @eunia/rest
```

```ts
import { EuniaRest, routePath } from "@eunia/rest";

const rest = new EuniaRest({ token });
const currentUser = await rest.get(routePath("/users/@me"));
const message = await rest.post(
  routePath("/channels/{channelId}/messages", { channelId }),
  { content: "hello" },
);
```

A bound route's uninterpolated template is its rate-limit route key. Raw path
strings are accepted as a last-resort trapdoor.

The client learns Discord's route buckets from response headers, keeps channel,
guild, and webhook major parameters separate, and enforces bot-wide and
IP-wide limits. Bucket maps are bounded and expire when idle.

Network and server failures retry non-POST requests. A POST retries only with
`idempotent: true`. Rate-limit responses wait for their required delay.
Interaction callbacks and application webhooks can be sent without bot
authorization.

Multipart uploads, audit log reasons, abort signals, configurable timeouts,
and typed API errors are included.
