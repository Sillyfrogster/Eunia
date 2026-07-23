import { describe, expect, test } from "bun:test";
import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
} from "@eunia/types";
import {
  CommandManager,
  CommandValidationError,
  DuplicateCommandError,
  command,
  commandGroup,
  messageCommand,
  userCommand,
} from "../src";
import {
  TARGET_MESSAGE_ID,
  TARGET_USER_ID,
  contextInteraction,
  makeHost,
  rawMessage,
  rawUser,
  verbs,
} from "./fixtures";

describe("context command registration", () => {
  test("publishes chat-input, user, and message commands with one name", async () => {
    const chat = command({
      name: "inspect",
      description: "Inspect something",
      run() {},
    });
    const user = userCommand({
      name: "inspect",
      registration: {
        contexts: [InteractionContextType.Guild],
        integrationTypes: [ApplicationIntegrationType.GuildInstall],
      },
      run() {},
    });
    const message = messageCommand({
      name: "inspect",
      run() {},
    });
    const host = makeHost();

    await new CommandManager(host)
      .register(chat, user, message)
      .publish({ scope: "global" });

    expect(host.requests[0]?.body).toEqual([
      {
        name: "inspect",
        description: "Inspect something",
        type: ApplicationCommandType.ChatInput,
      },
      {
        name: "inspect",
        type: ApplicationCommandType.User,
        contexts: [InteractionContextType.Guild],
        integration_types: [ApplicationIntegrationType.GuildInstall],
      },
      {
        name: "inspect",
        type: ApplicationCommandType.Message,
      },
    ]);
  });

  test("keeps names unique within each context command type", () => {
    const first = userCommand({ name: "Inspect User", run() {} });
    const second = userCommand({ name: "Inspect User", run() {} });

    expect(() =>
      new CommandManager(makeHost()).register(first, second),
    ).toThrow(DuplicateCommandError);
  });

  test("rejects context commands inside groups at runtime", () => {
    const context = userCommand({ name: "Inspect User", run() {} });
    const group = commandGroup({
      name: "tools",
      description: "Tool commands",
      children: [context as never],
    });

    expect(() =>
      new CommandManager(makeHost()).register(group),
    ).toThrow(CommandValidationError);
  });

  test("enforces Discord's context command limits", () => {
    const commands = Array.from({ length: 16 }, (_, index) =>
      userCommand({
        name: `User ${index}`,
        run() {},
      }),
    );

    expect(() =>
      new CommandManager(makeHost()).register(...commands),
    ).toThrow(/at most 15 user commands/);
  });
});

describe("context command execution", () => {
  test("resolves a user target without option-only context fields", async () => {
    let targetId = "";
    let optionSurface = true;
    const inspect = userCommand({
      name: "Inspect User",
      async run(context) {
        targetId = context.target.user.id;
        optionSurface = "options" in context || "get" in context;
        await context.reply(context.target.user.displayName);
      },
    });
    const { source, rest } = contextInteraction(
      ApplicationCommandType.User,
      "Inspect User",
      TARGET_USER_ID,
      {
        users: {
          [TARGET_USER_ID]: rawUser(TARGET_USER_ID, "target"),
        },
      },
    );

    const result = await new CommandManager(makeHost())
      .register(inspect)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(targetId).toBe(TARGET_USER_ID);
    expect(optionSurface).toBe(false);
    expect(verbs(rest)).toEqual(["respond"]);
  });

  test("resolves a message target and hydrated structure", async () => {
    let targetId = "";
    let hydrated = false;
    const inspect = messageCommand({
      name: "Inspect Message",
      async run(context) {
        targetId = context.target.id;
        hydrated = context.target.message?.id === TARGET_MESSAGE_ID;
        await context.reply("done");
      },
    });
    const { source } = contextInteraction(
      ApplicationCommandType.Message,
      "Inspect Message",
      TARGET_MESSAGE_ID,
      {
        messages: {
          [TARGET_MESSAGE_ID]: rawMessage("target"),
        },
      },
    );

    const result = await new CommandManager(makeHost())
      .register(inspect)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(targetId).toBe(TARGET_MESSAGE_ID);
    expect(hydrated).toBe(true);
  });

  test("routes equal names by application command type", async () => {
    const handled: string[] = [];
    const user = userCommand({
      name: "Inspect",
      async run(context) {
        handled.push("user");
        await context.reply("user");
      },
    });
    const message = messageCommand({
      name: "Inspect",
      async run(context) {
        handled.push("message");
        await context.reply("message");
      },
    });
    const manager = new CommandManager(makeHost()).register(user, message);

    await manager.handle(
      contextInteraction(
        ApplicationCommandType.User,
        "Inspect",
        TARGET_USER_ID,
        {
          users: {
            [TARGET_USER_ID]: rawUser(TARGET_USER_ID, "target"),
          },
        },
      ).source,
    );
    await manager.handle(
      contextInteraction(
        ApplicationCommandType.Message,
        "Inspect",
        TARGET_MESSAGE_ID,
        {
          messages: {
            [TARGET_MESSAGE_ID]: rawMessage("target"),
          },
        },
      ).source,
    );

    expect(handled).toEqual(["user", "message"]);
  });

  test("supports automatic deferral", async () => {
    const slow = userCommand({
      name: "Slow User",
      autoDefer: { afterMs: 0, ephemeral: true },
      async run(context) {
        await Bun.sleep(5);
        await context.reply("done");
      },
    });
    const { source, rest } = contextInteraction(
      ApplicationCommandType.User,
      "Slow User",
      TARGET_USER_ID,
      {
        users: {
          [TARGET_USER_ID]: rawUser(TARGET_USER_ID, "target"),
        },
      },
    );

    const result = await new CommandManager(makeHost())
      .register(slow)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["defer", "editOriginal"]);
  });

  test("rejects missing resolved targets", async () => {
    const inspect = userCommand({ name: "Inspect User", run() {} });
    const result = await new CommandManager(makeHost())
      .register(inspect)
      .handle(
        contextInteraction(
          ApplicationCommandType.User,
          "Inspect User",
          TARGET_USER_ID,
          undefined,
        ).source,
      );

    expect(result.status).toBe("rejected");
  });
});
