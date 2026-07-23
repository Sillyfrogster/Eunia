import { describe, expect, test } from "bun:test";
import { ComponentType, MessageFlags } from "@eunia/types";
import type * as types from "@eunia/types";
import {
  componentsV2,
  type ComponentsV2MessageOptions,
  type ComponentsV2RowChildren,
} from "../src";

const button: types.ButtonComponent = {
  type: ComponentType.Button,
  style: 1,
  custom_id: "approve",
  label: "Approve",
};

describe("Components V2 helpers", () => {
  test("builds a complete layout and sets the required flag", () => {
    const layout = componentsV2.container(
      [
        componentsV2.text("Release summary", { id: 1 }),
        componentsV2.section(
          ["Version 2.0", componentsV2.text("Ready to publish")],
          componentsV2.thumbnail("https://cdn.example.com/release.png", {
            description: "Release artwork",
          }),
        ),
        componentsV2.gallery([
          "https://cdn.example.com/one.png",
          {
            url: "https://cdn.example.com/two.png",
            description: "Second preview",
            spoiler: true,
          },
        ]),
        componentsV2.separator({ divider: true, spacing: 2 }),
        componentsV2.file("release-notes.txt", { spoiler: true }),
        componentsV2.row([button]),
      ],
      { accentColor: 0x5865f2, spoiler: false },
    );

    const message = componentsV2.message([layout], {
      flags: MessageFlags.SuppressNotifications,
      files: [{ data: new Uint8Array([1, 2, 3]), name: "release-notes.txt" }],
    });

    expect(message.flags).toBe(
      MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications,
    );
    expect(message.files).toHaveLength(1);
    expect(layout).toEqual({
      type: ComponentType.Container,
      accent_color: 0x5865f2,
      spoiler: false,
      components: [
        { type: ComponentType.TextDisplay, content: "Release summary", id: 1 },
        {
          type: ComponentType.Section,
          components: [
            { type: ComponentType.TextDisplay, content: "Version 2.0" },
            { type: ComponentType.TextDisplay, content: "Ready to publish" },
          ],
          accessory: {
            type: ComponentType.Thumbnail,
            media: { url: "https://cdn.example.com/release.png" },
            description: "Release artwork",
          },
        },
        {
          type: ComponentType.MediaGallery,
          items: [
            { media: { url: "https://cdn.example.com/one.png" } },
            {
              media: { url: "https://cdn.example.com/two.png" },
              description: "Second preview",
              spoiler: true,
            },
          ],
        },
        { type: ComponentType.Separator, divider: true, spacing: 2 },
        {
          type: ComponentType.File,
          file: { url: "attachment://release-notes.txt" },
          spoiler: true,
        },
        {
          type: ComponentType.ActionRow,
          components: [button],
        },
      ],
    });
  });

  test("builds select rows and preserves attachment URLs", () => {
    const select: types.MessageStringSelectComponent = {
      type: ComponentType.StringSelect,
      custom_id: "release",
      options: [{ label: "Stable", value: "stable" }],
    };

    expect(componentsV2.row([select])).toEqual({
      type: ComponentType.ActionRow,
      components: [select],
    });
    expect(componentsV2.file("attachment://report.pdf")).toEqual({
      type: ComponentType.File,
      file: { url: "attachment://report.pdf" },
    });
  });

  test("checks component-specific limits", () => {
    const thumbnail = componentsV2.thumbnail("https://cdn.example.com/thumb.png");

    expect(() => componentsV2.section([], thumbnail)).toThrow(/one and three/);
    expect(() => componentsV2.section(["1", "2", "3", "4"], thumbnail)).toThrow(
      /one and three/,
    );
    expect(() => componentsV2.gallery([])).toThrow(/one and ten/);
    expect(() =>
      componentsV2.gallery(Array.from({ length: 11 }, (_, index) => `https://x/${index}`)),
    ).toThrow(/one and ten/);
    expect(() => componentsV2.container([], { accentColor: -1 })).toThrow(/RGB integers/);
    expect(() => componentsV2.container([], { accentColor: 1.5 })).toThrow(/RGB integers/);
    expect(() => componentsV2.container([], { accentColor: 0x1000000 })).toThrow(
      /RGB integers/,
    );
    expect(() => componentsV2.thumbnail(" ")).toThrow(/cannot be empty/);
    expect(() => componentsV2.file("")).toThrow(/cannot be empty/);
    expect(() => componentsV2.file("attachment://")).toThrow(/cannot be empty/);
    expect(() => componentsV2.text("")).toThrow(/cannot be empty/);
    expect(() => componentsV2.text("x".repeat(4_001))).toThrow(/4000/);
    expect(() =>
      componentsV2.gallery([{ url: "https://x", description: "x".repeat(1_025) }]),
    ).toThrow(/1024/);
  });

  test("checks action rows and complete message payloads", () => {
    expect(() => componentsV2.row([])).toThrow(/one and five buttons/);
    expect(() => componentsV2.row(Array.from({ length: 6 }, () => button))).toThrow(
      /one and five buttons/,
    );
    expect(() =>
      componentsV2.row([button, componentsV2.text("wrong")] as unknown as ComponentsV2RowChildren),
    ).toThrow(/buttons or one select/);
    expect(() =>
      componentsV2.message(Array.from({ length: 41 }, () => componentsV2.text("item"))),
    ).toThrow(/40 components/);
    expect(() =>
      componentsV2.message(
        [componentsV2.text("item")],
        { content: "legacy" } as unknown as ComponentsV2MessageOptions,
      ),
    ).toThrow(/cannot include content/);
  });
});
