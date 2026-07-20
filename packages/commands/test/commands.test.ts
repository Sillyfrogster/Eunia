import { describe, expect, test } from "bun:test";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ChannelType,
  ComponentType,
  InteractionContextType,
  InteractionType,
  MessageFlags,
  PermissionFlags,
} from "@eunia/types";
import type * as types from "@eunia/types";
import type { RequestPath } from "../../rest/src";
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
  MemoryCooldownStore,
  RegistrationFrozenError,
  onButton,
  onModal,
  option,
  tokenizePrefix,
  type CommandContext,
  type CommandHandleResult,
  type CommandHost,
} from "../src";

const APPLICATION_ID = "10000000000000000";
const BOT_ID = "20000000000000000";
const OWNER_ID = "30000000000000000";
const CHANNEL_ID = "60000000000000000";
const GUILD_ID = "70000000000000000";

interface RestCall {
  method: string;
  path: string;
  body?: unknown;
}

class FakeRest {
  readonly calls: RestCall[] = [];

  get<T>(path: RequestPath): Promise<T> {
    return this.request("GET", path);
  }

  post<T>(path: RequestPath, body?: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  patch<T>(path: RequestPath, body?: unknown): Promise<T> {
    return this.request("PATCH", path, body);
  }

  put<T>(path: RequestPath, body?: unknown): Promise<T> {
    return this.request("PUT", path, body);
  }

  delete<T>(path: RequestPath): Promise<T> {
    return this.request("DELETE", path);
  }

  private async request<T>(method: string, path: RequestPath, body?: unknown): Promise<T> {
    const raw = typeof path === "string" ? path : path.path;
    this.calls.push({ method, path: raw, ...(body === undefined ? {} : { body }) });
    if (raw.includes("/callback") || method === "DELETE") return undefined as T;
    if (raw.startsWith("/webhooks/") || raw.includes("/messages")) {
      return rawMessage("response") as T;
    }
    return undefined as T;
  }
}

/** Maps recorded REST calls back to the interaction verbs that caused them. */
function verbs(rest: FakeRest): string[] {
  return rest.calls.map((call) => {
    if (call.path.includes("/callback")) {
      const type = (call.body as { type: number }).type;
      switch (type) {
        case 4:
          return "respond";
        case 5:
          return "defer";
        case 6:
          return "deferUpdate";
        case 7:
          return "update";
        case 8:
          return "autocomplete";
        case 9:
          return "modal";
        default:
          return "callback";
      }
    }
    if (call.path.endsWith("/messages/@original")) {
      if (call.method === "PATCH") return "editOriginal";
      if (call.method === "DELETE") return "deleteOriginal";
      return "getOriginal";
    }
    if (call.path.startsWith("/webhooks/")) return "followup";
    if (call.path.includes("/messages")) return "messageReply";
    return `${call.method} ${call.path}`;
  });
}

function callbackData(rest: FakeRest, index = 0): unknown {
  return (rest.calls[index]?.body as { data?: unknown } | undefined)?.data;
}

function makeContext(): { ctx: StructureContext; rest: FakeRest } {
  const rest = new FakeRest();
  return {
    rest,
    ctx: {
      rest: rest as unknown as StructureContext["rest"],
      cache: new Cache<StructureCacheShape>(),
    },
  };
}

function makeHost(): CommandHost & {
  requests: Array<{ path: string; body: unknown }>;
  errors: unknown[];
} {
  const requests: Array<{ path: string; body: unknown }> = [];
  const errors: unknown[] = [];
  return {
    applicationId: APPLICATION_ID,
    botId: BOT_ID,
    ownerIds: [OWNER_ID],
    requests,
    errors,
    rest: {
      async put<T>(path: string, body?: unknown): Promise<T> {
        requests.push({ path, body });
        return body as T;
      },
    },
    reportCommandError(error): void {
      errors.push(error);
    },
  };
}

function rawUser(id = OWNER_ID): types.User {
  return { id, username: "owner", discriminator: "0", global_name: null, avatar: null };
}

function rawMessage(content: string): types.Message {
  return {
    id: "80000000000000000",
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    author: rawUser(),
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

const INTERACTION_BASE = {
  id: "40000000000000000",
  application_id: APPLICATION_ID,
  channel_id: CHANNEL_ID,
  guild_id: GUILD_ID,
  member: {
    user: rawUser(),
    roles: [],
    joined_at: "2026-01-01T00:00:00.000Z",
    deaf: false,
    mute: false,
    flags: 0,
    permissions: `${PermissionFlags.Administrator}` as `${bigint}`,
  },
  app_permissions: `${PermissionFlags.Administrator}` as `${bigint}`,
  token: "token",
  version: 1 as const,
  entitlements: [],
  authorizing_integration_owners: {},
  attachment_size_limit: 10_000_000,
};

function slash(
  name: string,
  options: readonly types.ApplicationCommandInteractionOption[] = [],
  resolved?: types.ResolvedData,
): { source: Interaction; rest: FakeRest } {
  const { ctx, rest } = makeContext();
  const source = createInteraction(
    {
      ...INTERACTION_BASE,
      type: InteractionType.ApplicationCommand,
      data: {
        id: "50000000000000000",
        name,
        type: ApplicationCommandType.ChatInput,
        options: [...options],
        ...(resolved === undefined ? {} : { resolved }),
      },
    },
    ctx,
  );
  return { source, rest };
}

function autocompletion(
  name: string,
  options: readonly types.ApplicationCommandInteractionOption[],
): { source: Interaction; rest: FakeRest } {
  const { ctx, rest } = makeContext();
  const source = createInteraction(
    {
      ...INTERACTION_BASE,
      type: InteractionType.ApplicationCommandAutocomplete,
      data: {
        id: "50000000000000000",
        name,
        type: ApplicationCommandType.ChatInput,
        options: [...options],
      },
    },
    ctx,
  );
  return { source, rest };
}

function component(customId: string): { source: Interaction; rest: FakeRest } {
  const { ctx, rest } = makeContext();
  const source = createInteraction(
    {
      ...INTERACTION_BASE,
      type: InteractionType.MessageComponent,
      data: { custom_id: customId, component_type: ComponentType.Button },
      message: rawMessage("original"),
    },
    ctx,
  );
  return { source, rest };
}

function message(content: string): { source: Message; rest: FakeRest } {
  const { ctx, rest } = makeContext();
  return { source: new Message(rawMessage(content), ctx), rest };
}

class PingCommand extends Command {
  name = "ping";
  description = "Check the bot";
  kind = "slash" as const;

  async run(context: CommandContext): Promise<void> {
    await context.reply("pong");
  }
}

describe("command registration", () => {
  test("publishes the same tree globally and to a guild", async () => {
    class BanCommand extends Command {
      name = "ban";
      description = "Ban a member";
      kind = "slash" as const;
      run(): void {}
    }
    class ModerationGroup extends CommandGroup {
      name = "moderation";
      description = "Moderation commands";
      children = [BanCommand];
    }
    class AdminGroup extends CommandGroup {
      name = "admin";
      description = "Admin commands";
      contexts = [InteractionContextType.Guild];
      integrationTypes = [ApplicationIntegrationType.GuildInstall];
      children = [ModerationGroup];
    }
    const host = makeHost();
    const manager = new CommandManager(host).register(new AdminGroup(), new PingCommand());

    await manager.publish();
    await manager.publish({ scope: "guild", guildId: "90000000000000000" });

    expect(host.requests.map((request) => request.path)).toEqual([
      `/applications/${APPLICATION_ID}/commands`,
      `/applications/${APPLICATION_ID}/guilds/90000000000000000/commands`,
    ]);
    const body = host.requests[0]?.body as Array<{
      name: string;
      options?: Array<{ type: number; options?: Array<{ type: number }> }>;
    }>;
    expect(body[0]?.options?.[0]?.type).toBe(ApplicationCommandOptionType.SubcommandGroup);
    expect(body[0]?.options?.[0]?.options?.[0]?.type).toBe(
      ApplicationCommandOptionType.Subcommand,
    );
    expect(body[0]).toMatchObject({ contexts: [0], integration_types: [0] });
    const guildBody = host.requests[1]?.body as Array<Record<string, unknown>>;
    expect(guildBody[0]?.contexts).toBeUndefined();
    expect(guildBody[0]?.integration_types).toBeUndefined();
    expect(manager.isFrozen).toBe(true);
    expect(() => manager.register(new PingCommand())).toThrow(RegistrationFrozenError);
  });

  test("kind is validated fail-fast at registration", () => {
    class AliasedSlash extends Command {
      name = "aliased";
      description = "Slash with aliases";
      kind = "slash" as const;
      aliases = ["nope"];
      run(): void {}
    }
    class DeferringPrefix extends Command {
      name = "deferring";
      description = "Prefix with autoDefer";
      kind = "prefix" as const;
      autoDefer = true;
      run(): void {}
    }
    class AutocompletingPrefix extends Command {
      name = "searching";
      description = "Prefix with autocomplete";
      kind = "prefix" as const;
      query = option.string({ description: "Query", autocomplete: true });
      run(): void {}
    }
    class SlashChild extends Command {
      name = "one";
      description = "Slash child";
      kind = "slash" as const;
      run(): void {}
    }
    class PrefixChild extends Command {
      name = "two";
      description = "Prefix child";
      kind = "prefix" as const;
      run(): void {}
    }
    class MixedGroup extends CommandGroup {
      name = "mixed";
      description = "Mixed kinds";
      children = [SlashChild, PrefixChild];
    }

    expect(() => new CommandManager(makeHost()).register(new AliasedSlash())).toThrow(
      /aliases/,
    );
    expect(() => new CommandManager(makeHost()).register(new DeferringPrefix())).toThrow(
      /autoDefer/,
    );
    expect(() => new CommandManager(makeHost()).register(new AutocompletingPrefix())).toThrow(
      /autocomplete/,
    );
    expect(() => new CommandManager(makeHost()).register(new MixedGroup())).toThrow(
      /share one kind/,
    );
  });

  test("option field keys become wire names and must be valid", () => {
    class CamelCase extends Command {
      name = "camel";
      description = "Bad option key";
      kind = "slash" as const;
      targetUser = option.user({ description: "A user" });
      run(): void {}
    }
    class MissingDescription extends Command {
      name = "nodesc";
      description = "Option without a description";
      kind = "slash" as const;
      value = option.string();
      run(): void {}
    }

    expect(() => new CommandManager(makeHost()).register(new CamelCase())).toThrow(
      /lowercase/,
    );
    expect(() => new CommandManager(makeHost()).register(new MissingDescription())).toThrow(
      /description/,
    );
  });

  test("rejects duplicate names and invalid option order", () => {
    class One extends Command {
      name = "one";
      description = "First";
      kind = "hybrid" as const;
      aliases = ["single"];
      run(): void {}
    }
    class Two extends Command {
      name = "two";
      description = "Second";
      kind = "hybrid" as const;
      aliases = ["SINGLE"];
      run(): void {}
    }
    class Broken extends Command {
      name = "broken";
      description = "Broken options";
      kind = "slash" as const;
      first = option.string({ description: "Optional value" });
      second = option.string({ description: "Required value", required: true });
      run(): void {}
    }

    const manager = new CommandManager(makeHost()).register(new One());
    expect(() => manager.register(new Two())).toThrow(DuplicateCommandError);
    expect(() => new CommandManager(makeHost()).register(new Broken())).toThrow(
      CommandValidationError,
    );
  });

  test("freezes only when a registered command starts", async () => {
    const manager = new CommandManager(makeHost()).register(new PingCommand());

    expect((await manager.handle(slash("unknown").source)).status).toBe("ignored");
    class StatusCommand extends Command {
      name = "status";
      description = "Show status";
      kind = "slash" as const;
      run(): void {}
    }
    expect(() => manager.register(new StatusCommand())).not.toThrow();
    expect((await manager.handle(slash("ping").source)).status).toBe("completed");
    class LateCommand extends Command {
      name = "late";
      description = "Registered late";
      kind = "slash" as const;
      run(): void {}
    }
    expect(() => manager.register(new LateCommand())).toThrow(RegistrationFrozenError);
  });

  test("rejects command groups deeper than Discord supports", () => {
    class Leaf extends Command {
      name = "leaf";
      description = "Leaf command";
      kind = "slash" as const;
      run(): void {}
    }
    class Third extends CommandGroup {
      name = "third";
      description = "Third level";
      children = [Leaf];
    }
    class Second extends CommandGroup {
      name = "second";
      description = "Second level";
      children = [Third];
    }
    class Root extends CommandGroup {
      name = "root";
      description = "Root command";
      children = [Second];
    }

    expect(() => new CommandManager(makeHost()).register(new Root())).toThrow(
      CommandValidationError,
    );
  });

  test("applies Discord name, length, number, and total size rules", () => {
    class RockNRoll extends Command {
      name = "rock'n'roll";
      description = "A valid command name";
      kind = "slash" as const;
      run(): void {}
    }
    class BadLength extends Command {
      name = "badlength";
      description = "Bad string length";
      kind = "slash" as const;
      value = option.string({ description: "String value", maxLength: 0 });
      run(): void {}
    }
    class BadNumber extends Command {
      name = "badnumber";
      description = "Bad number range";
      kind = "slash" as const;
      value = option.number({ description: "Number value", maxValue: 2 ** 53 + 2 });
      run(): void {}
    }
    class TooLarge extends Command {
      name = "toolarge";
      description = "Large command";
      kind = "slash" as const;
      run(): void {}
    }
    const tooLarge = new TooLarge();
    Object.assign(
      tooLarge,
      Object.fromEntries(
        Array.from({ length: 25 }, (_, optionIndex) => [
          `option${optionIndex}`,
          option.string({
            description: "d".repeat(100),
            choices: Array.from({ length: 25 }, (_, choiceIndex) => ({
              name: `choice-${choiceIndex}`,
              value: `${optionIndex}-${choiceIndex}-${"v".repeat(20)}`,
            })),
          }),
        ]),
      ),
    );

    expect(() => new CommandManager(makeHost()).register(new RockNRoll())).not.toThrow();
    expect(() => new CommandManager(makeHost()).register(new BadLength())).toThrow(
      CommandValidationError,
    );
    expect(() => new CommandManager(makeHost()).register(new BadNumber())).toThrow(
      CommandValidationError,
    );
    expect(() => new CommandManager(makeHost()).register(tooLarge)).toThrow(
      CommandValidationError,
    );
  });

  test("rejects empty choices and localized option collisions", () => {
    class EmptyChoices extends Command {
      name = "emptychoices";
      description = "Empty choices";
      kind = "slash" as const;
      value = option.string({ description: "String value", choices: [], autocomplete: true });
      run(): void {}
    }
    class Localized extends Command {
      name = "localized";
      description = "Localized options";
      kind = "slash" as const;
      first = option.string({ description: "First option", nameLocalizations: { fr: "meme" } });
      second = option.string({ description: "Second option", nameLocalizations: { fr: "meme" } });
      run(): void {}
    }

    expect(() => new CommandManager(makeHost()).register(new EmptyChoices())).toThrow(
      CommandValidationError,
    );
    expect(() => new CommandManager(makeHost()).register(new Localized())).toThrow(
      CommandValidationError,
    );
  });
});

describe("command execution", () => {
  test("runs global, group, and leaf middleware in order and reads option fields", async () => {
    const order: string[] = [];
    class EchoCommand extends Command {
      name = "echo";
      description = "Echo text";
      kind = "slash" as const;
      middleware = [
        async (_context: CommandContext, next: () => Promise<void>) => {
          order.push("leaf before");
          await next();
          order.push("leaf after");
        },
      ];
      text = option.string({ description: "Text to echo", required: true });

      async run(context: CommandContext): Promise<void> {
        order.push(`run ${context.get(this.text)}`);
        await context.reply("done");
      }
    }
    class ToolsGroup extends CommandGroup {
      name = "tools";
      description = "Useful tools";
      middleware = [
        async (_context: CommandContext, next: () => Promise<void>) => {
          order.push("group before");
          await next();
          order.push("group after");
        },
      ];
      children = [EchoCommand];
    }
    const manager = new CommandManager(makeHost(), {
      middleware: [
        async (_context, next) => {
          order.push("global before");
          await next();
          order.push("global after");
        },
      ],
    }).register(new ToolsGroup());
    const { source, rest } = slash("tools", [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "echo",
        options: [
          { type: ApplicationCommandOptionType.String, name: "text", value: "hello" },
        ],
      },
    ]);

    const result = await manager.handle(source);

    expect(result.status).toBe("completed");
    expect(order).toEqual([
      "global before",
      "group before",
      "leaf before",
      "run hello",
      "leaf after",
      "group after",
      "global after",
    ]);
    expect(verbs(rest)).toEqual(["respond"]);
  });

  test("hydrates resolved users, channels, and roles into structures", async () => {
    const targetId = "81000000000000000";
    const roleId = "82000000000000000";
    const channelId = "83000000000000000";
    const seen: unknown[] = [];
    class InspectCommand extends Command {
      name = "inspect";
      description = "Inspect resolved options";
      kind = "slash" as const;
      target = option.user({ description: "A user", required: true });
      badge = option.role({ description: "A role" });
      place = option.channel({ description: "A channel" });
      pick = option.mentionable({ description: "A user or role" });

      async run(context: CommandContext): Promise<void> {
        const picked = context.get(this.pick);
        seen.push(
          context.get(this.target).user?.username,
          context.get(this.target).user,
          context.get(this.badge)?.role?.name,
          context.get(this.place)?.channel?.name,
          picked?.kind === "user" ? picked.user?.displayName : undefined,
        );
        await context.reply("ok");
      }
    }
    const { source } = slash(
      "inspect",
      [
        { type: ApplicationCommandOptionType.User, name: "target", value: targetId },
        { type: ApplicationCommandOptionType.Role, name: "badge", value: roleId },
        { type: ApplicationCommandOptionType.Channel, name: "place", value: channelId },
        { type: ApplicationCommandOptionType.Mentionable, name: "pick", value: targetId },
      ],
      {
        users: {
          [targetId]: {
            id: targetId,
            username: "target",
            discriminator: "0",
            global_name: "Target",
            avatar: null,
          },
        },
        roles: {
          [roleId]: {
            id: roleId,
            name: "Helpers",
            color: 0,
            colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
            hoist: false,
            icon: null,
            unicode_emoji: null,
            position: 1,
            permissions: "0",
            managed: false,
            mentionable: true,
            flags: 0,
          },
        },
        channels: {
          [channelId]: { id: channelId, type: ChannelType.GuildText, name: "general" },
        },
      },
    );

    const result = await new CommandManager(makeHost()).register(new InspectCommand()).handle(source);

    expect(result.status).toBe("completed");
    expect(seen[0]).toBe("target");
    expect(seen[1]).toBeInstanceOf(User);
    expect(seen[2]).toBe("Helpers");
    expect(seen[3]).toBe("general");
    expect(seen[4]).toBe("Target");
  });

  test("auto-defer makes one initial acknowledgement", async () => {
    class SlowCommand extends Command {
      name = "slow";
      description = "Wait and reply";
      kind = "slash" as const;
      autoDefer = { afterMs: 0, ephemeral: true };

      async run(context: CommandContext): Promise<void> {
        await Bun.sleep(5);
        await context.reply({ content: "ready", flags: MessageFlags.Ephemeral });
      }
    }
    const { source, rest } = slash("slow");

    const result = await new CommandManager(makeHost()).register(new SlowCommand()).handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["defer", "editOriginal"]);
  });

  test("checks owners and permissions before execution", async () => {
    let ran = false;
    class SecureCommand extends Command {
      name = "secure";
      description = "Restricted command";
      kind = "slash" as const;
      ownerOnly = true;
      userPermissions = PermissionFlags.ManageGuild;
      botPermissions = PermissionFlags.SendMessages;

      run(): void {
        ran = true;
      }
    }
    const { ctx, rest } = makeContext();
    const source = createInteraction(
      {
        ...INTERACTION_BASE,
        member: {
          ...INTERACTION_BASE.member,
          user: rawUser("99999999999999999"),
        },
        type: InteractionType.ApplicationCommand,
        data: { id: "50000000000000000", name: "secure", type: ApplicationCommandType.ChatInput },
      },
      ctx,
    );

    const result = await new CommandManager(makeHost()).register(new SecureCommand()).handle(source);

    expect(result.status).toBe("rejected");
    expect((result as Extract<CommandHandleResult, { status: "rejected" }>).rejection.code).toBe(
      "owner_only",
    );
    expect(ran).toBe(false);
    expect(verbs(rest)).toEqual(["respond"]);
  });

  test("rejects middleware that calls next twice", async () => {
    const host = makeHost();
    class OnceCommand extends Command {
      name = "once";
      description = "Run once";
      kind = "slash" as const;
      middleware = [
        async (_context: CommandContext, next: () => Promise<void>) => {
          await next();
          await next();
        },
      ];
      run(): void {}
    }

    const result = await new CommandManager(host)
      .register(new OnceCommand())
      .handle(slash("once").source);

    expect(result.status).toBe("failed");
    expect(host.errors).toHaveLength(1);
  });

  test("lets middleware handle a command failure", async () => {
    const host = makeHost();
    class RecoverCommand extends Command {
      name = "recover";
      description = "Recover from a failure";
      kind = "slash" as const;
      middleware = [
        async (context: CommandContext, next: () => Promise<void>) => {
          try {
            await next();
          } catch {
            await context.reply("recovered");
          }
        },
      ];
      run(): void {
        throw new Error("failure");
      }
    }
    const { source, rest } = slash("recover");

    const result = await new CommandManager(host).register(new RecoverCommand()).handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["respond"]);
    expect(callbackData(rest)).toEqual({ content: "recovered" });
    expect(host.errors).toHaveLength(0);
  });

  test("auto-defers while a slow guard is running", async () => {
    class GuardedCommand extends Command {
      name = "guarded";
      description = "Wait for a guard";
      kind = "slash" as const;
      autoDefer = { afterMs: 0, ephemeral: true };
      guards = [
        async () => {
          await Bun.sleep(5);
          return false;
        },
      ];
      run(): void {}
    }
    const { source, rest } = slash("guarded");

    const result = await new CommandManager(makeHost()).register(new GuardedCommand()).handle(source);

    expect(result.status).toBe("rejected");
    expect(verbs(rest)).toEqual(["defer", "editOriginal"]);
  });

  test("keeps later ephemeral replies private", async () => {
    class TwiceCommand extends Command {
      name = "twice";
      description = "Reply twice";
      kind = "slash" as const;

      async run(context: CommandContext): Promise<void> {
        await context.reply("first");
        await context.reply({ content: "second", flags: MessageFlags.Ephemeral });
      }
    }
    const { source, rest } = slash("twice");

    const result = await new CommandManager(makeHost()).register(new TwiceCommand()).handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["respond", "followup"]);
    expect(rest.calls[1]?.body).toEqual({ content: "second", flags: 64 });
  });

