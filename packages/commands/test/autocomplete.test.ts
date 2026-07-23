import { describe, expect, test } from "bun:test";
import { ApplicationCommandOptionType } from "@eunia/types";
import {
  CommandManager,
  CommandValidationError,
  command,
  option,
} from "../src";
import {
  autocompletion,
  callbackData,
  makeHost,
  verbs,
} from "./fixtures";

describe("autocomplete", () => {
  test("dispatches to the focused option handler", async () => {
    const search = command({
      name: "search",
      description: "Search records",
      options: {
        query: option.string({
          description: "Search text",
          autocomplete: (context) => [
            {
              name: `Find ${context.focused.value}`,
              value: "result",
            },
          ],
        }),
      },
      run() {},
    });
    const { source, rest } = autocompletion("search", [
      {
        type: ApplicationCommandOptionType.String,
        name: "query",
        value: "eu",
        focused: true,
      },
    ]);

    const result = await new CommandManager(makeHost())
      .register(search)
      .handle(source);

    expect(result.status).toBe("autocomplete");
    expect(verbs(rest)).toEqual(["autocomplete"]);
    expect(callbackData(rest)).toEqual({
      choices: [{ name: "Find eu", value: "result" }],
    });
  });

  test("exposes other resolved option values to the handler", async () => {
    let category: unknown;
    const search = command({
      name: "search",
      description: "Search a category",
      options: {
        category: option.string({
          description: "Category",
          required: true,
        }),
        query: option.string({
          description: "Search text",
          autocomplete: (context) => {
            category = context.options.category;
            return [];
          },
        }),
      },
      run() {},
    });
    const { source } = autocompletion("search", [
      {
        type: ApplicationCommandOptionType.String,
        name: "category",
        value: "docs",
      },
      {
        type: ApplicationCommandOptionType.String,
        name: "query",
        value: "eu",
        focused: true,
      },
    ]);

    await new CommandManager(makeHost()).register(search).handle(source);

    expect(category).toBe("docs");
  });

  test("rejects choices with the wrong value type", async () => {
    const search = command({
      name: "integersearch",
      description: "Search integers",
      options: {
        query: option.integer({
          description: "Number to find",
          autocomplete: () => [
            {
              name: "Fraction",
              value: 1.5,
            },
          ],
        }),
      },
      run() {},
    });
    const { source, rest } = autocompletion("integersearch", [
      {
        type: ApplicationCommandOptionType.Integer,
        name: "query",
        value: 1,
        focused: true,
      },
    ]);

    const result = await new CommandManager(makeHost())
      .register(search)
      .handle(source);

    expect(result.status).toBe("failed");
    expect(callbackData(rest)).toEqual({ choices: [] });
  });

  test("answers before a slow access guard finishes", async () => {
    let guardKind = "";
    const search = command({
      name: "slowsearch",
      description: "Search after a guard",
      access: {
        guards: [
          async (context) => {
            guardKind = context.kind;
            await Bun.sleep(5);
            return true;
          },
        ],
      },
      options: {
        query: option.string({
          description: "Search text",
          autocomplete: () => [{ name: "Late", value: "late" }],
        }),
      },
      run() {},
    });
    const { source, rest } = autocompletion("slowsearch", [
      {
        type: ApplicationCommandOptionType.String,
        name: "query",
        value: "eu",
        focused: true,
      },
    ]);

    const result = await new CommandManager(makeHost(), {
      autocompleteTimeoutMs: 0,
    })
      .register(search)
      .handle(source);

    expect(result.status).toBe("autocomplete");
    expect(guardKind).toBe("autocomplete");
    expect(callbackData(rest)).toEqual({ choices: [] });
  });

  test("aborts autocomplete work at the response deadline", async () => {
    let aborted = false;
    const search = command({
      name: "cancelsearch",
      description: "Cancel a slow search",
      options: {
        query: option.string({
          description: "Search text",
          autocomplete: async (context) => {
            if (context.signal.aborted) {
              aborted = true;
              return [];
            }
            await new Promise<void>((resolve) => {
              context.signal.addEventListener(
                "abort",
                () => {
                  aborted = true;
                  resolve();
                },
                { once: true },
              );
            });
            return [];
          },
        }),
      },
      run() {},
    });
    const { source } = autocompletion("cancelsearch", [
      {
        type: ApplicationCommandOptionType.String,
        name: "query",
        value: "eu",
        focused: true,
      },
    ]);

    const result = await new CommandManager(makeHost(), {
      autocompleteTimeoutMs: 0,
    })
      .register(search)
      .handle(source);

    expect(result.status).toBe("autocomplete");
    expect(aborted).toBe(true);
  });

  test("rejects choices combined with autocomplete", () => {
    const invalid = command({
      name: "invalid",
      description: "Invalid autocomplete",
      options: {
        query: option.string({
          description: "Search text",
          choices: [{ name: "One", value: "one" }],
          autocomplete: () => [],
        } as never),
      },
      run() {},
    });

    expect(() =>
      new CommandManager(makeHost()).register(invalid),
    ).toThrow(CommandValidationError);
  });
});
