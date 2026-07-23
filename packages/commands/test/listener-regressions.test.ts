import { describe, expect, test } from "bun:test";
import { MessageFlags } from "@eunia/types";
import {
  CommandExecutionError,
  CommandManager,
  CooldownStoreError,
  RegistrationFrozenError,
  command,
  onButton,
} from "../src";
import { listenerRoute } from "../src/listeners";
import {
  callbackData,
  component,
  makeHost,
  slash,
  verbs,
} from "./fixtures";

function buttonRoute(commandName: string, listenerName: string): string {
  return listenerRoute(["chat", commandName, listenerName, "button"]);
}

describe("listener response lifecycle", () => {
  test("builds the next component from a listener", async () => {
    const seen: string[] = [];
    let nextId = "";
    const advance = onButton(async (context) => {
      const step = context.args[0] ?? "";
      seen.push(step);
      if (step === "first") {
        nextId =
          context.listeners.button(
            "advance",
            { label: "Continue" },
            "second",
          ).custom_id ?? "";
      }
      await context.update(`step ${step}`);
    });
    const steps = command({
      name: "steps",
      description: "Move through steps",
      listeners: { advance },
      async run(context) {
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(makeHost()).register(steps);
    const first = component(
      `${buttonRoute("steps", "advance")}:first`,
    );

    expect((await manager.handle(first.source)).status).toBe("completed");
    expect(verbs(first.rest)).toEqual(["update"]);
    expect(nextId).toBe(
      `${buttonRoute("steps", "advance")}:second`,
    );

    const second = component(nextId);
    expect((await manager.handle(second.source)).status).toBe("completed");
    expect(seen).toEqual(["first", "second"]);
  });

  test("edits the source message after deferring a listener", async () => {
    const save = onButton(async (context) => {
      await context.defer();
      await context.update("saved");
    });
    const editor = command({
      name: "editor",
      description: "Edit a record",
      listeners: { save },
      async run(context) {
        await context.reply("ready");
      },
    });
    const { source, rest } = component(
      buttonRoute("editor", "save"),
    );

    const result = await new CommandManager(makeHost())
      .register(editor)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["deferUpdate", "editOriginal"]);
  });

  test("auto-defers while a listener guard is running", async () => {
    const save = onButton(
      async (context) => {
        await context.update("saved");
      },
      {
        access: {
          guards: [
            async () => {
              await Bun.sleep(5);
              return true;
            },
          ],
        },
        autoDefer: { afterMs: 0 },
      },
    );
    const editor = command({
      name: "guardededitor",
      description: "Edit after a guard",
      listeners: { save },
      async run(context) {
        await context.reply("ready");
      },
    });
    const { source, rest } = component(
      buttonRoute("guardededitor", "save"),
    );

    const result = await new CommandManager(makeHost())
      .register(editor)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["deferUpdate", "editOriginal"]);
  });

  test("sends a private error when a listener throws", async () => {
    const host = makeHost();
    const fail = onButton(() => {
      throw new Error("save failed");
    });
    const editor = command({
      name: "brokeneditor",
      description: "Edit a record",
      listeners: { fail },
      async run(context) {
        await context.reply("ready");
      },
    });
    const { source, rest } = component(
      buttonRoute("brokeneditor", "fail"),
    );

    const result = await new CommandManager(host)
      .register(editor)
      .handle(source);

    expect(result.status).toBe("failed");
    expect(host.errors[0]).toBeInstanceOf(CommandExecutionError);
    expect(verbs(rest)).toEqual(["respond"]);
    expect(callbackData(rest)).toMatchObject({
      content: "The command could not be completed.",
      flags: MessageFlags.Ephemeral,
    });
  });

  test("fails a listener that returns without responding", async () => {
    const host = makeHost();
    const silent = onButton(() => {});
    const editor = command({
      name: "silenteditor",
      description: "Edit a record",
      listeners: { silent },
      async run(context) {
        await context.reply("ready");
      },
    });
    const { source, rest } = component(
      buttonRoute("silenteditor", "silent"),
    );

    const result = await new CommandManager(host)
      .register(editor)
      .handle(source);

    expect(result.status).toBe("failed");
    expect(host.errors[0]).toBeInstanceOf(CommandExecutionError);
    expect(verbs(rest)).toEqual(["respond"]);
  });

  test("applies listener rate limits independently", async () => {
    let runs = 0;
    const save = onButton(
      async (context) => {
        runs += 1;
        await context.update("saved");
      },
      {
        rateLimit: {
          limit: 1,
          windowMs: 60_000,
        },
      },
    );
    const editor = command({
      name: "limitededitor",
      description: "Edit a record",
      listeners: { save },
      async run(context) {
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(makeHost()).register(editor);
    const customId = buttonRoute("limitededitor", "save");

    const first = await manager.handle(component(customId).source);
    const secondInteraction = component(customId);
    const second = await manager.handle(secondInteraction.source);

    expect(first.status).toBe("completed");
    expect(second.status).toBe("rejected");
    expect(runs).toBe(1);
    expect(verbs(secondInteraction.rest)).toEqual(["respond"]);
  });

  test("keeps listener cooldown-store errors specific", async () => {
    const host = makeHost();
    const save = onButton(
      async (context) => {
        await context.update("saved");
      },
      {
        rateLimit: {
          limit: 1,
          windowMs: 60_000,
        },
      },
    );
    const editor = command({
      name: "failedlimit",
      description: "Fail a listener limit",
      listeners: { save },
      async run(context) {
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(host, {
      cooldownStore: {
        consume() {
          throw new Error("store unavailable");
        },
      },
    }).register(editor);

    const result = await manager.handle(
      component(buttonRoute("failedlimit", "save")).source,
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toBeInstanceOf(CooldownStoreError);
    expect(host.errors[0]).toBeInstanceOf(CooldownStoreError);
  });
});

describe("listener routing regressions", () => {
  test("freezes registration after handling a known listener", async () => {
    const confirm = onButton(async (context) => {
      await context.update("confirmed");
    });
    const action = command({
      name: "action",
      description: "Run an action",
      listeners: { confirm },
      async run(context) {
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(makeHost()).register(action);

    const result = await manager.handle(
      component(buttonRoute("action", "confirm")).source,
    );

    expect(result.status).toBe("completed");
    expect(manager.isFrozen).toBe(true);
    expect(() =>
      manager.register(
        command({
          name: "late",
          description: "Register too late",
          run() {},
        }),
      ),
    ).toThrow(RegistrationFrozenError);
  });

  test("supports a listener named __proto__", async () => {
    let customId = "";
    let nextId = "";
    const special = command({
      name: "speciallistener",
      description: "Use a special listener name",
      listeners: {
        ["__proto__"]: onButton(async (context) => {
          nextId =
            context.listeners.button(
              "__proto__",
              { label: "Again" },
              "again",
            ).custom_id ?? "";
          await context.update("done");
        }),
      },
      async run(context) {
        customId =
          context.listeners["__proto__"].button().custom_id ?? "";
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(makeHost()).register(special);

    await manager.handle(slash("speciallistener").source);
    const result = await manager.handle(component(customId).source);

    expect(result.status).toBe("completed");
    expect(customId).toBe(
      buttonRoute("speciallistener", "__proto__"),
    );
    expect(nextId).toBe(`${customId}:again`);
  });
});