  test("keeps errors private after a public defer", async () => {
    class DeferErrorCommand extends Command {
      name = "defererror";
      description = "Fail after deferring";
      kind = "slash" as const;
      autoDefer = { afterMs: 0, ephemeral: false };

      async run(): Promise<void> {
        await Bun.sleep(5);
        throw new Error("failure");
      }
    }
    const { source, rest } = slash("defererror");

    const result = await new CommandManager(makeHost())
      .register(new DeferErrorCommand())
      .handle(source);

    expect(result.status).toBe("failed");
    expect(verbs(rest)).toEqual(["defer", "deleteOriginal", "followup"]);
    expect(rest.calls[2]?.body).toEqual({
      content: "The command could not be completed.",
      flags: 64,
    });
  });

  test("rejects malformed slash option payloads", async () => {
    class RequiredCommand extends Command {
      name = "required";
      description = "Require a value";
      kind = "slash" as const;
      value = option.string({ description: "Required value", required: true });
      run(): void {}
    }
    const manager = new CommandManager(makeHost()).register(new RequiredCommand());

    const missing = await manager.handle(slash("required").source);
    const focused = await manager.handle(
      slash("required", [
        {
          type: ApplicationCommandOptionType.String,
          name: "value",
          value: "bad",
          focused: true,
        },
      ]).source,
    );

    expect(missing.status).toBe("rejected");
    expect(focused.status).toBe("rejected");
  });

