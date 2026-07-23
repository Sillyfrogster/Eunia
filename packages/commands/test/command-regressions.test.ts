import { describe, expect, test } from "bun:test";
import {
  ApplicationCommandOptionType,
  MessageFlags,
  PermissionFlags,
} from "@eunia/types";
import {
  CommandExecutionError,
  CommandManager,
  command,
  option,
  prefixCommand,
} from "../src";
import {
  callbackData,
  makeHost,
  message,
  slash,
  verbs,
} from "./fixtures";

describe("command routing regressions", () => {
  test("supports an option named __proto__", async () => {
    let received = "";
    const inspect = command({
      name: "specialoption",
      description: "Read a special option name",
      options: {
        ["__proto__"]: option.string({
          description: "Value to read",
          required: true,
        }),
      },
      async run(context) {
        received = context.options["__proto__"];
        await context.reply("done");
      },
    });
    const { source } = slash("specialoption", [
      {
        type: ApplicationCommandOptionType.String,
        name: "__proto__",
        value: "safe",
      },
    ]);

    const result = await new CommandManager(makeHost())
      .register(inspect)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(received).toBe("safe");
  });

  test("keeps cooldowns separate for slash and prefix routes", async () => {
    const rateLimit = {
      limit: 1,
      windowMs: 10_000,
      scope: "user" as const,
    };
    const slashStatus = command({
      name: "status",
      description: "Show slash status",
      rateLimit,
      async run(context) {
        await context.reply("slash");
      },
    });
    const prefixStatus = prefixCommand({
      name: "status",
      description: "Show prefix status",
      rateLimit,
      async run(context) {
        await context.reply("prefix");
      },
    });
    const manager = new CommandManager(makeHost(), {
      prefix: "!",
    }).register(slashStatus, prefixStatus);

    const slashResult = await manager.handle(slash("status").source);
    const prefixResult = await manager.handle(message("!status").source);

    expect(slashResult.status).toBe("completed");
    expect(prefixResult.status).toBe("completed");
  });
});

describe("command response regressions", () => {
  test("fails when a command defers without a final reply", async () => {
    const host = makeHost();
    const incomplete = command({
      name: "incomplete",
      description: "Stop after deferring",
      async run(context) {
        await context.defer({ ephemeral: true });
      },
    });
    const { source, rest } = slash("incomplete");

    const result = await new CommandManager(host)
      .register(incomplete)
      .handle(source);

    expect(result.status).toBe("failed");
    expect(host.errors[0]).toBeInstanceOf(CommandExecutionError);
    expect(verbs(rest)).toEqual(["defer", "editOriginal"]);
    expect(rest.calls[1]?.body).toMatchObject({
      content: "The command could not be completed.",
      flags: 0,
    });
  });

  test("auto-defers while permission lookup is still running", async () => {
    let deferredDuringLookup = false;
    const delayed = command({
      name: "delayed",
      description: "Wait for permission data",
      autoDefer: { afterMs: 0, ephemeral: true },
      access: {
        botPermissions: [PermissionFlags.SendMessages],
      },
      async run(context) {
        await context.reply({
          content: "done",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
    const { source, rest } = slash("delayed");

    const result = await new CommandManager(makeHost())
      .register(delayed)
      .handle(source, {
        async resolvePermissions(needs) {
          expect(needs).toEqual({ user: false, bot: true });
          await Bun.sleep(10);
          deferredDuringLookup = verbs(rest).includes("defer");
          return {
            botPermissions: PermissionFlags.SendMessages,
          };
        },
      });

    expect(result.status).toBe("completed");
    expect(deferredDuringLookup).toBe(true);
    expect(verbs(rest)).toEqual(["defer", "editOriginal"]);
    expect(callbackData(rest)).toMatchObject({
      flags: MessageFlags.Ephemeral,
    });
  });
});
