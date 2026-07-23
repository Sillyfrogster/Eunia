import { describe, expect, test } from "bun:test";
import { MessageFlags } from "@eunia/types";
import {
  CommandExecutionError,
  CommandManager,
  CommandRejection,
  ReplyVisibilityMismatchError,
  command,
} from "../src";
import {
  callbackData,
  editModal,
  makeHost,
  slash,
  verbs,
} from "./fixtures";

describe("interaction responses", () => {
  test("edits a deferred reply when its visibility stays private", async () => {
    const privateReply = command({
      name: "private",
      description: "Send a private reply",
      async run(context) {
        await context.defer({ ephemeral: true });
        await context.reply({
          content: "done",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
    const { source, rest } = slash("private");

    const result = await new CommandManager(makeHost())
      .register(privateReply)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["defer", "editOriginal"]);
    expect(rest.calls[1]?.body).toMatchObject({ content: "done", flags: 0 });
  });

  test("edits an automatically deferred reply with matching visibility", async () => {
    const privateReply = command({
      name: "automatic",
      description: "Send a delayed private reply",
      autoDefer: { afterMs: 0, ephemeral: true },
      async run(context) {
        await Bun.sleep(5);
        await context.reply({
          content: "done",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
    const { source, rest } = slash("automatic");

    const result = await new CommandManager(makeHost())
      .register(privateReply)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["defer", "editOriginal"]);
  });

  test("reports a deferred visibility change and sends a private error", async () => {
    const host = makeHost();
    const mismatched = command({
      name: "mismatched",
      description: "Change reply visibility",
      async run(context) {
        await context.defer();
        await context.reply({
          content: "private",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
    const { source, rest } = slash("mismatched");

    const result = await new CommandManager(host)
      .register(mismatched)
      .handle(source);

    expect(result.status).toBe("failed");
    expect(host.errors).toHaveLength(1);
    expect(host.errors[0]).toBeInstanceOf(CommandExecutionError);
    expect((host.errors[0] as CommandExecutionError).cause).toBeInstanceOf(
      ReplyVisibilityMismatchError,
    );
    expect(verbs(rest)).toEqual(["defer", "deleteOriginal", "followup"]);
    expect(rest.calls[2]?.body).toMatchObject({
      content: "The command could not be completed.",
      flags: MessageFlags.Ephemeral,
    });
  });

  test("falls back when a rejection message function throws", async () => {
    const host = makeHost();
    const rejected = command({
      name: "rejected",
      description: "Reject an invalid request",
      run() {
        throw new CommandRejection(
          "invalid_input",
          "The request is invalid.",
        );
      },
    });
    const { source, rest } = slash("rejected");

    const result = await new CommandManager(host, {
      messages: {
        invalidInput() {
          throw new Error("message failed");
        },
      },
    })
      .register(rejected)
      .handle(source);

    expect(result.status).toBe("rejected");
    expect(verbs(rest)).toEqual(["respond"]);
    expect(callbackData(rest)).toMatchObject({
      content: "The command could not be completed.",
      flags: MessageFlags.Ephemeral,
    });
    expect(host.errors).toHaveLength(1);
  });

  test("responds before waiting for slow error reporting", async () => {
    const host = makeHost();
    let releaseReport!: () => void;
    const reportFinished = new Promise<void>((resolve) => {
      releaseReport = resolve;
    });
    host.reportCommandError = async () => {
      await reportFinished;
    };
    const failing = command({
      name: "slowreport",
      description: "Fail with slow reporting",
      run() {
        throw new Error("handler failed");
      },
    });
    const { source, rest } = slash("slowreport");
    const pending = new CommandManager(host)
      .register(failing)
      .handle(source);

    await Bun.sleep(0);
    expect(verbs(rest)).toEqual(["respond"]);

    releaseReport();
    expect((await pending).status).toBe("failed");
  });

  test("uses followups after the first reply", async () => {
    const repeated = command({
      name: "repeated",
      description: "Send more than one reply",
      async run(context) {
        await context.reply("first");
        await context.reply("second");
      },
    });
    const { source, rest } = slash("repeated");

    const result = await new CommandManager(makeHost())
      .register(repeated)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["respond", "followup"]);
  });

  test("serializes concurrent replies", async () => {
    const repeated = command({
      name: "concurrent",
      description: "Send replies together",
      async run(context) {
        await Promise.all([
          context.reply("first"),
          context.reply("second"),
        ]);
      },
    });
    const { source, rest } = slash("concurrent");

    const result = await new CommandManager(makeHost())
      .register(repeated)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["respond", "followup"]);
  });

  test("opens modals through the response queue", async () => {
    const modal = command({
      name: "modal",
      description: "Open a modal",
      async run(context) {
        await context.modal(editModal("edit-profile"));
      },
    });
    const { source, rest } = slash("modal");

    const result = await new CommandManager(makeHost())
      .register(modal)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["modal"]);
    expect(callbackData(rest)).toMatchObject({
      custom_id: "edit-profile",
      title: "Edit profile",
    });
  });

  test("does not open a modal after automatic deferral", async () => {
    const host = makeHost();
    const delayed = command({
      name: "delayedmodal",
      description: "Open a delayed modal",
      autoDefer: { afterMs: 0 },
      async run(context) {
        await Bun.sleep(5);
        await context.modal(editModal("too-late"));
      },
    });
    const { source, rest } = slash("delayedmodal");

    const result = await new CommandManager(host)
      .register(delayed)
      .handle(source);

    expect(result.status).toBe("failed");
    expect(verbs(rest)).toEqual([
      "defer",
      "deleteOriginal",
      "followup",
    ]);
    const cause = (host.errors[0] as CommandExecutionError).cause;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toBe(
      "A modal must be the initial interaction response.",
    );
  });

  test("observes a direct private defer before replying", async () => {
    const direct = command({
      name: "directdefer",
      description: "Defer through the interaction",
      async run(context) {
        await context.interaction.defer({ ephemeral: true });
        await context.reply({
          content: "done",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
    const { source, rest } = slash("directdefer");

    const result = await new CommandManager(makeHost())
      .register(direct)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["defer", "editOriginal"]);
  });

  test("fails commands that finish without a response", async () => {
    const host = makeHost();
    const silent = command({
      name: "silent",
      description: "Finish without replying",
      run() {},
    });
    const { source, rest } = slash("silent");

    const result = await new CommandManager(host)
      .register(silent)
      .handle(source);

    expect(result.status).toBe("failed");
    expect(host.errors).toHaveLength(1);
    expect(verbs(rest)).toEqual(["respond"]);
    expect(callbackData(rest)).toMatchObject({
      content: "The command could not be completed.",
      flags: MessageFlags.Ephemeral,
    });
  });

  test("follows a response sent through the interaction directly", async () => {
    const direct = command({
      name: "direct",
      description: "Use the interaction response",
      async run(context) {
        await context.interaction.respond("first");
        await context.reply("second");
      },
    });
    const { source, rest } = slash("direct");

    const result = await new CommandManager(makeHost())
      .register(direct)
      .handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["respond", "followup"]);
  });
});