  test("reports slash commands that finish without a response", async () => {
    const host = makeHost();
    class SilentCommand extends Command {
      name = "silent";
      description = "Forget to reply";
      kind = "slash" as const;
      run(): void {}
    }
    const { source, rest } = slash("silent");

    const result = await new CommandManager(host).register(new SilentCommand()).handle(source);

    expect(result.status).toBe("failed");
    expect(host.errors).toHaveLength(1);
    expect(verbs(rest)).toEqual(["respond"]);
    expect(callbackData(rest)).toEqual({
      content: "The command could not be completed.",
      flags: 64,
    });
  });

  test("resynchronizes after a direct interaction response", async () => {
    class DirectCommand extends Command {
      name = "direct";
      description = "Use both response paths";
      kind = "slash" as const;

      async run(context: CommandContext): Promise<void> {
        if (context.kind !== "slash") throw new Error("slash only");
        await context.interaction.respond("direct response");
        await context.reply({ content: "later response", flags: MessageFlags.Ephemeral });
      }
    }
    const { source, rest } = slash("direct");

    const result = await new CommandManager(makeHost()).register(new DirectCommand()).handle(source);

    expect(result.status).toBe("completed");
    expect(verbs(rest)).toEqual(["respond", "followup"]);
    expect(rest.calls[1]?.body).toEqual({ content: "later response", flags: 64 });
  });
});

