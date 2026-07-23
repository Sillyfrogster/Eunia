import { describe, expect, test } from "bun:test";
import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
  InteractionType,
  PermissionFlags,
} from "@eunia/types";
import type * as types from "@eunia/types";
import { Cache } from "../../cache/src";
import {
  Message,
  User,
  createInteraction,
  type Interaction,
  type StructureCacheShape,
  type StructureContext,
} from "../../structures/src";
import {
  Command,
  CommandGroup,
  CommandManager,
  CommandValidationError,
  DuplicateCommandError,
  MessageCommand,
  UserCommand,
  option,
  type CommandContext,
  type CommandHost,
  type MessageCommandContext,
  type UserCommandContext,
} from "../src";

const APPLICATION_ID = "10000000000000000";
const BOT_ID = "20000000000000000";
const INVOKING_USER_ID = "30000000000000000";
const TARGET_USER_ID = "40000000000000000";
const TARGET_MESSAGE_ID = "50000000000000000";
const CHANNEL_ID = "60000000000000000";
const GUILD_ID = "70000000000000000";

interface RestCall {
  method: string;
  path: string;
  body?: unknown;
}

class FakeRest {
  readonly calls: RestCall[] = [];

  async post<T>(path: string | { path: string }, body?: unknown): Promise<T> {
    const raw = typeof path === "string" ? path : path.path;
    this.calls.push({ method: "POST", path: raw, ...(body === undefined ? {} : { body }) });
    return undefined as T;
  }

  async patch<T>(path: string | { path: string }, body?: unknown): Promise<T> {
    const raw = typeof path === "string" ? path : path.path;
    this.calls.push({ method: "PATCH", path: raw, ...(body === undefined ? {} : { body }) });
    return rawMessage("response") as T;
  }
}

function makeHost(): CommandHost & { requests: Array<{ path: string; body: unknown }> } {
  const requests: Array<{ path: string; body: unknown }> = [];
  return {
    applicationId: APPLICATION_ID,
    botId: BOT_ID,
    ownerIds: [INVOKING_USER_ID],
    requests,
    rest: {
      async put<T>(path: string, body?: unknown): Promise<T> {
        requests.push({ path, body });
        return body as T;
      },
    },
    reportCommandError(): void {},
  };
}

function rawUser(id: string, username: string): types.User {
  return { id, username, discriminator: "0", global_name: null, avatar: null };
}

function rawMessage(content: string): types.Message {
  return {
    id: TARGET_MESSAGE_ID,
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    author: rawUser(TARGET_USER_ID, "target"),
    content,
    timestamp: "2026-01-01T00:00:00.000Z",
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
  };
}

function contextInteraction(
  type: ApplicationCommandType.User | ApplicationCommandType.Message,
  name: string,
  targetId: string | undefined,
  resolved: types.ResolvedData | undefined,
): { source: Interaction<"command">; rest: FakeRest } {
  const rest = new FakeRest();
  const ctx: StructureContext = {
    rest: rest as unknown as StructureContext["rest"],
    cache: new Cache<StructureCacheShape>(),
  };
  const source = createInteraction(
    {
      id: "80000000000000000",
      application_id: APPLICATION_ID,
      channel_id: CHANNEL_ID,
      guild_id: GUILD_ID,
      member: {
        user: rawUser(INVOKING_USER_ID, "invoker"),
        roles: [],
        joined_at: "2026-01-01T00:00:00.000Z",
        deaf: false,
        mute: false,
        flags: 0,
        permissions: `${PermissionFlags.Administrator}` as `${bigint}`,
      },
      app_permissions: `${PermissionFlags.Administrator}` as `${bigint}`,
      token: "token",
      version: 1,
      entitlements: [],
      authorizing_integration_owners: {},
      attachment_size_limit: 10_000_000,
      type: InteractionType.ApplicationCommand,
      data: {
        id: "90000000000000000",
        name,
        type,
        ...(targetId === undefined ? {} : { target_id: targetId }),
        ...(resolved === undefined ? {} : { resolved }),
      },
    },
    ctx,
  );
  return { source, rest };
}

