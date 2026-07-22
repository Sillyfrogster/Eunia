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
  type VoiceState,
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

  test("maps current channel, voice, soundboard, and rate-limit dispatches", () => {
    const channelInfo = {
      guild_id: "1",
      channels: [{ id: "2", status: "Town hall", voice_start_time: 1_753_075_200 }],
    } satisfies GatewayDispatchMap["CHANNEL_INFO"];
    const voiceState = {
      channel_id: "2",
      user_id: "3",
      session_id: "session",
      deaf: false,
      mute: false,
      self_deaf: false,
      self_mute: false,
      self_video: false,
      suppress: false,
      request_to_speak_timestamp: null,
    } satisfies VoiceState;
    const sounds = {
      guild_id: "1",
      soundboard_sounds: [{
        name: "Quack",
        sound_id: "4",
        volume: 1,
        emoji_id: null,
        emoji_name: "🦆",
        available: true,
      }],
    } satisfies GatewayDispatchMap["SOUNDBOARD_SOUNDS"];
    const limited = {
      opcode: 8,
      retry_after: 1.5,
      meta: { guild_id: "1", nonce: "members" },
    } satisfies GatewayDispatchMap["GATEWAY_RATE_LIMITED"];

    expect(channelInfo.channels[0]?.status).toBe("Town hall");
    expect(voiceState.channel_id).toBe("2");
    expect(sounds.soundboard_sounds[0]?.name).toBe("Quack");
    expect(limited.retry_after).toBe(1.5);
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