describe("command listeners", () => {
  test("routes components to command-scoped handlers with derived ids", async () => {
    let received: readonly string[] = [];
    class ConfirmCommand extends Command {
      name = "confirmable";
      description = "Ask for confirmation";
      kind = "slash" as const;
      confirm = onButton(async (context, args) => {
        received = args;
        await context.update("Confirmed");
      });

      async run(context: CommandContext): Promise<void> {
        await context.reply("ready");
      }
    }
    const command = new ConfirmCommand();
    const manager = new CommandManager(makeHost()).register(command);

    const built = command.confirm.button({ label: "Go" }, "42", "yes");
    expect(built.custom_id).toBe("confirmable.confirm:42:yes");
    expect(built.type).toBe(ComponentType.Button);
    expect(() => command.confirm.button({}, "a:b")).toThrow(/cannot contain/);

    const { source, rest } = component("confirmable.confirm:42:yes");
    const result = await manager.handle(source);

    expect(result.status).toBe("completed");
    expect((result as Extract<CommandHandleResult, { status: "completed" }>).path).toEqual([
      "confirmable",
      "confirm",
    ]);
    expect(received).toEqual(["42", "yes"]);
    expect(verbs(rest)).toEqual(["update"]);
    expect(callbackData(rest)).toEqual({ content: "Confirmed" });
  });

  test("ignores unknown routes and mismatched listener kinds", async () => {
    class ModalCommand extends Command {
      name = "form";
      description = "Open a form";
      kind = "slash" as const;
      submit = onModal(async () => {});

      async run(context: CommandContext): Promise<void> {
        await context.reply("ready");
      }
    }
    const manager = new CommandManager(makeHost()).register(new ModalCommand());

    expect((await manager.handle(component("someone-elses-id").source)).status).toBe("ignored");
    expect((await manager.handle(component("form.missing:1").source)).status).toBe("ignored");
    // A button interaction must not trigger a modal listener.
    expect((await manager.handle(component("form.submit:1").source)).status).toBe("ignored");
  });
});

