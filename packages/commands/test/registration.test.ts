import { describe, expect, test } from "bun:test";
import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  PermissionFlags,
} from "@eunia/types";
import {
  CommandManager,
  CommandValidationError,
  DuplicateCommandError,
  EmptyCommandPublishError,
  RegistrationFrozenError,
  command,
  commandGroup,
  onButton,
  option,
  prefixCommand,
} from "../src";
import {
  APPLICATION_ID,
  makeHost,
  slash,
} from "./fixtures";

describe("command definitions", () => {
  test("rejects invalid prefix exposure instead of enabling it", () => {
    expect(() =>
      command({
        name: "invalidprefix",
        description: "Use an invalid prefix",
        prefix: false as never,
        run() {},
      }),
    ).toThrow(/prefix must be true or prefix settings/);
  });

  test("rejects malformed auto-defer settings before registration", () => {
    expect(() =>
      command({
        name: "invaliddefer",
        description: "Use invalid auto-defer settings",
        autoDefer: null as never,
        run() {},
      }),
    ).toThrow(/auto-defer settings must be a boolean or an object/);
    expect(() =>
      onButton(
        () => {},
        { autoDefer: "later" as never },
      ),
    ).toThrow(/auto-defer settings must be a boolean or an object/);
  });

  test("creates immutable definitions and keeps injected dependencies", async () => {
    const replies: string[] = [];
    const ping = command({
      name: "ping",
      description: "Check the bot",
      async run(context) {
        replies.push("ran");
        await context.reply("pong");
      },
    });
    const root = commandGroup({
      name: "tools",
      description: "Useful tools",
      children: [ping],
    });

    expect(Object.isFrozen(ping)).toBe(true);
    expect(Object.isFrozen(ping.options)).toBe(true);
    expect(Object.isFrozen(root.children)).toBe(true);
    expect(root.children[0]).toBe(ping);

    await new CommandManager(makeHost()).register(root).handle(
      slash("tools", [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "ping",
        },
      ]).source,
    );
    expect(replies).toEqual(["ran"]);
  });

  test("requires definitions created by the public factories", () => {
    expect(() =>
      new CommandManager(makeHost()).register({
        type: "chat",
        name: "fake",
      } as never),
    ).toThrow(/definition function/);
  });

  test("copies nested configuration before freezing it", () => {
    const permissions = [PermissionFlags.ManageGuild];
    const localizations = { "en-US": "search" };
    const choices = [
      {
        name: "Recent",
        nameLocalizations: { "en-US": "Recent" },
        value: "recent",
      },
    ];
    const search = command({
      name: "search",
      description: "Search records",
      access: { userPermissions: permissions },
      registration: { nameLocalizations: localizations },
      options: {
        order: option.string({
          description: "Sort order",
          choices,
        }),
      },
      run() {},
    });

    permissions.push(PermissionFlags.BanMembers);
    localizations["en-US"] = "changed";
    choices[0]!.name = "Changed";
    choices[0]!.nameLocalizations["en-US"] = "Changed";

    expect(search.access?.userPermissions).toEqual([
      PermissionFlags.ManageGuild,
    ]);
    expect(search.registration?.nameLocalizations?.["en-US"]).toBe(
      "search",
    );
    expect(search.options.order.config).toMatchObject({
      choices: [
        {
          name: "Recent",
          nameLocalizations: { "en-US": "Recent" },
          value: "recent",
        },
      ],
    });
    expect(
      Object.isFrozen(
        (
          search.options.order.config as {
            choices: readonly object[];
          }
        ).choices[0],
      ),
    ).toBe(true);
  });
});

