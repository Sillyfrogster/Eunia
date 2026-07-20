import { describe, expect, test } from "bun:test";
import type { Client } from "@eunia/client";
import {
  defineEmbeds,
  defineModals,
  embedTemplates,
  modalTemplates,
} from "../src";

describe("template registries", () => {
  test("invokes a template with typed fills", () => {
    const embeds = defineEmbeds({
      error: (fills: { message: string }) => ({
        title: "Something went wrong",
        description: fills.message,
        color: 0xef4444,
      }),
      plain: () => ({ description: "static" }),
    });

    expect(embeds("error", { message: "boom" })).toEqual({
      title: "Something went wrong",
      description: "boom",
      color: 0xef4444,
    });
    expect(embeds.names).toEqual(["error", "plain"]);
  });

  test("an override key replaces that key entirely", () => {
    const embeds = defineEmbeds({
      error: (fills: { message: string }) => ({
        title: "Something went wrong",
        description: fills.message,
        fields: [{ name: "Code", value: "500" }],
      }),
    });

    const overridden = embeds(
      "error",
      { message: "boom" },
      { fields: [{ name: "Hint", value: "retry" }], color: 0x00ff00 },
    );

    expect(overridden.fields).toEqual([{ name: "Hint", value: "retry" }]);
    expect(overridden.color).toBe(0x00ff00);
    expect(overridden.title).toBe("Something went wrong");
  });

  test("unknown template names throw", () => {
    const embeds = defineEmbeds({ plain: () => ({ description: "static" }) });
    expect(() => (embeds as unknown as (name: string, fills: unknown) => unknown)("nope", {})).toThrow(
      /No embed template/,
    );
  });
});

describe("client wiring", () => {
  test("each domain module installs its own registry once", async () => {
    const client = {} as Client;
    const embeds = embedTemplates({
      error: (fills: { message: string }) => ({ description: fills.message }),
    });
    const modals = modalTemplates(
      defineModals({
        feedback: (fills: { title: string }) => ({
          title: fills.title,
          components: [],
        }),
      }),
    );

    await embeds.setup?.(client);
    await modals.setup?.(client);

    expect(client.embeds("error", { message: "boom" })).toEqual({ description: "boom" });
    expect(client.modals("feedback", { title: "Feedback" })).toEqual({
      title: "Feedback",
      components: [],
    });
    expect(client.components).toBeUndefined();
    await expect(async () => embeds.setup?.(client)).toThrow(/already has embeds/);
  });
});
