import { describe, expect, test } from "bun:test";
import {
  ApplicationCommandOptionType,
  PermissionFlags,
} from "@eunia/types";
import {
  CommandManager,
  command,
  commandGroup,
  onButton,
  onModal,
} from "../src";
import {
  EDIT_MODAL_INPUT,
  TARGET_USER_ID,
  component,
  makeHost,
  slash,
  verbs,
} from "./fixtures";

function branch(name: string) {
  return [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name,
    },
  ] as const;
}

describe("component listeners", () => {
  test("builds a compact custom ID and decodes arbitrary string arguments", async () => {
    let customId = "";
    let received: readonly string[] = [];
    const choose = onButton(async (context) => {
      received = context.args;
      await context.update("done");
    });
    const confirm = command({
      name: "confirm",
      description: "Ask for confirmation",
      listeners: { choose },
      async run(context) {
        const button = context.listeners.choose.button(
          { label: "Confirm" },
          "ticket:42",
          "snowman ☃",
        );
        customId = button.custom_id ?? "";
        await context.reply({
          content: "Continue?",
          components: [
            {
              type: 1,
              components: [button],
            },
          ],
        });
      },
    });
    const manager = new CommandManager(makeHost()).register(confirm);

    await manager.handle(slash("confirm").source);
    expect(customId).toMatch(/^e1\.[A-Za-z0-9_-]{16}:/);
    expect(customId.length).toBeLessThanOrEqual(100);

    const { source, rest } = component(customId);
    const result = await manager.handle(source);

    expect(result.status).toBe("completed");
    expect(received).toEqual(["ticket:42", "snowman ☃"]);
    expect(verbs(rest)).toEqual(["update"]);
  });

  test("opens modals from button listeners through the response queue", async () => {
    let buttonId = "";
    const edit = onModal(async (context) => {
      await context.reply("saved");
    });
    const open = onButton(async (context) => {
      await context.modal(context.listeners.modal("edit", EDIT_MODAL_INPUT));
    });
    const profile = command({
      name: "profile",
      description: "Edit a profile",
      listeners: { open, edit },
      async run(context) {
        buttonId = context.listeners.open.button().custom_id ?? "";
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(makeHost()).register(profile);
    await manager.handle(slash("profile").source);

    const { source, rest } = component(buttonId);
    const result = await manager.handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["modal"]);
  });

  test("uses the full command path for listener identity", async () => {
    const ids: string[] = [];
    const adminShow = command({
      name: "show",
      description: "Show admin data",
      listeners: {
        confirm: onButton(() => {}),
      },
      async run(context) {
        ids.push(context.listeners.confirm.button().custom_id ?? "");
        await context.reply("admin");
      },
    });
    const profileShow = command({
      name: "show",
      description: "Show profile data",
      listeners: {
        confirm: onButton(() => {}),
      },
      async run(context) {
        ids.push(context.listeners.confirm.button().custom_id ?? "");
        await context.reply("profile");
      },
    });
    const admin = commandGroup({
      name: "admin",
      description: "Admin commands",
      children: [adminShow],
    });
    const profile = commandGroup({
      name: "profile",
      description: "Profile commands",
      children: [profileShow],
    });
    const manager = new CommandManager(makeHost()).register(admin, profile);

    await manager.handle(slash("admin", branch("show")).source);
    await manager.handle(slash("profile", branch("show")).source);

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  test("inherits group and command access rules", async () => {
    let customId = "";
    let listenerRuns = 0;
    const remove = command({
      name: "remove",
      description: "Remove a record",
      access: {
        userPermissions: [PermissionFlags.ManageMessages],
      },
      listeners: {
        confirm: onButton(async (context) => {
          listenerRuns += 1;
          await context.update("removed");
        }),
      },
      async run(context) {
        customId = context.listeners.confirm.button().custom_id ?? "";
        await context.reply("confirm");
      },
    });
    const admin = commandGroup({
      name: "admin",
      description: "Admin commands",
      access: { ownerOnly: true },
      children: [remove],
    });
    const manager = new CommandManager(makeHost()).register(admin);
    await manager.handle(slash("admin", branch("remove")).source, {
      userPermissions: PermissionFlags.ManageMessages,
    });

    const result = await manager.handle(
      component(
        customId,
        TARGET_USER_ID,
        PermissionFlags.ManageMessages,
      ).source,
    );

    expect(result.status).toBe("rejected");
    expect(listenerRuns).toBe(0);
  });

  test("allows a listener to add stricter access", async () => {
    let customId = "";
    const restricted = command({
      name: "restricted",
      description: "Use a restricted action",
      listeners: {
        action: onButton(
          async (context) => {
            await context.update("done");
          },
          {
            access: {
              userPermissions: [PermissionFlags.BanMembers],
            },
          },
        ),
      },
      async run(context) {
        customId = context.listeners.action.button().custom_id ?? "";
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(makeHost()).register(restricted);
    await manager.handle(slash("restricted").source);

    const result = await manager.handle(
      component(customId, TARGET_USER_ID, 0n).source,
    );

    expect(result.status).toBe("rejected");
  });

  test("makes inherited access opt-out explicit", async () => {
    let customId = "";
    let ran = false;
    const publicAction = command({
      name: "publicaction",
      description: "Create a public action",
      access: { ownerOnly: true },
      listeners: {
        open: onButton(
          async (context) => {
            ran = true;
            await context.update("opened");
          },
          { inheritAccess: false },
        ),
      },
      async run(context) {
        customId = context.listeners.open.button().custom_id ?? "";
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(makeHost()).register(publicAction);
    await manager.handle(slash("publicaction").source);

    const result = await manager.handle(
      component(customId, TARGET_USER_ID).source,
    );

    expect(result.status).toBe("completed");
    expect(ran).toBe(true);
  });

  test("rejects custom IDs longer than Discord allows", async () => {
    let buildError: unknown;
    const long = command({
      name: "long",
      description: "Build a long listener ID",
      listeners: {
        action: onButton(() => {}),
      },
      async run(context) {
        try {
          context.listeners.action.button({}, "x".repeat(100));
        } catch (error) {
          buildError = error;
        }
        await context.reply("done");
      },
    });

    await new CommandManager(makeHost())
      .register(long)
      .handle(slash("long").source);

    expect(buildError).toBeInstanceOf(RangeError);
  });

  test("reports permission lookup failures without rejecting handle", async () => {
    let customId = "";
    const host = makeHost();
    const action = command({
      name: "permissionlookup",
      description: "Load listener permissions",
      listeners: {
        confirm: onButton(() => {}, {
          access: {
            userPermissions: [PermissionFlags.ViewChannel],
          },
        }),
      },
      async run(context) {
        customId =
          context.listeners.confirm.button().custom_id ?? "";
        await context.reply("ready");
      },
    });
    const manager = new CommandManager(host).register(action);
    await manager.handle(slash("permissionlookup").source);

    const result = await manager.handle(component(customId).source, {
      resolvePermissions() {
        throw new Error("lookup failed");
      },
    });

    expect(result.status).toBe("failed");
    expect(host.errors).toHaveLength(1);
    expect(host.errorContexts).toEqual([undefined]);
  });
});