describe("application command publication", () => {
  test("requires an explicit publish scope", async () => {
    const manager = new CommandManager(makeHost()).register(
      command({
        name: "ping",
        description: "Check the bot",
        run() {},
      }),
    );

    await expect(
      manager.publish(undefined as never),
    ).rejects.toThrow("explicit target");
    await expect(
      manager.publish({} as never),
    ).rejects.toThrow("scope");
    expect(manager.isFrozen).toBe(false);
  });

  test("publishes the same projected tree globally and to a guild", async () => {
    const ban = command({
      name: "ban",
      description: "Ban a member",
      run() {},
    });
    const legacy = prefixCommand({
      name: "legacy",
      description: "Run the legacy task",
      run() {},
    });
    const moderation = commandGroup({
      name: "moderation",
      description: "Moderation commands",
      children: [ban, legacy],
    });
    const admin = commandGroup({
      name: "admin",
      description: "Admin commands",
      registration: {
        contexts: [InteractionContextType.Guild],
        integrationTypes: [ApplicationIntegrationType.GuildInstall],
      },
      children: [moderation],
    });
    const host = makeHost();
    const manager = new CommandManager(host).register(admin);

    await manager.publish({ scope: "global" });
    await manager.publish({
      scope: "guild",
      guildId: "90000000000000000",
    });

    expect(host.requests.map((request) => request.path)).toEqual([
      `/applications/${APPLICATION_ID}/commands`,
      `/applications/${APPLICATION_ID}/guilds/90000000000000000/commands`,
    ]);
    const global = host.requests[0]?.body as Array<{
      contexts?: readonly number[];
      integration_types?: readonly number[];
      options?: Array<{ options?: Array<{ name: string }> }>;
    }>;
    expect(global[0]?.options?.[0]?.options?.map((entry) => entry.name)).toEqual([
      "ban",
    ]);
    expect(global[0]).toMatchObject({
      contexts: [InteractionContextType.Guild],
      integration_types: [ApplicationIntegrationType.GuildInstall],
    });
    const guild = host.requests[1]?.body as Array<Record<string, unknown>>;
    expect(guild[0]?.contexts).toBeUndefined();
    expect(guild[0]?.integration_types).toBeUndefined();
  });

  test("requires an explicit clear when no application commands exist", async () => {
    const host = makeHost();
    const legacy = prefixCommand({
      name: "Legacy",
      description: "Prefix only",
      run() {},
    });

    const manager = new CommandManager(host).register(legacy);

    await expect(
      manager.publish({ scope: "global" }),
    ).rejects.toBeInstanceOf(EmptyCommandPublishError);
    expect(host.requests).toHaveLength(0);
    expect(manager.isFrozen).toBe(false);

    await manager.clearPublishedCommands({ scope: "global" });
    expect(host.requests[0]?.body).toEqual([]);
  });

  test("freezes registration after publishing or recognized dispatch", async () => {
    const ping = command({
      name: "ping",
      description: "Check the bot",
      async run(context) {
        await context.reply("pong");
      },
    });
    const manager = new CommandManager(makeHost()).register(ping);

    expect((await manager.handle(slash("unknown").source)).status).toBe(
      "ignored",
    );
    expect(() =>
      manager.register(
        command({
          name: "status",
          description: "Show status",
          run() {},
        }),
      ),
    ).not.toThrow();

    await manager.handle(slash("ping").source);
    expect(manager.isFrozen).toBe(true);
    expect(() =>
      manager.register(
        command({
          name: "late",
          description: "Registered too late",
          run() {},
        }),
      ),
    ).toThrow(RegistrationFrozenError);
  });
});

