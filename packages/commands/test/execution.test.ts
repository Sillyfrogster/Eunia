import { describe, expect, test } from "bun:test";
import {
  ApplicationCommandOptionType,
  ChannelType,
  PermissionFlags,
} from "@eunia/types";
import {
  CommandManager,
  MemoryCooldownStore,
  command,
  commandGroup,
  option,
  type CommandHandleResult,
} from "../src";
import {
  CHANNEL_ID,
  GUILD_ID,
  OWNER_ID,
  TARGET_USER_ID,
  callbackData,
  makeHost,
  rawUser,
  slash,
  verbs,
} from "./fixtures";

describe("chat-input execution", () => {
  test("hydrates named options and exposes their inferred values", async () => {
    const values: unknown[] = [];
    const inspect = command({
      name: "inspect",
      description: "Inspect resolved values",
      options: {
        user: option.user({
          description: "User to inspect",
          required: true,
        }),
        channel: option.channel({
          description: "Channel to inspect",
          required: true,
          channelTypes: [ChannelType.GuildText],
        }),
        count: option.integer({
          description: "Number of items",
          minValue: 1,
        }),
        enabled: option.boolean({ description: "Whether to enable it" }),
      },
      async run(context) {
        values.push(
          context.options.user.id,
          context.options.user.user?.displayName,
          context.options.channel.id,
          context.options.channel.channel?.name,
          context.options.count,
          context.options.enabled,
        );
        await context.reply("done");
      },
    });
    const { source } = slash(
      "inspect",
      [
        {
          type: ApplicationCommandOptionType.User,
          name: "user",
          value: TARGET_USER_ID,
        },
        {
          type: ApplicationCommandOptionType.Channel,
          name: "channel",
          value: CHANNEL_ID,
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: "count",
          value: 2,
        },
      ],
      {
        users: {
          [TARGET_USER_ID]: rawUser(TARGET_USER_ID, "target"),
        },
        channels: {
          [CHANNEL_ID]: {
            id: CHANNEL_ID,
            type: ChannelType.GuildText,
            name: "general",
          },
        },
      },
    );

    const result = await new CommandManager(makeHost())
      .register(inspect)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(values).toEqual([
      TARGET_USER_ID,
      "target",
      CHANNEL_ID,
      "general",
      2,
      undefined,
    ]);
  });

  test("rejects missing, repeated, unknown, and invalid options", async () => {
    const required = command({
      name: "required",
      description: "Require a value",
      options: {
        value: option.integer({
          description: "Required value",
          required: true,
          minValue: 2,
        }),
      },
      async run(context) {
        await context.reply(`${context.options.value}`);
      },
    });
    const manager = new CommandManager(makeHost()).register(required);

    const cases = [
      [],
      [
        {
          type: ApplicationCommandOptionType.Integer,
          name: "value",
          value: 1,
        },
      ],
      [
        {
          type: ApplicationCommandOptionType.String,
          name: "unknown",
          value: "x",
        },
      ],
      [
        {
          type: ApplicationCommandOptionType.Integer,
          name: "value",
          value: 2,
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: "value",
          value: 2,
        },
      ],
    ] as const;

    for (const options of cases) {
      const result = await manager.handle(
        slash("required", options).source,
      );
      expect(result.status).toBe("rejected");
    }
  });

  test("runs global, group, and command middleware in order", async () => {
    const calls: string[] = [];
    const leaf = command({
      name: "leaf",
      description: "Run middleware",
      middleware: [
        async (_context, next) => {
          calls.push("command before");
          await next();
          calls.push("command after");
        },
      ],
      async run(context) {
        calls.push("run");
        await context.reply("done");
      },
    });
    const root = commandGroup({
      name: "root",
      description: "Root commands",
      middleware: [
        async (_context, next) => {
          calls.push("group before");
          await next();
          calls.push("group after");
        },
      ],
      children: [leaf],
    });
    const manager = new CommandManager(makeHost(), {
      middleware: [
        async (_context, next) => {
          calls.push("global before");
          await next();
          calls.push("global after");
        },
      ],
    }).register(root);

    await manager.handle(
      slash("root", [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "leaf",
        },
      ]).source,
    );

    expect(calls).toEqual([
      "global before",
      "group before",
      "command before",
      "run",
      "command after",
      "group after",
      "global after",
    ]);
  });

  test("finishes middleware work when next is not awaited", async () => {
    const calls: string[] = [];
    const ping = command({
      name: "ping",
      description: "Check the bot",
      async run(context) {
        await Bun.sleep(1);
        calls.push("run");
        await context.reply("pong");
      },
    });
    const manager = new CommandManager(makeHost(), {
      middleware: [
        (_context, next) => {
          next();
          calls.push("middleware");
        },
      ],
    }).register(ping);

    const result = await manager.handle(slash("ping").source);

    expect(result.status).toBe("completed");
    expect(calls).toEqual(["middleware", "run"]);
  });

  test("lets middleware recover from a downstream failure", async () => {
    const host = makeHost();
    const ping = command({
      name: "recover",
      description: "Recover from a failure",
      run() {
        throw new Error("handler failed");
      },
    });
    const manager = new CommandManager(host, {
      middleware: [
        async (context, next) => {
          try {
            await next();
          } catch {
            await context.reply("recovered");
          }
        },
      ],
    }).register(ping);
    const { source, rest } = slash("recover");

    const result = await manager.handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["respond"]);
    expect(host.errors).toHaveLength(0);
  });

  test("does not leak an unhandled rejection from unawaited next", async () => {
    let unhandled = 0;
    const onUnhandled = () => {
      unhandled += 1;
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const failing = command({
        name: "unhandled",
        description: "Fail after middleware continues",
        run() {
          throw new Error("handler failed");
        },
      });
      const manager = new CommandManager(makeHost(), {
        middleware: [
          async (_context, next) => {
            next();
            await Bun.sleep(5);
          },
        ],
      }).register(failing);

      const result = await manager.handle(
        slash("unhandled").source,
      );
      await Bun.sleep(0);

      expect(result.status).toBe("failed");
      expect(unhandled).toBe(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("access rules", () => {
  test("inherits owner and permission rules through groups", async () => {
    let ran = false;
    const secure = command({
      name: "secure",
      description: "Secure command",
      access: {
        botPermissions: [PermissionFlags.ManageMessages],
      },
      async run(context) {
        ran = true;
        await context.reply("done");
      },
    });
    const root = commandGroup({
      name: "admin",
      description: "Admin commands",
      access: {
        ownerOnly: true,
        userPermissions: [PermissionFlags.BanMembers],
      },
      children: [secure],
    });
    const manager = new CommandManager(makeHost()).register(root);
    const path = [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "secure",
      },
    ];

    const rejected = await manager.handle(
      slash("admin", path, undefined, TARGET_USER_ID).source,
      {
        userPermissions: PermissionFlags.BanMembers,
        botPermissions: PermissionFlags.ManageMessages,
      },
    );
    expect(rejected.status).toBe("rejected");
    expect(ran).toBe(false);

    const completed = await manager.handle(slash("admin", path).source, {
      userPermissions: PermissionFlags.BanMembers,
      botPermissions: PermissionFlags.ManageMessages,
    });
    expect(completed.status).toBe("completed");
    expect(ran).toBe(true);
  });

  test("runs guards against the common access context", async () => {
    const kinds: string[] = [];
    const guarded = command({
      name: "guarded",
      description: "Guarded command",
      access: {
        guards: [
          (context) => {
            kinds.push(context.kind);
            return {
              allowed: false,
              reason: "Closed",
            };
          },
        ],
      },
      run() {},
    });
    const { source, rest } = slash("guarded");

    const result = await new CommandManager(makeHost())
      .register(guarded)
      .handle(source);

    expect(result.status).toBe("rejected");
    expect(kinds).toEqual(["slash"]);
    expect(callbackData(rest)).toMatchObject({ content: "Closed" });
  });
});

describe("cooldowns and failures", () => {
  test("applies command cooldowns through the configured store", async () => {
    let runs = 0;
    const limited = command({
      name: "limited",
      description: "Limited command",
      rateLimit: {
        limit: 1,
        windowMs: 10_000,
        scope: "user",
      },
      async run(context) {
        runs += 1;
        await context.reply("done");
      },
    });
    const manager = new CommandManager(makeHost(), {
      cooldownStore: new MemoryCooldownStore(),
    }).register(limited);

    const first = await manager.handle(slash("limited").source);
    const second = await manager.handle(slash("limited").source);

    expect(first.status).toBe("completed");
    expect(second.status).toBe("rejected");
    expect(
      (
        second as Extract<
          CommandHandleResult,
          { status: "rejected" }
        >
      ).rejection.code,
    ).toBe("cooldown");
    expect(runs).toBe(1);
  });

  test("reports handler failures and sends a private error", async () => {
    const host = makeHost();
    const broken = command({
      name: "broken",
      description: "Fail during execution",
      async run() {
        throw new Error("boom");
      },
    });
    const { source, rest } = slash("broken");

    const result = await new CommandManager(host)
      .register(broken)
      .handle(source);

    expect(result.status).toBe("failed");
    expect(host.errors).toHaveLength(1);
    expect(verbs(rest)).toEqual(["respond"]);
    expect(callbackData(rest)).toMatchObject({
      content: "The command could not be completed.",
      flags: 64,
    });
  });

  test("fails closed when a cooldown store returns malformed data", async () => {
    const host = makeHost();
    const stored = command({
      name: "stored",
      description: "Use an external cooldown",
      rateLimit: { limit: 1, windowMs: 1_000 },
      async run(context) {
        await context.reply("done");
      },
    });
    const manager = new CommandManager(host, {
      cooldownStore: {
        consume: () =>
          ({
            allowed: "yes",
            remaining: Number.NaN,
            resetAt: Number.NaN,
          }) as never,
      },
    }).register(stored);

    expect((await manager.handle(slash("stored").source)).status).toBe(
      "failed",
    );
    expect(host.errors).toHaveLength(1);
  });

  test("keeps memory cooldowns bounded", () => {
    const store = new MemoryCooldownStore({
      maxEntries: 1,
      sweepIntervalMs: 0,
    });
    expect(
      store.consume({ key: "one", limit: 1, windowMs: 100, now: 0 }).allowed,
    ).toBe(true);
    expect(
      store.consume({ key: "one", limit: 1, windowMs: 100, now: 1 }).allowed,
    ).toBe(false);
    expect(
      store.consume({ key: "two", limit: 1, windowMs: 100, now: 2 })
        .saturated,
    ).toBe(true);
    expect(store.size).toBe(1);
  });
});