describe("prefix commands", () => {
  test("parses quotes, escapes, scalars, mentions, and async prefixes", async () => {
    let values: unknown[] = [];
    class EchoCommand extends Command {
      name = "echo";
      description = "Parse arguments";
      kind = "hybrid" as const;
      aliases = ["say"];
      text = option.string({ description: "Text value", required: true });
      count = option.integer({ description: "Repeat count", required: true });
      loud = option.boolean({ description: "Use uppercase", required: true });
      target = option.user({ description: "Target user", required: true });

      run(context: CommandContext): void {
        values = [
          context.get(this.text),
          context.get(this.count),
          context.get(this.loud),
          context.get(this.target).id,
        ];
      }
    }
    const manager = new CommandManager(makeHost(), {
      prefix: async () => ["!", "??"],
    }).register(new EchoCommand());

    const result = await manager.handle(
      message(`!say "hello world" 3 yes <@${OWNER_ID}>`).source,
    );

    expect(result.status).toBe("completed");
    expect(values).toEqual(["hello world", 3, true, OWNER_ID]);
    expect(tokenizePrefix("one two\\ three 'four five' \"\"")).toEqual([
      "one",
      "two three",
      "four five",
      "",
    ]);
    expect(tokenizePrefix("rock'n'roll")).toEqual(["rock'n'roll"]);
  });

  test("does nothing when prefix handling is not configured", async () => {
    let ran = false;
    class PrefixPing extends Command {
      name = "ping";
      description = "Check latency";
      kind = "prefix" as const;
      run(): void {
        ran = true;
      }
    }

    const result = await new CommandManager(makeHost())
      .register(new PrefixPing())
      .handle(message("!ping").source);

    expect(result.status).toBe("ignored");
    expect(ran).toBe(false);
  });

  test("loads permission data only after a prefix command matches", async () => {
    let permissionLoads = 0;
    class SecureCommand extends Command {
      name = "secure";
      description = "Check permissions";
      kind = "prefix" as const;
      userPermissions = PermissionFlags.ViewChannel;
      run(): void {}
    }
    const manager = new CommandManager(makeHost(), { prefix: "!" }).register(new SecureCommand());
    const options = {
      resolvePermissions: async () => {
        permissionLoads += 1;
        return { userPermissions: PermissionFlags.ViewChannel };
      },
    };

    expect((await manager.handle(message("hello").source, options)).status).toBe("ignored");
    expect(permissionLoads).toBe(0);
    expect((await manager.handle(message("!secure").source, options)).status).toBe("completed");
    expect(permissionLoads).toBe(1);
  });

  test("uses nested groups for prefix dispatch", async () => {
    let usedPath: readonly string[] = [];
    class BanCommand extends Command {
      name = "ban";
      description = "Ban a member";
      kind = "hybrid" as const;
      run(context: CommandContext): void {
        usedPath = context.path;
      }
    }
    class ModerationGroup extends CommandGroup {
      name = "moderation";
      description = "Moderation commands";
      aliases = ["mod"];
      children = [BanCommand];
    }
    class AdminGroup extends CommandGroup {
      name = "admin";
      description = "Admin commands";
      children = [ModerationGroup];
    }
    const manager = new CommandManager(makeHost(), { prefix: "!" }).register(new AdminGroup());

    const result = await manager.handle(message("!admin mod ban").source);

    expect(result.status).toBe("completed");
    expect(usedPath).toEqual(["admin", "moderation", "ban"]);
  });

  test("parses every mention option", async () => {
    let values: unknown[] = [];
    class MentionsCommand extends Command {
      name = "mentions";
      description = "Parse mentions";
      kind = "prefix" as const;
      user = option.user({ required: true });
      channel = option.channel({ required: true });
      role = option.role({ required: true });
      mentionable = option.mentionable({ required: true });

      run(context: CommandContext): void {
        values = [
          context.get(this.user).id,
          context.get(this.channel).id,
          context.get(this.role).id,
          context.get(this.mentionable),
        ];
      }
    }
    const manager = new CommandManager(makeHost(), { prefix: "!" }).register(
      new MentionsCommand(),
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

describe("cooldowns and autocomplete", () => {
  test("keeps memory cooldowns bounded without dropping active entries", () => {
    const store = new MemoryCooldownStore({ maxEntries: 1, sweepIntervalMs: 0 });
    expect(store.consume({ key: "one", limit: 1, windowMs: 100, now: 0 }).allowed).toBe(true);
    expect(store.consume({ key: "one", limit: 1, windowMs: 100, now: 1 }).allowed).toBe(false);
    const saturated = store.consume({ key: "two", limit: 1, windowMs: 100, now: 2 });
    expect(saturated.allowed).toBe(false);
    expect(saturated.saturated).toBe(true);
    expect(store.size).toBe(1);
    expect(store.consume({ key: "two", limit: 1, windowMs: 100, now: 100 }).allowed).toBe(true);
  });

  test("dispatches autocomplete to the selected leaf", async () => {
    class SearchCommand extends Command {
      name = "search";
      description = "Search records";
      kind = "slash" as const;
      query = option.string({ description: "Search text", autocomplete: true });

      run(): void {}

      override autocomplete(context: { focused: { value: string | number } }) {
        return [{ name: `Find ${context.focused.value}`, value: "result" }];
      }
    }
    const { source, rest } = autocompletion("search", [
      {
        type: ApplicationCommandOptionType.String,
        name: "query",
        value: "eu",
        focused: true,
      },
    ]);

    const result = await new CommandManager(makeHost()).register(new SearchCommand()).handle(source);

    expect(result.status).toBe("autocomplete");
    expect(verbs(rest)).toEqual(["autocomplete"]);
    expect(callbackData(rest)).toEqual({ choices: [{ name: "Find eu", value: "result" }] });
  });

  test("applies command cooldowns through the injected store", async () => {
    let runs = 0;
    class LimitedCommand extends Command {
      name = "limited";
      description = "Limited command";
      kind = "slash" as const;
      rateLimit = { limit: 1, windowMs: 10_000, scope: "user" as const };

      async run(context: CommandContext): Promise<void> {
        runs += 1;
        await context.reply("done");
      }
    }
    const manager = new CommandManager(makeHost(), {
      cooldownStore: new MemoryCooldownStore(),
    }).register(new LimitedCommand());

    const first = await manager.handle(slash("limited").source);
    const second = await manager.handle(slash("limited").source);

    expect(first.status).toBe("completed");
    expect(second.status).toBe("rejected");
    expect((second as Extract<CommandHandleResult, { status: "rejected" }>).rejection.code).toBe(
      "cooldown",
    );
    expect(runs).toBe(1);
  });

  test("rejects invalid autocomplete choice values", async () => {
    class IntegerSearch extends Command {
      name = "integersearch";
      description = "Search integers";
      kind = "slash" as const;
      query = option.integer({ description: "Number to find", autocomplete: true });

      run(): void {}

      override autocomplete() {
        return [{ name: "Fraction", value: 1.5 }];
      }
    }
    const { source, rest } = autocompletion("integersearch", [
      {
        type: ApplicationCommandOptionType.Integer,
        name: "query",
        value: 1,
        focused: true,
      },
    ]);

    const result = await new CommandManager(makeHost()).register(new IntegerSearch()).handle(source);

    expect(result.status).toBe("failed");
    expect(verbs(rest)).toEqual(["autocomplete"]);
    expect(callbackData(rest)).toEqual({ choices: [] });
  });

  test("answers autocomplete before a slow guard finishes", async () => {
    let guardKind = "";
    class SlowSearch extends Command {
      name = "slowsearch";
      description = "Search after a guard";
      kind = "slash" as const;
      query = option.string({ description: "Search text", autocomplete: true });
      guards = [
        async (context: { kind: string }) => {
          guardKind = context.kind;
          await Bun.sleep(5);
          return true;
        },
      ];

      run(): void {}

      override autocomplete() {
        return [{ name: "Late", value: "late" }];
      }
    }
    const { source, rest } = autocompletion("slowsearch", [
      {
        type: ApplicationCommandOptionType.String,
        name: "query",
        value: "eu",
        focused: true,
      },
    ]);

    const result = await new CommandManager(makeHost(), { autocompleteTimeoutMs: 0 })
      .register(new SlowSearch())
      .handle(source);

    expect(result.status).toBe("autocomplete");
    expect(guardKind).toBe("autocomplete");
    expect(verbs(rest)).toEqual(["autocomplete"]);
    expect(callbackData(rest)).toEqual({ choices: [] });
  });

  test("fails closed when a cooldown store returns malformed data", async () => {
    const host = makeHost();
    class StoredCommand extends Command {
      name = "stored";
      description = "Use an external cooldown";
      kind = "slash" as const;
      rateLimit = { limit: 1, windowMs: 1_000 };

      async run(context: CommandContext): Promise<void> {
        await context.reply("done");
      }
    }
    const manager = new CommandManager(host, {
      cooldownStore: {
        consume: () =>
          ({ allowed: "yes", remaining: Number.NaN, resetAt: Number.NaN } as unknown as {
            allowed: boolean;
            remaining: number;
            resetAt: number;
          }),
      },
    }).register(new StoredCommand());

    const result = await manager.handle(slash("stored").source);

    expect(result.status).toBe("failed");
    expect(host.errors).toHaveLength(1);
  });
});