describe("route projection", () => {
  test("allows chat-input, prefix-only, and dual-route children in one group", async () => {
    const chat = command({
      name: "chat",
      description: "Chat input only",
      run() {},
    });
    const both = command({
      name: "both",
      description: "Both routes",
      prefix: { aliases: ["b"] },
      run() {},
    });
    const prefix = prefixCommand({
      name: "prefix",
      description: "Prefix only",
      aliases: ["p"],
      run() {},
    });
    const mixed = commandGroup({
      name: "mixed",
      description: "Mixed commands",
      prefix: { aliases: ["m"] },
      children: [chat, both, prefix],
    });
    const host = makeHost();

    await new CommandManager(host, { prefix: "!" })
      .register(mixed)
      .publish({ scope: "global" });

    const body = host.requests[0]?.body as Array<{
      options: Array<{ name: string }>;
    }>;
    expect(body[0]?.options.map((entry) => entry.name)).toEqual([
      "chat",
      "both",
    ]);
  });

  test("checks duplicate names independently for each route", () => {
    const chat = command({
      name: "status",
      description: "Chat status",
      run() {},
    });
    const prefix = prefixCommand({
      name: "status",
      description: "Prefix status",
      run() {},
    });
    expect(() =>
      new CommandManager(makeHost(), { prefix: "!" }).register(chat, prefix),
    ).not.toThrow();

    const first = command({
      name: "one",
      description: "First",
      prefix: { aliases: ["single"] },
      run() {},
    });
    const second = prefixCommand({
      name: "two",
      description: "Second",
      aliases: ["SINGLE"],
      run() {},
    });
    expect(() =>
      new CommandManager(makeHost(), { prefix: "!" }).register(first, second),
    ).toThrow(DuplicateCommandError);
  });
});