describe("context command registration", () => {
  test("publishes chat input, user, and message commands with the same name", async () => {
    class SlashInspect extends Command {
      name = "inspect";
      description = "Inspect something";
      kind = "slash" as const;
      run(_context: CommandContext): void {}
    }
    class UserInspect extends UserCommand {
      name = "inspect";
      contexts = [InteractionContextType.Guild];
      integrationTypes = [ApplicationIntegrationType.GuildInstall];
      run(_context: UserCommandContext): void {}
    }
    class MessageInspect extends MessageCommand {
      name = "inspect";
      run(_context: MessageCommandContext): void {}
    }

    const host = makeHost();
    const manager = new CommandManager(host).register(
      new SlashInspect(),
      new UserInspect(),
      new MessageInspect(),
    );

    await manager.publish();

    expect(host.requests[0]?.body).toEqual([
      { name: "inspect", description: "Inspect something", type: 1 },
      { name: "inspect", type: 2, contexts: [0], integration_types: [0] },
      { name: "inspect", type: 3 },
    ]);
  });

  test("keeps names unique within each command type", () => {
    class First extends UserCommand {
      name = "Inspect User";
      run(_context: UserCommandContext): void {}
    }
    class Second extends UserCommand {
      name = "Inspect User";
      run(_context: UserCommandContext): void {}
    }

    expect(() => new CommandManager(makeHost()).register(new First(), new Second())).toThrow(
      DuplicateCommandError,
    );
  });

  test("rejects context command options, descriptions, aliases, and groups", () => {
    class WithOption extends UserCommand {
      name = "With Option";
      target = option.user();
      run(_context: UserCommandContext): void {}
    }
    class WithDescription extends MessageCommand {
      name = "With Description";
      description = "Not allowed";
      run(_context: MessageCommandContext): void {}
    }
    class WithAlias extends UserCommand {
      name = "With Alias";
      aliases = ["alias"];
      run(_context: UserCommandContext): void {}
    }
    class GroupedCommand extends UserCommand {
      name = "Grouped Command";
      run(_context: UserCommandContext): void {}
    }
    class ContextGroup extends CommandGroup {
      name = "group";
      description = "Context group";
      children = [GroupedCommand];
    }

    expect(() => new CommandManager(makeHost()).register(new WithOption())).toThrow(
      CommandValidationError,
    );
    expect(() => new CommandManager(makeHost()).register(new WithDescription())).toThrow(
      /cannot declare a description/,
    );
    expect(() => new CommandManager(makeHost()).register(new WithAlias())).toThrow(
      /cannot declare aliases/,
    );
    expect(() => new CommandManager(makeHost()).register(new ContextGroup())).toThrow(
      /cannot be grouped/,
    );
  });

  test("enforces Discord's per-type context command limits", () => {
    const commands = Array.from({ length: 16 }, (_, index) =>
      new (class extends UserCommand {
        name = `User ${index}`;
        run(_context: UserCommandContext): void {}
      })(),
    );

    expect(() => new CommandManager(makeHost()).register(...commands)).toThrow(
      /at most 15 user commands/,
    );
  });
});

