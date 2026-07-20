import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  AutoModerationActionType,
  ButtonStyle,
  ChannelType,
  ComponentType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  InteractionCallbackType,
  InteractionType,
  type ApplicationCommandCreate,
  type ApplicationCommandOption,
  type AutoModerationAction,
  type ButtonComponent,
  type ComponentEmoji,
  type DefaultReaction,
  type GatewayRateLimitedEvent,
  type GuildMemberUpdateEvent,
  type GuildScheduledEventCreate,
  type ForumTag,
  type Interaction,
  type InteractionResponse,
  type MessageActionRowComponent,
  type UnavailableGuild,
  type User,
} from "../src";

const user = {
  id: "1",
  username: "ada",
  discriminator: "0",
  global_name: "Ada",
  avatar: null,
} satisfies User;

const unicodeEmoji = { name: "🛠️" } satisfies ComponentEmoji;
const customEmoji = { id: "2", name: "tools" } satisfies ComponentEmoji;

const customDefaultReaction = {
  emoji_id: "2",
  emoji_name: null,
} satisfies DefaultReaction;

const tagWithoutEmoji = {
  id: "3",
  name: "Question",
  moderated: false,
  emoji_id: null,
  emoji_name: null,
} satisfies ForumTag;

// @ts-expect-error An emoji needs an ID or a name.
const emptyEmoji = {} satisfies ComponentEmoji;

// @ts-expect-error A default reaction uses either a custom or Unicode emoji.
const defaultReactionWithBoth = { emoji_id: "2", emoji_name: "🛠️" } satisfies DefaultReaction;

const customButton = {
  type: ComponentType.Button,
  style: ButtonStyle.Primary,
  custom_id: "approve",
} satisfies ButtonComponent;

const linkButton = {
  type: ComponentType.Button,
  style: ButtonStyle.Link,
  label: "Guide",
  url: "https://example.com/guide",
} satisfies ButtonComponent;

// @ts-expect-error Interactive buttons need a custom ID.
const missingCustomId = { type: ComponentType.Button, style: ButtonStyle.Primary } satisfies ButtonComponent;

// @ts-expect-error Link buttons cannot have a custom ID.
const linkWithCustomId = { type: ComponentType.Button, style: ButtonStyle.Link, custom_id: "guide", url: "https://example.com/guide" } satisfies ButtonComponent;

const selectRow = {
  type: ComponentType.ActionRow,
  components: [
    {
      type: ComponentType.ChannelSelect,
      custom_id: "channel",
      channel_types: [ChannelType.GuildText],
    },
  ],
} satisfies MessageActionRowComponent;

// @ts-expect-error A select menu must be the only item in its action row.
const mixedRow = { type: ComponentType.ActionRow, components: [customButton, selectRow.components[0]] } satisfies MessageActionRowComponent;

const chatInputCommand = {
  name: "inspect",
  description: "Inspect a resource.",
} satisfies ApplicationCommandCreate;

const userCommand = {
  type: ApplicationCommandType.User,
  name: "Inspect",
} satisfies ApplicationCommandCreate;

// @ts-expect-error Chat input commands need a description.
const commandWithoutDescription = { type: ApplicationCommandType.ChatInput, name: "inspect" } satisfies ApplicationCommandCreate;

// @ts-expect-error Context commands cannot contain options.
const contextCommandWithOptions = { type: ApplicationCommandType.User, name: "Inspect", options: [] } satisfies ApplicationCommandCreate;

// @ts-expect-error Only primary entry point commands accept a handler.
const chatInputWithHandler = { type: ApplicationCommandType.ChatInput, name: "inspect", description: "Inspect a resource.", handler: 1 } satisfies ApplicationCommandCreate;

const autocompleteOption = {
  type: ApplicationCommandOptionType.String,
  name: "query",
  description: "The query to complete.",
  autocomplete: true,
} satisfies ApplicationCommandOption;

// @ts-expect-error An option cannot use fixed choices and autocomplete together.
const choicesWithAutocomplete = { type: ApplicationCommandOptionType.String, name: "query", description: "The query to complete.", choices: [{ name: "one", value: "one" }], autocomplete: true } satisfies ApplicationCommandOption;

// @ts-expect-error A subcommand group can only contain subcommands.
const nestedSubcommandGroup = { type: ApplicationCommandOptionType.SubcommandGroup, name: "admin", description: "Administration commands.", options: [{ type: ApplicationCommandOptionType.SubcommandGroup, name: "nested", description: "Nested commands.", options: [] }] } satisfies ApplicationCommandOption;

