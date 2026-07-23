import { describe, expect, test } from "bun:test";
import {
  CommandManager,
  command,
  commandGroup,
  option,
  prefixCommand,
  tokenizePrefix,
} from "../src";
import {
  CHANNEL_ID,
  GUILD_ID,
  OWNER_ID,
  makeHost,
  message,
  verbs,
} from "./fixtures";

describe("prefix tokenization", () => {
  test("parses quotes, escapes, and empty quoted values", () => {
    expect(
      tokenizePrefix(`echo "two words" 'three words' four\\ five ""`),
    ).toEqual(["echo", "two words", "three words", "four five", ""]);
  });

  test("rejects unfinished quotes and escapes", () => {
    expect(() => tokenizePrefix(`echo "unfinished`)).toThrow(/unclosed quote/);
    expect(() => tokenizePrefix("echo trailing\\")).toThrow(/escape/);
  });
});

describe("prefix dispatch", () => {
  test("rejects invalid prefix settings during setup", () => {
    expect(() =>
      new CommandManager(makeHost(), {
        prefix: {
          prefixes: "!",
          caseSensitive: "yes" as never,
        },
      }),
    ).toThrow(/caseSensitive must be a boolean/);
  });

  test("parses scalar options and a trailing rest value", async () => {
    const received: unknown[] = [];
    const echo = command({
      name: "echo",
      description: "Echo values",
      prefix: { aliases: ["say"] },
      options: {
        count: option.integer({
          description: "Repeat count",
          required: true,
        }),
        loud: option.boolean({ description: "Use loud text" }),
        text: option.string({
          description: "Text to echo",
          prefix: { rest: true },
        }),
      },
      async run(context) {
        expect(context.kind).toBe("prefix");
        received.push(
          context.options.count,
          context.options.loud,
          context.options.text,
        );
        await context.reply("done");
      },
    });
    const { source, rest } = message("??say 2 yes hello there");

    const result = await new CommandManager(makeHost(), {
      prefix: async () => ["!", "??"],
    })
      .register(echo)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(received).toEqual([2, true, "hello there"]);
    expect(verbs(rest)).toEqual(["messageReply"]);
  });

  test("does nothing when prefix handling is not configured", async () => {
    const ping = prefixCommand({
      name: "ping",
      description: "Prefix ping",
      run() {
        throw new Error("must not run");
      },
    });

    const result = await new CommandManager(makeHost())
      .register(ping)
      .handle(message("!ping").source);

    expect(result.status).toBe("ignored");
  });

  test("routes only prefix-enabled children in a mixed group", async () => {
    const handled: string[] = [];
    const chat = command({
      name: "chat",
      description: "Chat only",
      run() {
        handled.push("chat");
      },
    });
    const both = command({
      name: "both",
      description: "Both routes",
      prefix: true,
      async run(context) {
        handled.push(context.kind);
        await context.reply("both");
      },
    });
    const legacy = prefixCommand({
      name: "legacy",
      description: "Prefix only",
      aliases: ["old"],
      async run(context) {
        handled.push("legacy");
        await context.reply("legacy");
      },
    });
    const root = commandGroup({
      name: "tools",
      description: "Tool commands",
      prefix: { aliases: ["t"] },
      children: [chat, both, legacy],
    });
    const manager = new CommandManager(makeHost(), { prefix: "!" }).register(
      root,
    );

    expect(
      (await manager.handle(message("!tools both").source)).status,
    ).toBe("completed");
    expect(
      (await manager.handle(message("!t old").source)).status,
    ).toBe("completed");
    expect(
      (await manager.handle(message("!tools chat").source)).status,
    ).toBe("rejected");
    expect(handled).toEqual(["prefix", "legacy"]);
  });

  test("allows prefix-only groups below Discord's depth limit", async () => {
    let ran = false;
    const leaf = prefixCommand({
      name: "leaf",
      description: "Deep prefix leaf",
      async run(context) {
        ran = true;
        await context.reply("done");
      },
    });
    const deep = commandGroup({
      name: "deep",
      description: "Deep group",
      children: [leaf],
    });
    const middle = commandGroup({
      name: "middle",
      description: "Middle group",
      children: [deep],
    });
    const root = commandGroup({
      name: "root",
      description: "Root group",
      children: [middle],
    });

    const result = await new CommandManager(makeHost(), { prefix: "!" })
      .register(root)
      .handle(message("!root middle deep leaf").source);

    expect(result.status).toBe("completed");
    expect(ran).toBe(true);
  });

  test("keeps case-sensitive command identities distinct", async () => {
    const handled: string[] = [];
    const upper = prefixCommand({
      name: "Status",
      description: "Show the upper status",
      async run(context) {
        handled.push("upper");
        await context.reply("upper");
      },
    });
    const lower = prefixCommand({
      name: "status",
      description: "Show the lower status",
      async run(context) {
        handled.push("lower");
        await context.reply("lower");
      },
    });
    const manager = new CommandManager(makeHost(), {
      prefix: {
        prefixes: "!",
        caseSensitive: true,
      },
    }).register(upper, lower);

    expect(
      (await manager.handle(message("!Status").source)).status,
    ).toBe("completed");
    expect(
      (await manager.handle(message("!status").source)).status,
    ).toBe("completed");
    expect(handled).toEqual(["upper", "lower"]);
  });

  test("resolves mention-shaped option values", async () => {
    const values: unknown[] = [];
    const mentions = prefixCommand({
      name: "mentions",
      description: "Parse mentions",
      options: {
        user: option.user({ required: true }),
        channel: option.channel({ required: true }),
        role: option.role({ required: true }),
        mentionable: option.mentionable({ required: true }),
      },
      async run(context) {
        values.push(
          context.options.user.id,
          context.options.channel.id,
          context.options.role.id,
          context.options.mentionable,
        );
        await context.reply("done");
      },
    });
    const manager = new CommandManager(makeHost(), { prefix: "!" }).register(
      mentions,
    );

    const result = await manager.handle(
      message(
        `!mentions <@!${OWNER_ID}> <#${CHANNEL_ID}> <@&${GUILD_ID}> <@&80000000000000000>`,
      ).source,
    );

    expect(result.status).toBe("completed");
    expect(values).toEqual([
      OWNER_ID,
      CHANNEL_ID,
      GUILD_ID,
      { kind: "role", id: "80000000000000000" },
    ]);
  });
});
