import { describe, expect, test } from "bun:test";
import {
  ApplicationCommandType,
  ComponentType,
  GuildMemberFlags,
  GuildScheduledEventRecurrenceFrequency,
  InteractionType,
  MessageFlags,
  PermissionFlags,
  type Interaction,
  type ModalSubmitInteractionData,
  type MessageCreate,
  type GatewayDispatchMap,
} from "../src";

describe("protocol constants", () => {
  test("keeps current permission positions", () => {
    expect(PermissionFlags.SetVoiceChannelStatus).toBe(1n << 48n);
    expect(PermissionFlags.PinMessages).toBe(1n << 51n);
    expect(PermissionFlags.BypassSlowmode).toBe(1n << 52n);
    expect(new Set(Object.values(PermissionFlags)).size).toBe(
      Object.values(PermissionFlags).length,
    );
  });

  test("keeps current component identifiers", () => {
    expect(ComponentType.Section).toBe(9);
    expect(ComponentType.Container).toBe(17);
    expect(ComponentType.FileUpload).toBe(19);
    expect(ComponentType.RadioGroup).toBe(21);
    expect(ComponentType.CheckboxGroup).toBe(22);
    expect(ComponentType.Checkbox).toBe(23);
    expect(MessageFlags.IsComponentsV2).toBe(1 << 15);
  });

  test("keeps current member and recurrence identifiers", () => {
    expect(GuildMemberFlags.AutoModQuarantinedUsername).toBe(1 << 7);
    expect(GuildMemberFlags.DMSettingsUpsellAcknowledged).toBe(1 << 9);
    expect(GuildScheduledEventRecurrenceFrequency.Yearly).toBe(0);
    expect(GuildScheduledEventRecurrenceFrequency.Daily).toBe(3);
  });
});

describe("protocol payloads", () => {
  test("models submitted modal values", () => {
    const data = {
      custom_id: "profile",
      components: [
        {
          type: ComponentType.Label,
          id: 1,
          component: {
            type: ComponentType.TextInput,
            id: 2,
            custom_id: "display-name",
            value: "Ada",
          },
        },
      ],
    } satisfies ModalSubmitInteractionData;

    expect(data.components[0]!.component.value).toBe("Ada");
  });

  test("models a component-driven message", () => {
    const message = {
      flags: MessageFlags.IsComponentsV2,
      components: [
        {
          type: ComponentType.Container,
          components: [
            { type: ComponentType.TextDisplay, content: "Build complete" },
          ],
        },
      ],
    } satisfies MessageCreate;

    expect(message.components[0]!.type).toBe(ComponentType.Container);
  });

  test("maps common gateway dispatch payloads", () => {
    const pollVote = {
      user_id: "1",
      channel_id: "2",
      message_id: "3",
      answer_id: 1,
    } satisfies GatewayDispatchMap["MESSAGE_POLL_VOTE_ADD"];

    expect(pollVote.answer_id).toBe(1);
  });

  test("keeps interaction command data typed", () => {
    const interaction = {
      id: "1",
      application_id: "2",
      type: InteractionType.ApplicationCommand,
      data: {
        id: "3",
        name: "ping",
        type: ApplicationCommandType.ChatInput,
      },
      token: "token",
      version: 1,
      entitlements: [],
      authorizing_integration_owners: {},
      attachment_size_limit: 10_000_000,
    } satisfies Interaction;

    expect(interaction.data.name).toBe("ping");
  });
});