// @ts-expect-error User selects do not accept channel filters.
const userSelectWithChannelTypes = { type: ComponentType.UserSelect, custom_id: "user", channel_types: [ChannelType.GuildText] } satisfies MessageActionRowComponent["components"][number];

const autocompleteResponse = {
  type: InteractionCallbackType.ApplicationCommandAutocompleteResult,
  data: { choices: [{ name: "one", value: "one" }] },
} satisfies InteractionResponse;

const modalResponse = {
  type: InteractionCallbackType.Modal,
  data: { custom_id: "profile", title: "Edit profile", components: [] },
} satisfies InteractionResponse;

// @ts-expect-error Modal responses need a title.
const modalWithoutTitle = { type: InteractionCallbackType.Modal, data: { custom_id: "profile", components: [] } } satisfies InteractionResponse;

// @ts-expect-error Autocomplete responses contain choices, not message content.
const autocompleteWithContent = { type: InteractionCallbackType.ApplicationCommandAutocompleteResult, data: { choices: [], content: "no" } } satisfies InteractionResponse;

// @ts-expect-error Pong callbacks do not contain response data.
const pongWithData = { type: InteractionCallbackType.Pong, data: {} } satisfies InteractionResponse;

const unavailableGuild = { id: "3", unavailable: true } satisfies UnavailableGuild;

// @ts-expect-error An unavailable guild uses the literal true marker.
const availableGuild = { id: "3", unavailable: false } satisfies UnavailableGuild;

const memberUpdate = {
  guild_id: "3",
  roles: [],
  user,
  avatar: null,
  banner: null,
  joined_at: null,
} satisfies GuildMemberUpdateEvent;

// @ts-expect-error Guild member update events do not include member flags.
const memberUpdateWithFlags = { ...memberUpdate, flags: 0 } satisfies GuildMemberUpdateEvent;

const alertAction = {
  type: AutoModerationActionType.SendAlertMessage,
  metadata: { channel_id: "4" },
} satisfies AutoModerationAction;

// @ts-expect-error Alert actions need a destination channel.
const alertWithoutMetadata = { type: AutoModerationActionType.SendAlertMessage } satisfies AutoModerationAction;

const externalScheduledEvent = {
  entity_type: GuildScheduledEventEntityType.External,
  entity_metadata: { location: "Community hall" },
  name: "Meetup",
  privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
  scheduled_start_time: "2026-08-01T16:00:00.000Z",
  scheduled_end_time: "2026-08-01T18:00:00.000Z",
} satisfies GuildScheduledEventCreate;

// @ts-expect-error External events need a location.
const externalEventWithoutLocation = { entity_type: GuildScheduledEventEntityType.External, name: "Meetup", privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly, scheduled_start_time: "2026-08-01T16:00:00.000Z", scheduled_end_time: "2026-08-01T18:00:00.000Z" } satisfies GuildScheduledEventCreate;

const gatewayRateLimit = {
  opcode: 8,
  retry_after: 12.5,
  meta: { guild_id: "3", nonce: "members-1" },
} satisfies GatewayRateLimitedEvent;

function narrowInteraction(interaction: Interaction): void {
  if (interaction.type === InteractionType.ModalSubmit) {
    interaction.data.components;
  }

  if (interaction.type === InteractionType.ApplicationCommand) {
    interaction.data.name;
  }

  if (interaction.type === InteractionType.Ping) {
    // @ts-expect-error Ping interactions do not contain command data.
    interaction.data.name;
  }
}

void unicodeEmoji;
void customEmoji;
void customDefaultReaction;
void tagWithoutEmoji;
void emptyEmoji;
void defaultReactionWithBoth;
void customButton;
void linkButton;
void missingCustomId;
void linkWithCustomId;
void selectRow;
void mixedRow;
void chatInputCommand;
void userCommand;
void commandWithoutDescription;
void contextCommandWithOptions;
void chatInputWithHandler;
void autocompleteOption;
void choicesWithAutocomplete;
void nestedSubcommandGroup;
void userSelectWithChannelTypes;
void autocompleteResponse;
void modalResponse;
void modalWithoutTitle;
void autocompleteWithContent;
void pongWithData;
void unavailableGuild;
void availableGuild;
void memberUpdate;
void memberUpdateWithFlags;
void alertAction;
void alertWithoutMetadata;
void externalScheduledEvent;
void externalEventWithoutLocation;
void gatewayRateLimit;
void narrowInteraction;