describe("context command execution", () => {
  test("routes equal names by command type", async () => {
    const handled: string[] = [];
    class InspectUser extends UserCommand {
      name = "Inspect";
      async run(context: UserCommandContext): Promise<void> {
        handled.push(context.kind);
        await context.reply("User");
      }
    }
    class InspectMessage extends MessageCommand {
      name = "Inspect";
      async run(context: MessageCommandContext): Promise<void> {
        handled.push(context.kind);
        await context.reply("Message");
      }
    }
    const manager = new CommandManager(makeHost()).register(
      new InspectUser(),
      new InspectMessage(),
    );
    const user = contextInteraction(ApplicationCommandType.User, "Inspect", TARGET_USER_ID, {
      users: { [TARGET_USER_ID]: rawUser(TARGET_USER_ID, "target") },
    });
    const message = contextInteraction(
      ApplicationCommandType.Message,
      "Inspect",
      TARGET_MESSAGE_ID,
      { messages: { [TARGET_MESSAGE_ID]: rawMessage("target") } },
    );

    await manager.handle(user.source);
    await manager.handle(message.source);

    expect(handled).toEqual(["user", "message"]);
  });

  test("resolves a user target and its guild member data", async () => {
    let received: UserCommandContext | undefined;
    class InspectUser extends UserCommand {
      name = "Inspect User";
      async run(context: UserCommandContext): Promise<void> {
        received = context;
        await context.reply(`Target: ${context.target.user.username}`);
      }
    }

    const target = rawUser(TARGET_USER_ID, "target");
    const { source, rest } = contextInteraction(
      ApplicationCommandType.User,
      "Inspect User",
      TARGET_USER_ID,
      {
        users: { [TARGET_USER_ID]: target },
        members: {
          [TARGET_USER_ID]: {
            roles: [],
            joined_at: "2026-01-01T00:00:00.000Z",
            flags: 0,
            nick: "Target Member",
          },
        },
      },
    );

    const result = await new CommandManager(makeHost()).register(new InspectUser()).handle(source);

    expect(result).toEqual({ status: "completed", path: ["Inspect User"] });
    expect(received?.kind).toBe("user");
    expect(received?.target.id).toBe(TARGET_USER_ID);
    expect(received?.target.raw).toEqual(target);
    expect(received?.target.user).toBeInstanceOf(User);
    expect(received?.target.member?.nick).toBe("Target Member");
    expect((rest.calls[0]?.body as { type: number }).type).toBe(4);
  });

  test("resolves full and partial message targets", async () => {
    const targets: MessageCommandContext["target"][] = [];
    class InspectMessage extends MessageCommand {
      name = "Inspect Message";
      async run(context: MessageCommandContext): Promise<void> {
        targets.push(context.target);
        await context.reply("Saved");
      }
    }
    const manager = new CommandManager(makeHost()).register(new InspectMessage());
    const complete = rawMessage("complete");
    const first = contextInteraction(
      ApplicationCommandType.Message,
      "Inspect Message",
      TARGET_MESSAGE_ID,
      { messages: { [TARGET_MESSAGE_ID]: complete } },
    );
    const second = contextInteraction(
      ApplicationCommandType.Message,
      "Inspect Message",
      TARGET_MESSAGE_ID,
      { messages: { [TARGET_MESSAGE_ID]: { id: TARGET_MESSAGE_ID, content: "partial" } } },
    );

    await manager.handle(first.source);
    await manager.handle(second.source);

    expect(targets[0]?.raw).toEqual(complete);
    expect(targets[0]?.message).toBeInstanceOf(Message);
    expect(targets[1]?.raw.content).toBe("partial");
    expect(targets[1]?.message).toBeUndefined();
  });

  test("rejects missing resolved targets before running", async () => {
    let runs = 0;
    class InspectUser extends UserCommand {
      name = "Inspect User";
      run(_context: UserCommandContext): void {
        runs += 1;
      }
    }
    const { source, rest } = contextInteraction(
      ApplicationCommandType.User,
      "Inspect User",
      TARGET_USER_ID,
      {},
    );

    const result = await new CommandManager(makeHost()).register(new InspectUser()).handle(source);

    expect(result.status).toBe("rejected");
    expect(runs).toBe(0);
    expect((rest.calls[0]?.body as { type: number }).type).toBe(4);
  });

  test("auto-defers context commands", async () => {
    class SlowUser extends UserCommand {
      name = "Slow User";
      autoDefer = { afterMs: 0, ephemeral: true };

      async run(context: UserCommandContext): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await context.reply("Ready");
      }
    }
    const { source, rest } = contextInteraction(
      ApplicationCommandType.User,
      "Slow User",
      TARGET_USER_ID,
      { users: { [TARGET_USER_ID]: rawUser(TARGET_USER_ID, "target") } },
    );

    const result = await new CommandManager(makeHost()).register(new SlowUser()).handle(source);

    expect(result.status).toBe("completed");
    expect((rest.calls[0]?.body as { type: number }).type).toBe(5);
    expect(rest.calls[1]?.method).toBe("PATCH");
  });
});