describe("definition validation", () => {
  test("validates chat names, descriptions, and option order", () => {
    const badName = command({
      name: "CamelCase",
      description: "Invalid name",
      run() {},
    });
    const badDescription = command({
      name: "nodesc",
      description: "",
      run() {},
    });
    const badOptions = command({
      name: "broken",
      description: "Broken options",
      options: {
        first: option.string({ description: "Optional" }),
        second: option.string({
          description: "Required",
          required: true,
        }),
      },
      run() {},
    });

    for (const definition of [badName, badDescription, badOptions]) {
      expect(() =>
        new CommandManager(makeHost()).register(definition),
      ).toThrow(CommandValidationError);
    }
  });

  test("validates settings only against the route that uses them", () => {
    const prefix = prefixCommand({
      name: "Maintenance",
      description: "Run maintenance",
      options: {
        task: option.string(),
      },
      run() {},
    });
    expect(() =>
      new CommandManager(makeHost(), { prefix: "!" }).register(prefix),
    ).not.toThrow();

    const inertGroup = commandGroup({
      name: "legacy",
      description: "Legacy commands",
      registration: { contexts: [InteractionContextType.Guild] },
      children: [prefix],
    });
    expect(() =>
      new CommandManager(makeHost(), { prefix: "!" }).register(inertGroup),
    ).toThrow(/no chat-input commands/);
  });

  test("rejects malformed localization records", () => {
    const invalidLocalizations: unknown[] = [
      "en-US",
      [],
      null,
      { unknown: "ping" },
      { "en-US": 42 },
      { "en-US": undefined },
    ];

    for (const nameLocalizations of invalidLocalizations) {
      const definition = command({
        name: "localized",
        description: "Test localizations",
        registration: {
          nameLocalizations: nameLocalizations as never,
        },
        run() {},
      });

      expect(() =>
        new CommandManager(makeHost()).register(definition),
      ).toThrow(CommandValidationError);
    }
  });

  test("keeps application option metadata on dual routes", async () => {
    const host = makeHost();
    const search = command({
      name: "search",
      description: "Search records",
      prefix: true,
      options: {
        term: option.string({
          description: "Search term",
          nameLocalizations: { "en-US": "query" },
          descriptionLocalizations: {
            "en-US": "Query to search for",
          },
          autocomplete: () => [],
        }),
        channel: option.channel({
          description: "Channel to search",
          channelTypes: [ChannelType.GuildText],
        }),
        order: option.string({
          description: "Sort order",
          choices: [
            {
              name: "Recent",
              nameLocalizations: { "en-US": "Newest" },
              value: "recent",
            },
          ],
        }),
      },
      run() {},
    });

    await new CommandManager(host, { prefix: "!" })
      .register(search)
      .publish({ scope: "global" });

    const body = host.requests[0]?.body as Array<{
      options: Array<{
        autocomplete?: boolean;
        channel_types?: readonly ChannelType[];
        choices?: Array<{
          name_localizations?: Record<string, string>;
        }>;
        name: string;
        name_localizations?: Record<string, string>;
      }>;
    }>;
    expect(body[0]?.options).toEqual([
      expect.objectContaining({
        autocomplete: true,
        name: "term",
        name_localizations: { "en-US": "query" },
      }),
      expect.objectContaining({
        channel_types: [ChannelType.GuildText],
        name: "channel",
      }),
      expect.objectContaining({
        choices: [
          expect.objectContaining({
            name_localizations: { "en-US": "Newest" },
          }),
        ],
        name: "order",
      }),
    ]);
  });

  test("does not apply Discord text limits to prefix-only commands", () => {
    const choices = Array.from({ length: 26 }, (_, index) => ({
      name: `Choice ${index}`,
      value: `choice-${index}`,
    }));
    const legacy = prefixCommand({
      name: "long-prefix-command-name-that-exceeds-thirty-two-characters",
      description: "A".repeat(150),
      aliases: [
        "long-prefix-command-alias-that-exceeds-thirty-two-characters",
      ],
      options: {
        value: option.string({
          description: "A".repeat(150),
          choices,
          minLength: 6_001,
          maxLength: 7_000,
        }),
      },
      run() {},
    });

    expect(() =>
      new CommandManager(makeHost(), { prefix: "!" }).register(legacy),
    ).not.toThrow();
  });

  test("rejects application-only settings on prefix-only options", () => {
    const fields = [
      option.string({ autocomplete: () => [] }),
      option.string({
        nameLocalizations: { "en-US": "query" },
      }),
      option.string({
        descriptionLocalizations: {
          "en-US": "Search query",
        },
      }),
      option.channel({
        channelTypes: [ChannelType.GuildText],
      }),
      option.string({
        choices: [
          {
            name: "Recent",
            nameLocalizations: { "en-US": "Newest" },
            value: "recent",
          },
        ],
      }),
    ];

    for (const field of fields) {
      const definition = prefixCommand({
        name: "Search",
        description: "Search records",
        options: { value: field },
        run() {},
      });

      expect(() =>
        new CommandManager(makeHost(), { prefix: "!" }).register(
          definition,
        ),
      ).toThrow(/Prefix-only option/);
    }
  });

  test("validates listener response and rate-limit settings", () => {
    const invalidDefer = command({
      name: "invaliddefer",
      description: "Use an invalid listener defer",
      listeners: {
        click: onButton(
          () => {},
          {
            autoDefer: {
              afterMs: 0,
              ephemeral: true,
            } as never,
          },
        ),
      },
      run() {},
    });
    const invalidRateLimit = command({
      name: "invalidlistenerlimit",
      description: "Use an invalid listener limit",
      listeners: {
        click: onButton(
          () => {},
          {
            rateLimit: {
              limit: 0,
              windowMs: 1_000,
            },
          },
        ),
      },
      run() {},
    });

    expect(() =>
      new CommandManager(makeHost()).register(invalidDefer),
    ).toThrow(/cannot set visibility/);
    expect(() =>
      new CommandManager(makeHost()).register(invalidRateLimit),
    ).toThrow(/positive integer rate limit/);
  });

  test("enforces Discord depth only on the published projection", () => {
    const leaf = prefixCommand({
      name: "leaf",
      description: "Prefix leaf",
      run() {},
    });
    const third = commandGroup({
      name: "third",
      description: "Third level",
      children: [leaf],
    });
    const second = commandGroup({
      name: "second",
      description: "Second level",
      children: [third],
    });
    const root = commandGroup({
      name: "root",
      description: "Root level",
      children: [second],
    });

    expect(() =>
      new CommandManager(makeHost(), { prefix: "!" }).register(root),
    ).not.toThrow();

    const chat = command({
      name: "chat",
      description: "Chat leaf",
      run() {},
    });
    const invalid = commandGroup({
      name: "invalid",
      description: "Invalid depth",
      children: [
        commandGroup({
          name: "one",
          description: "One",
          children: [
            commandGroup({
              name: "two",
              description: "Two",
              children: [chat],
            }),
          ],
        }),
      ],
    });
    expect(() =>
      new CommandManager(makeHost()).register(invalid),
    ).toThrow(/nested more than one level/);
  });
});
